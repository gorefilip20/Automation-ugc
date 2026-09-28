import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../schema.js";

function now() { return new Date().toISOString(); }
function dateKey(value = new Date()) { return value.toISOString().slice(0, 10); }
function asNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export function buildTrackedUrl(destinationUrl: string, provider: "meta" | "google", campaignName: string) {
  const url = new URL(destinationUrl);
  url.searchParams.set("utm_source", provider === "meta" ? "meta" : "google");
  url.searchParams.set("utm_medium", "paid");
  url.searchParams.set("utm_campaign", campaignName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80));
  url.searchParams.set("utm_content", "growth-os");
  return url.toString();
}

export function recordAdDeployment(input: { workspaceId: number; provider: "meta" | "google"; accountId: string; campaignName: string; externalCampaignId: string; externalResource?: string; audienceId?: string; destinationUrl: string; status: "paused" }, trackedUrl: string) {
  const result = db.insert(schema.adDeployments).values({ ...input, trackedUrl }).run();
  return Number(result.lastInsertRowid);
}

async function parseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Reporting API returned ${response.status}: ${body?.error?.message || JSON.stringify(body)}`);
  return body;
}

function upsertMetric(deployment: typeof schema.adDeployments.$inferSelect, metric: { metricDate: string; impressions?: number; reach?: number; clicks?: number; spend?: number; conversions?: number; ctr?: number; cpc?: number; raw?: unknown }) {
  const existing = db.select().from(schema.campaignMetrics).where(and(eq(schema.campaignMetrics.deploymentId, deployment.id), eq(schema.campaignMetrics.metricDate, metric.metricDate))).get();
  const values = { deploymentId: deployment.id, provider: deployment.provider, metricDate: metric.metricDate, impressions: Math.round(metric.impressions ?? 0), reach: Math.round(metric.reach ?? 0), clicks: Math.round(metric.clicks ?? 0), spend: String((metric.spend ?? 0).toFixed(2)), conversions: String((metric.conversions ?? 0).toFixed(2)), ctr: String((metric.ctr ?? 0).toFixed(4)), cpc: String((metric.cpc ?? 0).toFixed(2)), rawJson: metric.raw ? JSON.stringify(metric.raw) : null, syncedAt: now() };
  if (existing) db.update(schema.campaignMetrics).set(values).where(eq(schema.campaignMetrics.id, existing.id)).run();
  else db.insert(schema.campaignMetrics).values(values).run();
}

async function syncMeta(deployment: typeof schema.adDeployments.$inferSelect) {
  const token = process.env.META_MARKETING_ACCESS_TOKEN;
  if (!token) throw new Error("META_MARKETING_ACCESS_TOKEN is not configured");
  const version = process.env.META_MARKETING_API_VERSION || "v26.0";
  const fields = "campaign_id,campaign_name,date_start,date_stop,impressions,reach,clicks,spend,ctr,cpc,actions";
  const url = `https://graph.facebook.com/${version}/${deployment.externalCampaignId}/insights?fields=${encodeURIComponent(fields)}&time_increment=1&date_preset=last_30d&access_token=${encodeURIComponent(token)}`;
  const body = await parseJson(await fetch(url, { signal: AbortSignal.timeout(12_000) }));
  for (const row of body.data || []) {
    const conversions = (row.actions || []).filter((item: any) => ["purchase", "lead", "complete_registration", "offsite_conversion"].some((type) => String(item.action_type || "").includes(type))).reduce((sum: number, item: any) => sum + asNumber(item.value), 0);
    upsertMetric(deployment, { metricDate: row.date_start || dateKey(), impressions: asNumber(row.impressions), reach: asNumber(row.reach), clicks: asNumber(row.clicks), spend: asNumber(row.spend), conversions, ctr: asNumber(row.ctr) / 100, cpc: asNumber(row.cpc), raw: row });
  }
}

async function syncGoogle(deployment: typeof schema.adDeployments.$inferSelect) {
  const accessToken = process.env.GOOGLE_ADS_ACCESS_TOKEN;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!accessToken || !developerToken) throw new Error("Google Ads reporting credentials are not configured");
  const version = process.env.GOOGLE_ADS_API_VERSION || "v25";
  const customerId = deployment.accountId.replace(/-/g, "");
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}`, "developer-token": developerToken, "content-type": "application/json" };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, "");
  const query = `SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE campaign.id = ${deployment.externalCampaignId} AND segments.date DURING LAST_30_DAYS`;
  const body = await parseJson(await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`, { method: "POST", headers, body: JSON.stringify({ query }), signal: AbortSignal.timeout(12_000) }));
  const rows = Array.isArray(body) ? body.flatMap((chunk: any) => chunk.results || []) : body.results || [];
  for (const row of rows) {
    const metrics = row.metrics || {};
    upsertMetric(deployment, { metricDate: row.segments?.date || dateKey(), impressions: asNumber(metrics.impressions), clicks: asNumber(metrics.clicks), spend: asNumber(metrics.costMicros) / 1_000_000, conversions: asNumber(metrics.conversions), ctr: asNumber(metrics.ctr), cpc: asNumber(metrics.averageCpc) / 1_000_000, raw: row });
  }
}

export async function syncDeployment(deployment: typeof schema.adDeployments.$inferSelect) {
  if (deployment.provider === "meta") await syncMeta(deployment);
  else await syncGoogle(deployment);
  db.update(schema.adDeployments).set({ lastSyncedAt: now() }).where(eq(schema.adDeployments.id, deployment.id)).run();
  return { deploymentId: deployment.id, syncedAt: now() };
}

export function getAnalyticsOverview(workspaceId = 1) {
  const deployments = db.select().from(schema.adDeployments).where(eq(schema.adDeployments.workspaceId, workspaceId)).all();
  const metrics = deployments.flatMap((deployment) => db.select().from(schema.campaignMetrics).where(eq(schema.campaignMetrics.deploymentId, deployment.id)).all().map((metric) => ({ ...metric, campaignName: deployment.campaignName, externalCampaignId: deployment.externalCampaignId })));
  const totals = metrics.reduce((sum, metric) => ({ impressions: sum.impressions + metric.impressions, reach: sum.reach + metric.reach, clicks: sum.clicks + metric.clicks, spend: sum.spend + asNumber(metric.spend), conversions: sum.conversions + asNumber(metric.conversions) }), { impressions: 0, reach: 0, clicks: 0, spend: 0, conversions: 0 });
  return { totals: { ...totals, ctr: totals.impressions ? totals.clicks / totals.impressions : 0, cpc: totals.clicks ? totals.spend / totals.clicks : 0 }, deployments, metrics: metrics.sort((a, b) => b.metricDate.localeCompare(a.metricDate)).slice(0, 100), lastSyncedAt: deployments.map((item) => item.lastSyncedAt).filter(Boolean).sort().pop() || null };
}

let analyticsWorkerBusy = false;
async function syncAll() {
  if (analyticsWorkerBusy) return;
  analyticsWorkerBusy = true;
  try {
    const deployments = db.select().from(schema.adDeployments).all().filter((deployment) => deployment.status !== "completed");
    for (const deployment of deployments) {
      try { await syncDeployment(deployment); } catch (error) { console.warn(`Analytics sync failed for ${deployment.provider} ${deployment.externalCampaignId}:`, error instanceof Error ? error.message : error); }
    }
  } finally { analyticsWorkerBusy = false; }
}

export function startAnalyticsWorker() {
  void syncAll();
  setInterval(() => void syncAll(), 15 * 60 * 1000);
  console.log("Growth OS analytics worker ready (15-minute sync)");
}

export { syncAll };
