import assert from "node:assert/strict";
import { db } from "../server/db.js";
import * as schema from "../server/schema.js";
import { and, eq } from "drizzle-orm";
import { buildTrackedUrl, getAnalyticsOverview, syncDeployment } from "../server/services/analytics.js";

const originalFetch = globalThis.fetch;
const deploymentIds: number[] = [];

function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }

async function run() {
  process.env.META_MARKETING_ACCESS_TOKEN = "simulated-meta-token";
  process.env.GOOGLE_ADS_ACCESS_TOKEN = "simulated-google-token";
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "simulated-developer-token";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("facebook.com") && url.includes("/insights")) return response({ data: [{ date_start: "2026-09-28", impressions: "1200", reach: "900", clicks: "48", spend: "72.00", ctr: "4", cpc: "1.50", actions: [{ action_type: "lead", value: "6" }] }] });
    if (url.includes("googleads.googleapis.com")) return response([{ results: [{ segments: { date: "2026-09-28" }, metrics: { impressions: "800", clicks: "32", costMicros: "40000000", conversions: 4, ctr: 0.04, averageCpc: "1250000" } }] }]);
    throw new Error(`Unexpected simulated reporting request: ${url}`);
  }) as typeof fetch;

  try {
    const metaUrl = buildTrackedUrl("https://example.com/shop", "meta", "Launch Sprint");
    assert.match(metaUrl, /utm_source=meta/);
    assert.match(metaUrl, /utm_medium=paid/);
    assert.match(metaUrl, /utm_campaign=launch-sprint/);

    const meta = db.insert(schema.adDeployments).values({ workspaceId: 1, provider: "meta", accountId: "act_123", campaignName: "Meta simulation", externalCampaignId: "meta_campaign_1", destinationUrl: "https://example.com/shop", trackedUrl: metaUrl, status: "paused" }).run();
    const google = db.insert(schema.adDeployments).values({ workspaceId: 1, provider: "google", accountId: "1234567890", campaignName: "Google simulation", externalCampaignId: "987654321", destinationUrl: "https://example.com/shop", trackedUrl: buildTrackedUrl("https://example.com/shop", "google", "Search Sprint"), status: "paused" }).run();
    deploymentIds.push(Number(meta.lastInsertRowid), Number(google.lastInsertRowid));

    await syncDeployment(db.query.adDeployments.findFirst({ where: eq(schema.adDeployments.id, deploymentIds[0]) }).sync()!);
    await syncDeployment(db.query.adDeployments.findFirst({ where: eq(schema.adDeployments.id, deploymentIds[1]) }).sync()!);

    const overview = getAnalyticsOverview(1);
    assert.equal(overview.totals.impressions, 2000);
    assert.equal(overview.totals.clicks, 80);
    assert.equal(overview.totals.conversions, 10);
    assert.equal(overview.totals.spend, 112);
    assert.equal(overview.metrics.length, 2);
    assert.ok(overview.lastSyncedAt);
    console.log(JSON.stringify({ passed: true, totals: overview.totals, metricRows: overview.metrics.length, trackedUrl: metaUrl }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
    for (const deploymentId of deploymentIds) {
      db.delete(schema.campaignMetrics).where(eq(schema.campaignMetrics.deploymentId, deploymentId)).run();
      db.delete(schema.adDeployments).where(eq(schema.adDeployments.id, deploymentId)).run();
    }
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
