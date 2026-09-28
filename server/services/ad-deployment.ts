import { z } from "zod";

export const deploymentInputSchema = z.object({
  provider: z.enum(["meta", "google"]),
  campaignName: z.string().min(1),
  objective: z.enum(["conversions", "traffic", "lead_generation", "awareness"]),
  budget: z.number().positive(),
  destinationUrl: z.string().url(),
  accountId: z.string().min(1),
  approved: z.literal(true),
});

export type DeploymentInput = z.infer<typeof deploymentInputSchema>;

type DeploymentResult = {
  provider: DeploymentInput["provider"];
  status: "paused";
  externalCampaignId: string;
  externalResource?: string;
  message: string;
};

const META_OBJECTIVES: Record<DeploymentInput["objective"], string> = {
  conversions: "OUTCOME_SALES",
  traffic: "OUTCOME_TRAFFIC",
  lead_generation: "OUTCOME_LEADS",
  awareness: "OUTCOME_AWARENESS",
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.error?.message === "string" ? body.error.message : JSON.stringify(body);
    throw new Error(`Ad provider rejected the request (${response.status}): ${detail}`);
  }
  return body;
}

async function deployToMeta(input: DeploymentInput): Promise<DeploymentResult> {
  const token = requiredEnv("META_MARKETING_ACCESS_TOKEN");
  const apiVersion = process.env.META_MARKETING_API_VERSION || "v26.0";
  const accountId = input.accountId.replace(/^act_/, "");
  const body = new URLSearchParams({
    name: input.campaignName,
    objective: META_OBJECTIVES[input.objective],
    status: "PAUSED",
    special_ad_categories: "[]",
    access_token: token,
  });
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/act_${accountId}/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await parseResponse(response);
  return {
    provider: "meta",
    status: "paused",
    externalCampaignId: String(result.id),
    message: "Meta campaign created paused. Ad set, creative, audience, and final approval are still required.",
  };
}

async function deployToGoogle(input: DeploymentInput): Promise<DeploymentResult> {
  const developerToken = requiredEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
  const accessToken = requiredEnv("GOOGLE_ADS_ACCESS_TOKEN");
  const apiVersion = process.env.GOOGLE_ADS_API_VERSION || "v25";
  const customerId = input.accountId.replace(/-/g, "");
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");

  const budgetResponse = await fetch(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/campaignBudgets:mutate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ operations: [{ create: {
      name: `${input.campaignName} budget`,
      amountMicros: String(Math.round(input.budget * 1_000_000)),
      deliveryMethod: "STANDARD",
    } }] }),
  });
  const budgetResult = await parseResponse(budgetResponse);
  const budgetResource = budgetResult.results?.[0]?.resourceName;
  if (!budgetResource) throw new Error("Google Ads did not return a campaign budget resource");

  const campaignResponse = await fetch(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/campaigns:mutate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ operations: [{ create: {
      name: input.campaignName,
      campaignBudget: budgetResource,
      advertisingChannelType: "SEARCH",
      status: "PAUSED",
      manualCpc: {},
      networkSettings: {
        targetGoogleSearch: true,
        targetSearchNetwork: true,
        targetContentNetwork: false,
        targetPartnerSearchNetwork: false,
      },
    } }] }),
  });
  const campaignResult = await parseResponse(campaignResponse);
  const resourceName = campaignResult.results?.[0]?.resourceName;
  const externalCampaignId = String(resourceName || "").split("/").pop() || "unknown";
  return {
    provider: "google",
    status: "paused",
    externalCampaignId,
    externalResource: resourceName,
    message: "Google campaign and budget created paused. Ad groups, ads, keywords, conversion tracking, and final approval are still required.",
  };
}

export function getAdDeploymentStatus() {
  return {
    meta: Boolean(process.env.META_MARKETING_ACCESS_TOKEN),
    google: Boolean(process.env.GOOGLE_ADS_ACCESS_TOKEN && process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
  };
}

export async function deployCampaign(input: DeploymentInput) {
  if (!input.approved) throw new Error("Explicit approval is required before deployment");
  return input.provider === "meta" ? deployToMeta(input) : deployToGoogle(input);
}
