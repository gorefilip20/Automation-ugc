import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { buildTrackedUrl, recordAdDeployment } from "./analytics.js";

export const deploymentInputSchema = z.object({
  provider: z.enum(["meta", "google"]),
  campaignName: z.string().min(1),
  objective: z.enum(["conversions", "traffic", "lead_generation", "awareness"]),
  budget: z.number().positive(),
  destinationUrl: z.string().url(),
  accountId: z.string().min(1),
  approved: z.literal(true),
  crawlJobId: z.number().int().positive().optional(),
  audienceConsentApproved: z.boolean().default(false),
  workspaceId: z.number().int().positive().default(1),
});

export type DeploymentInput = z.infer<typeof deploymentInputSchema>;

type AudienceResult = { provider: DeploymentInput["provider"]; audienceId: string; memberCount: number; message: string };
type DeploymentResult = { provider: DeploymentInput["provider"]; status: "paused"; externalCampaignId: string; externalResource?: string; audience?: AudienceResult; deploymentId?: number; trackedUrl?: string; message: string };

const META_OBJECTIVES: Record<DeploymentInput["objective"], string> = { conversions: "OUTCOME_SALES", traffic: "OUTCOME_TRAFFIC", lead_generation: "OUTCOME_LEADS", awareness: "OUTCOME_AWARENESS" };
function requiredEnv(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value; }
async function parseResponse(response: Response) { const body = await response.json().catch(() => ({})); if (!response.ok) { const detail = typeof body?.error?.message === "string" ? body.error.message : JSON.stringify(body); throw new Error(`Ad provider rejected the request (${response.status}): ${detail}`); } return body; }
function hashEmail(email: string) { return crypto.createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex"); }

function loadAudienceEmails(jobId: number) {
  const job = db.query.crawlJobs.findFirst({ where: eq(schema.crawlJobs.id, jobId) }).sync();
  if (!job || job.status !== "ready") throw new Error("The crawl must be ready before its leads can be used for an ad audience");
  const candidates = db.select().from(schema.emailCandidates).where(eq(schema.emailCandidates.jobId, jobId)).all();
  const eligible = candidates.filter((candidate) => {
    if (!candidate.audienceEligible) return false;
    const verification = db.query.emailVerifications.findFirst({ where: eq(schema.emailVerifications.candidateId, candidate.id) }).sync();
    return verification && ["verified", "likely_valid"].includes(verification.finalStatus);
  });
  if (!eligible.length) throw new Error("No verified leads are marked eligible for ad audience use");
  return [...new Set(eligible.map((candidate) => candidate.email.trim().toLowerCase()))];
}

async function createMetaAudience(input: DeploymentInput, emails: string[]): Promise<AudienceResult> {
  const token = requiredEnv("META_MARKETING_ACCESS_TOKEN");
  const apiVersion = process.env.META_MARKETING_API_VERSION || "v26.0";
  const accountId = input.accountId.replace(/^act_/, "");
  const name = `${input.campaignName} · verified leads`;
  const createBody = new URLSearchParams({ name, subtype: "CUSTOM", description: "Consent-eligible verified leads from Growth OS", customer_file_source: "USER_PROVIDED_ONLY", access_token: token });
  const audience = await parseResponse(await fetch(`https://graph.facebook.com/${apiVersion}/act_${accountId}/customaudiences`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: createBody }));
  const audienceId = String(audience.id || "");
  if (!audienceId) throw new Error("Meta did not return a custom audience ID");
  const batchSize = 10_000;
  const sessionId = crypto.randomInt(1, 9_000_000_000);
  for (let start = 0; start < emails.length; start += batchSize) {
    const batch = emails.slice(start, start + batchSize);
    const uploadBody = new URLSearchParams({ access_token: token, session: JSON.stringify({ session_id: sessionId, batch_seq: Math.floor(start / batchSize) + 1, last_batch_flag: start + batch.length >= emails.length, estimated_num_total: emails.length }), payload: JSON.stringify({ schema: "EMAIL_SHA256", data: batch.map((email) => [hashEmail(email)]) }) });
    await parseResponse(await fetch(`https://graph.facebook.com/${apiVersion}/${audienceId}/users`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: uploadBody }));
  }
  return { provider: "meta", audienceId, memberCount: emails.length, message: "Meta Custom Audience created from hashed, consent-eligible verified leads." };
}

async function createGoogleAudience(input: DeploymentInput, emails: string[]): Promise<AudienceResult> {
  const accessToken = process.env.GOOGLE_DATA_MANAGER_ACCESS_TOKEN || requiredEnv("GOOGLE_ADS_ACCESS_TOKEN");
  const parent = requiredEnv("GOOGLE_DATA_MANAGER_PARENT");
  const operatingAccountId = requiredEnv("GOOGLE_DATA_MANAGER_OPERATING_ACCOUNT_ID");
  const operatingAccountType = process.env.GOOGLE_DATA_MANAGER_OPERATING_ACCOUNT_TYPE || "GOOGLE_ADS";
  if (process.env.GOOGLE_DATA_MANAGER_CUSTOMER_MATCH_TERMS_ACCEPTED !== "true") throw new Error("Set GOOGLE_DATA_MANAGER_CUSTOMER_MATCH_TERMS_ACCEPTED=true after accepting Google Customer Match terms in the operating account");
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  const createResponse = await parseResponse(await fetch(`https://datamanager.googleapis.com/v1/${parent}/userLists`, { method: "POST", headers, body: JSON.stringify({ displayName: `${input.campaignName} · verified leads`, description: "Consent-eligible verified leads from Growth OS", membershipDuration: "2592000s", ingestedUserListInfo: { uploadKeyTypes: ["CONTACT_ID"], contactIdInfo: { dataSourceType: "DATA_SOURCE_TYPE_FIRST_PARTY" } } }) }));
  const audienceId = String(createResponse.id || createResponse.name?.split("/").pop() || "");
  if (!audienceId) throw new Error("Google Data Manager did not return a user-list ID");
  for (let start = 0; start < emails.length; start += 1_000) {
    const batch = emails.slice(start, start + 1_000);
    await parseResponse(await fetch("https://datamanager.googleapis.com/v1/audienceMembers:ingest", { method: "POST", headers, body: JSON.stringify({ destinations: [{ operatingAccount: { accountType: operatingAccountType, accountId: operatingAccountId }, productDestinationId: audienceId }], audienceMembers: batch.map((email) => ({ compositeData: { userData: { userIdentifiers: [{ emailAddress: hashEmail(email) }] } } })), consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_GRANTED" }, encoding: "HEX", termsOfService: { customerMatchTermsOfServiceStatus: "ACCEPTED" } }) }));
  }
  return { provider: "google", audienceId, memberCount: emails.length, message: "Google Customer Match audience created through Data Manager from hashed, consent-eligible verified leads." };
}

async function deployToMeta(input: DeploymentInput, audience?: AudienceResult): Promise<DeploymentResult> {
  const token = requiredEnv("META_MARKETING_ACCESS_TOKEN");
  const apiVersion = process.env.META_MARKETING_API_VERSION || "v26.0";
  const accountId = input.accountId.replace(/^act_/, "");
  const body = new URLSearchParams({ name: input.campaignName, objective: META_OBJECTIVES[input.objective], status: "PAUSED", special_ad_categories: "[]", access_token: token });
  const result = await parseResponse(await fetch(`https://graph.facebook.com/${apiVersion}/act_${accountId}/campaigns`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }));
  return { provider: "meta", status: "paused", externalCampaignId: String(result.id), audience, message: audience ? "Meta campaign created paused with a verified-lead Custom Audience ready for ad-set targeting." : "Meta campaign created paused. Ad set, creative, audience, and final approval are still required." };
}

async function deployToGoogle(input: DeploymentInput, audience?: AudienceResult): Promise<DeploymentResult> {
  const developerToken = requiredEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
  const accessToken = requiredEnv("GOOGLE_ADS_ACCESS_TOKEN");
  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v25";
  const customerId = input.accountId.replace(/-/g, "");
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${accessToken}`, "developer-token": developerToken };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  const budgetResult = await parseResponse(await fetch(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/campaignBudgets:mutate`, { method: "POST", headers, body: JSON.stringify({ operations: [{ create: { name: `${input.campaignName} budget`, amountMicros: String(Math.round(input.budget * 1_000_000)), deliveryMethod: "STANDARD" } }] }) }));
  const budgetResource = budgetResult.results?.[0]?.resourceName;
  if (!budgetResource) throw new Error("Google Ads did not return a campaign budget resource");
  const campaignResult = await parseResponse(await fetch(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/campaigns:mutate`, { method: "POST", headers, body: JSON.stringify({ operations: [{ create: { name: input.campaignName, campaignBudget: budgetResource, advertisingChannelType: "SEARCH", status: "PAUSED", manualCpc: {}, networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false, targetPartnerSearchNetwork: false } } }] }) }));
  const resourceName = campaignResult.results?.[0]?.resourceName;
  return { provider: "google", status: "paused", externalCampaignId: String(resourceName || "").split("/").pop() || "unknown", externalResource: resourceName, audience, message: audience ? "Google campaign created paused with a Customer Match audience ready for ad-group targeting." : "Google campaign and budget created paused. Ad groups, ads, keywords, conversion tracking, and final approval are still required." };
}

export function getAdDeploymentStatus() { return { meta: Boolean(process.env.META_MARKETING_ACCESS_TOKEN), google: Boolean(process.env.GOOGLE_ADS_ACCESS_TOKEN && process.env.GOOGLE_ADS_DEVELOPER_TOKEN), metaAudience: Boolean(process.env.META_MARKETING_ACCESS_TOKEN), googleAudience: Boolean((process.env.GOOGLE_DATA_MANAGER_ACCESS_TOKEN || process.env.GOOGLE_ADS_ACCESS_TOKEN) && process.env.GOOGLE_DATA_MANAGER_PARENT) }; }

export async function deployCampaign(input: DeploymentInput) {
  if (!input.approved) throw new Error("Explicit approval is required before deployment");
  let audience: AudienceResult | undefined;
  if (input.crawlJobId) {
    if (!input.audienceConsentApproved) throw new Error("Confirm that these leads are eligible for ad audience use before uploading them");
    const emails = loadAudienceEmails(input.crawlJobId);
    audience = input.provider === "meta" ? await createMetaAudience(input, emails) : await createGoogleAudience(input, emails);
  }
  const result = await (input.provider === "meta" ? deployToMeta(input, audience) : deployToGoogle(input, audience));
  const trackedUrl = buildTrackedUrl(input.destinationUrl, input.provider, input.campaignName);
  const deploymentId = recordAdDeployment({ workspaceId: input.workspaceId, provider: result.provider, accountId: input.accountId, campaignName: input.campaignName, externalCampaignId: result.externalCampaignId, externalResource: result.externalResource, audienceId: result.audience?.audienceId, destinationUrl: input.destinationUrl, status: result.status }, trackedUrl);
  return { ...result, deploymentId, trackedUrl };
}
