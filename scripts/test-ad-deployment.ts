import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db } from "../server/db.js";
import * as schema from "../server/schema.js";
import { deployCampaign } from "../server/services/ad-deployment.js";
import { eq } from "drizzle-orm";

const requests: Array<{ url: string; body: string }> = [];
const originalFetch = globalThis.fetch;
const email = "reviewed.lead@example.com";
const deploymentIds: number[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function bodyOf(init?: RequestInit) {
  if (!init?.body) return "";
  if (init.body instanceof URLSearchParams) return init.body.toString();
  return typeof init.body === "string" ? init.body : Buffer.from(init.body as ArrayBuffer).toString("utf8");
}

async function run() {
  process.env.META_MARKETING_ACCESS_TOKEN = "simulated-meta-token";
  process.env.GOOGLE_ADS_ACCESS_TOKEN = "simulated-google-token";
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "simulated-developer-token";
  process.env.GOOGLE_DATA_MANAGER_ACCESS_TOKEN = "simulated-data-manager-token";
  process.env.GOOGLE_DATA_MANAGER_PARENT = "accountTypes/GOOGLE_ADS/accounts/1234567890";
  process.env.GOOGLE_DATA_MANAGER_OPERATING_ACCOUNT_ID = "1234567890";
  process.env.GOOGLE_DATA_MANAGER_CUSTOMER_MATCH_TERMS_ACCEPTED = "true";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = bodyOf(init);
    requests.push({ url, body });
    if (url.includes("customaudiences") && init?.method === "POST") return jsonResponse({ id: "sim_meta_audience_123" });
    if (url.includes("/sim_meta_audience_123/users")) return jsonResponse({ audience_id: "sim_meta_audience_123", num_received: 1 });
    if (url.includes("/campaigns") && url.includes("facebook.com")) return jsonResponse({ id: "sim_meta_campaign_123" });
    if (url.includes("datamanager.googleapis.com") && url.endsWith("/userLists")) return jsonResponse({ name: "accountTypes/GOOGLE_ADS/accounts/1234567890/userLists/sim_google_audience_456", id: "sim_google_audience_456" });
    if (url.includes("audienceMembers:ingest")) return jsonResponse({ requestId: "sim_ingest_789" });
    if (url.includes("campaignBudgets:mutate")) return jsonResponse({ results: [{ resourceName: "customers/1234567890/campaignBudgets/11" }] });
    if (url.includes("googleads.googleapis.com") && url.includes("/campaigns:mutate")) return jsonResponse({ results: [{ resourceName: "customers/1234567890/campaigns/22" }] });
    throw new Error(`Unexpected simulated request: ${url}`);
  }) as typeof fetch;

  let jobId = 0;
  let candidateId = 0;
  try {
    const job = db.insert(schema.crawlJobs).values({ workspaceId: 1, domain: "example.com", rootUrl: "https://example.com", status: "ready", depthLimit: 4, pageLimit: 100 }).run();
    jobId = Number(job.lastInsertRowid);
    const candidate = db.insert(schema.emailCandidates).values({ jobId, email, sourceUrl: "https://example.com/contact", confidence: 99, audienceEligible: 1, eligibilityReason: "Simulated review approval", eligibleAt: new Date().toISOString() }).run();
    candidateId = Number(candidate.lastInsertRowid);
    db.insert(schema.emailVerifications).values({ candidateId, syntaxStatus: "valid", dnsStatus: "mx_found", smtpStatus: "accepted", finalStatus: "likely_valid", mxHost: "mx.example.com", reason: "Simulated SMTP acceptance" }).run();

    const base = { campaignName: "Simulation campaign", objective: "conversions" as const, budget: 100, destinationUrl: "https://example.com", approved: true as const, crawlJobId: jobId, audienceConsentApproved: true };
    await assert.rejects(() => deployCampaign({ ...base, provider: "meta", accountId: "act_123", audienceConsentApproved: false }), /Confirm that these leads are eligible/);
    const meta = await deployCampaign({ ...base, provider: "meta", accountId: "act_123" });
    const google = await deployCampaign({ ...base, provider: "google", accountId: "123-456-7890" });
    if (meta.deploymentId) deploymentIds.push(meta.deploymentId);
    if (google.deploymentId) deploymentIds.push(google.deploymentId);

    assert.equal(meta.externalCampaignId, "sim_meta_campaign_123");
    assert.equal(meta.audience?.audienceId, "sim_meta_audience_123");
    assert.equal(meta.audience?.memberCount, 1);
    assert.equal(google.externalCampaignId, "22");
    assert.equal(google.audience?.audienceId, "sim_google_audience_456");
    assert.equal(google.audience?.memberCount, 1);

    const rawEmailRequests = requests.filter((request) => request.body.includes(email));
    const expectedHash = crypto.createHash("sha256").update(email).digest("hex");
    assert.equal(rawEmailRequests.length, 0, "Raw email must never be sent to an ad provider");
    assert.ok(requests.some((request) => request.body.includes(expectedHash)), "SHA-256 email hash must be present in the audience payload");
    assert.ok(requests.some((request) => request.url.includes("customaudiences")));
    assert.ok(requests.some((request) => request.url.includes("audienceMembers:ingest")));
    assert.ok(requests.some((request) => request.url.includes("campaigns")));

    console.log(JSON.stringify({
      passed: true,
      meta: { campaignId: meta.externalCampaignId, audienceId: meta.audience?.audienceId, members: meta.audience?.memberCount },
      google: { campaignId: google.externalCampaignId, audienceId: google.audience?.audienceId, members: google.audience?.memberCount },
      simulatedRequests: requests.length,
      rawEmailTransmitted: rawEmailRequests.length,
      hashedEmailObserved: true,
    }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
    for (const deploymentId of deploymentIds) {
      db.delete(schema.campaignMetrics).where(eq(schema.campaignMetrics.deploymentId, deploymentId)).run();
      db.delete(schema.adDeployments).where(eq(schema.adDeployments.id, deploymentId)).run();
    }
    if (candidateId) {
      db.delete(schema.emailVerifications).where(eq(schema.emailVerifications.candidateId, candidateId)).run();
      db.delete(schema.emailCandidates).where(eq(schema.emailCandidates.id, candidateId)).run();
    }
    if (jobId) db.delete(schema.crawlJobs).where(eq(schema.crawlJobs.id, jobId)).run();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
