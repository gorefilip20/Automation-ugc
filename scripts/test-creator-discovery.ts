import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "../server/db.js";
import * as schema from "../server/schema.js";
import { discoverCreators, listCreators, scoreCreator, updateCreatorStatus, addCreatorNote } from "../server/services/creator-discovery.js";

async function run() {
  const niche = "ceramic coffee rituals test";
  const scored = scoreCreator({ name: "Test Creator", handle: "@test", platform: "instagram", niche, location: "London", bio: "ceramic coffee rituals for slow mornings", profileUrl: "https://example.com/test", followerCount: 22000, engagementRate: 7.5, avgViews: 30000, contactStatus: "discoverable" }, niche);
  assert.ok(scored.score >= 70);
  assert.equal(scored.reasons.length, 5);

  const discovery = await discoverCreators({ workspaceId: 1, niche, platforms: ["instagram", "tiktok", "youtube"], minFollowers: 1000 });
  assert.equal(discovery.source, "demo-public-signal");
  assert.ok(discovery.resultCount > 0);
  const creators = listCreators({ workspaceId: 1, niche });
  assert.equal(creators.length, discovery.resultCount);
  assert.ok(creators[0].fitScore >= creators[creators.length - 1].fitScore);
  const creatorId = creators[0].id;
  await updateCreatorStatus({ creatorId, status: "shortlisted" });
  await addCreatorNote({ creatorId, body: "Strong niche fit for the test brief." });
  const updated = listCreators({ workspaceId: 1, niche }).find((creator) => creator.id === creatorId);
  assert.equal(updated?.status, "shortlisted");
  assert.equal(updated?.notes, "Strong niche fit for the test brief.");

  for (const creator of creators) {
    db.delete(schema.creatorActivities).where(eq(schema.creatorActivities.creatorId, creator.id)).run();
    db.delete(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, creator.id)).run();
  }
  db.delete(schema.creatorDiscoveryJobs).where(and(eq(schema.creatorDiscoveryJobs.workspaceId, 1), eq(schema.creatorDiscoveryJobs.niche, niche))).run();
  console.log(JSON.stringify({ passed: true, discovered: discovery.resultCount, topScore: creators[0].fitScore, shortlistStatus: updated?.status }, null, 2));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
