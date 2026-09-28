import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../server/db.js";
import * as schema from "../server/schema.js";
import { createProductionBrief, getProductionBrief, queueGeneration } from "../server/services/ugc-pipeline.js";

async function run() {
  const avatarResult = db.insert(schema.avatarProfiles).values({ workspaceId: 1, prompt: "test approved creator", seed: 901, pose: "front-facing selfie", wardrobe: "cream sweater", setting: "bright home", composition: "head and shoulders", imageUrl: "https://example.com/test-avatar.jpg", identityLock: 1, ageConfirmed: 1, status: "ready" }).run();
  const avatarId = Number(avatarResult.lastInsertRowid);
  const created = await createProductionBrief({ workspaceId: 1, title: "Test realistic UGC production", productName: "Test Ritual Set", productDescription: "A verified wellness product for a calmer daily reset.", productAssetUrl: "https://example.com/test-product.jpg", targetAudience: "wellness-minded adults", brandVoice: "warm and candid", objective: "drive qualified product visits", platform: "tiktok", aspectRatio: "9:16", durationSeconds: 20, style: "testimonial", avatarProfileId: avatarId });
  assert.equal(created.status, "script_ready");
  assert.equal(created.sceneCount, 4);
  const planned = getProductionBrief(created.briefId);
  assert.ok(planned?.promptManifest);
  assert.equal(planned?.promptManifest.model, "seedance-2-5");
  assert.match(planned?.scenes[0].visualPrompt || "", /Close-up/);
  const queued = queueGeneration(created.briefId);
  assert.equal(queued.status, "queued");
  assert.ok(queued.jobs >= 6);
  const final = getProductionBrief(created.briefId);
  assert.ok(final?.jobs.some((job) => job.kind === "video" && job.model === "seedance-2-5"));
  assert.ok(final?.jobs.some((job) => job.kind === "scene_image" && job.model === "gpt-image-2.5"));
  assert.ok(final?.assets.some((asset) => asset.kind === "avatar_reference" && asset.status === "ready"));

  db.delete(schema.ugcProductionAssets).where(eq(schema.ugcProductionAssets.briefId, created.briefId)).run();
  db.delete(schema.ugcGenerationJobs).where(eq(schema.ugcGenerationJobs.briefId, created.briefId)).run();
  db.delete(schema.ugcProductionScenes).where(eq(schema.ugcProductionScenes.briefId, created.briefId)).run();
  db.delete(schema.ugcProductionBriefs).where(eq(schema.ugcProductionBriefs.id, created.briefId)).run();
  db.delete(schema.avatarProfiles).where(eq(schema.avatarProfiles.id, avatarId)).run();
  console.log(JSON.stringify({ passed: true, scenes: created.sceneCount, queuedJobs: queued.jobs, videoModel: "seedance-2-5", imageModel: "gpt-image-2.5" }, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
