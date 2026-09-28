import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../schema.js";
import { generateUGCScript } from "./ugc-generator.js";

const styleMap: Record<string, string> = {
  testimonial: "authentic creator testimonial with direct-to-camera delivery",
  unboxing: "handheld unboxing with product detail and first reaction",
  tutorial: "clear step-by-step creator demonstration",
  review: "honest product review with balanced, conversational delivery",
  lifestyle: "natural daily-routine integration with soft observational B-roll",
  before_after: "clear before-and-after proof with a visible result",
  day_in_life: "casual day-in-the-life creator story",
  get_ready: "get-ready-with-me routine and product reveal",
  haul: "creator haul with quick product cuts and tactile detail",
  storytelling: "personal story with a product-led turning point",
};

function seconds(value: string | number | undefined, fallback = 4) { const match = String(value ?? "").match(/\d+/); return Math.max(2, Number(match?.[0] || fallback)); }
function avatarReference(avatar: any) { return avatar?.imageUrl || avatar?.referenceImageUrl || null; }

function buildPrompt(input: { brief: any; scene: any; avatar: any }) {
  const references = avatarReference(input.avatar) ? "The approved creator identity reference is supplied separately. Preserve the same face, hair, wardrobe, skin texture, and body proportions." : "No creator image reference is attached; keep the creator appearance generic and do not claim identity continuity.";
  return `${references}\nThe product is ${input.brief.productName}: ${input.brief.productDescription}. Preserve verified product shape, materials, proportions, labels, and colors; do not invent packaging details.\n\nStyle: realistic vertical social UGC, casual phone-camera footage, natural skin texture, available daylight, slight handheld motion, believable room ambience, no beauty filter, no poster typography.\nAudience: ${input.brief.targetAudience}. Brand voice: ${input.brief.brandVoice}. Objective: ${input.brief.objective}.\n\nShot ${input.scene.sceneOrder} — ${input.scene.beat}. Start with the stated framing, follow the camera direction, and end on the described visible result. ${input.scene.visualPrompt} Dialogue: ${input.scene.dialogue || "No dialogue; use natural product interaction sound."} On-screen text: ${input.scene.textOverlay || "No text overlay."} Camera: ${input.scene.cameraDirection} Sound: ${input.scene.soundDirection}. Keep movement and dialogue synchronized; no background music in the generated clip.`;
}

function manifestFor(brief: any, scenes: any[], avatar: any) {
  const refs = [avatarReference(avatar), brief.productAssetUrl].filter(Boolean);
  return { provider: "manus-native", model: "seedance-2-5", aspectRatio: brief.aspectRatio, durationSeconds: brief.durationSeconds, references: refs, audio: true, disclosure: "AI-generated virtual creator", promptRules: ["Use approved creator and product references", "Generate all compatible shots together", "Keep first two seconds active", "Preserve accurate product appearance", "Keep captions as a separate title layer"] };
}

export async function createProductionBrief(input: { workspaceId: number; title: string; productName: string; productDescription: string; productReferenceUrl?: string; productAssetUrl?: string; targetAudience: string; brandVoice: string; objective: string; platform: "instagram" | "tiktok" | "youtube_shorts" | "facebook"; aspectRatio?: string; durationSeconds: number; style: string; avatarProfileId?: number }) {
  const script = generateUGCScript({ productName: input.productName, productDescription: input.productDescription, style: input.style as any, platform: input.platform, duration: input.durationSeconds });
  const avatar = input.avatarProfileId ? db.query.avatarProfiles.findFirst({ where: eq(schema.avatarProfiles.id, input.avatarProfileId) }).sync() : null;
  const result = db.insert(schema.ugcProductionBriefs).values({ ...input, productReferenceUrl: input.productReferenceUrl || null, productAssetUrl: input.productAssetUrl || null, aspectRatio: input.aspectRatio || "9:16", scriptJson: JSON.stringify(script), status: "script_ready", disclosureRequired: 1 }).run();
  const briefId = Number(result.lastInsertRowid);
  const plannedScenes = script.scenes.map((scene: any, index: number) => ({ briefId, sceneOrder: index + 1, beat: index === 0 ? "HOOK" : index === script.scenes.length - 1 ? "CTA / CLOSE" : index === 1 ? "DETAIL" : "PROOF", durationSeconds: seconds(scene.duration), visualPrompt: scene.visual, dialogue: scene.dialogue, textOverlay: scene.textOverlay, cameraDirection: index === 0 ? "Enter while the creator is already moving; push from a medium selfie framing into a readable face-and-product close-up." : index === script.scenes.length - 1 ? "Pull back slightly to reveal the creator, product, and clear ending gesture; hold long enough to read the CTA." : "Use one purposeful handheld phone movement that follows the creator's hands or product, ending on the visible result.", soundDirection: "Synchronized dialogue, subtle handling sounds, and quiet room ambience; no added background music." }));
  for (const scene of plannedScenes) db.insert(schema.ugcProductionScenes).values(scene).run();
  const scenes = db.select().from(schema.ugcProductionScenes).where(eq(schema.ugcProductionScenes.briefId, briefId)).orderBy(schema.ugcProductionScenes.sceneOrder).all();
  db.update(schema.ugcProductionBriefs).set({ promptManifest: JSON.stringify(manifestFor({ ...input, aspectRatio: input.aspectRatio || "9:16", durationSeconds: input.durationSeconds }, scenes, avatar)), updatedAt: new Date().toISOString() }).where(eq(schema.ugcProductionBriefs.id, briefId)).run();
  return { briefId, script, sceneCount: scenes.length, status: "script_ready", provider: "manus-native", model: "seedance-2-5" };
}

export function listProductionBriefs(workspaceId = 1) { return db.select().from(schema.ugcProductionBriefs).where(eq(schema.ugcProductionBriefs.workspaceId, workspaceId)).orderBy(desc(schema.ugcProductionBriefs.updatedAt)).all().map((brief) => ({ ...brief, sceneCount: db.select().from(schema.ugcProductionScenes).where(eq(schema.ugcProductionScenes.briefId, brief.id)).all().length, jobCount: db.select().from(schema.ugcGenerationJobs).where(eq(schema.ugcGenerationJobs.briefId, brief.id)).all().length })); }

export function getProductionBrief(briefId: number) {
  const brief = db.query.ugcProductionBriefs.findFirst({ where: eq(schema.ugcProductionBriefs.id, briefId) }).sync();
  if (!brief) return null;
  const avatar = brief.avatarProfileId ? db.query.avatarProfiles.findFirst({ where: eq(schema.avatarProfiles.id, brief.avatarProfileId) }).sync() : null;
  return { ...brief, script: brief.scriptJson ? JSON.parse(brief.scriptJson) : null, promptManifest: brief.promptManifest ? JSON.parse(brief.promptManifest) : null, avatar, scenes: db.select().from(schema.ugcProductionScenes).where(eq(schema.ugcProductionScenes.briefId, briefId)).orderBy(schema.ugcProductionScenes.sceneOrder).all(), jobs: db.select().from(schema.ugcGenerationJobs).where(eq(schema.ugcGenerationJobs.briefId, briefId)).orderBy(desc(schema.ugcGenerationJobs.createdAt)).all(), assets: db.select().from(schema.ugcProductionAssets).where(eq(schema.ugcProductionAssets.briefId, briefId)).orderBy(desc(schema.ugcProductionAssets.createdAt)).all() };
}

export function queueGeneration(briefId: number) {
  const brief = db.query.ugcProductionBriefs.findFirst({ where: eq(schema.ugcProductionBriefs.id, briefId) }).sync();
  if (!brief) throw new Error("Production brief not found");
  const avatar = brief.avatarProfileId ? db.query.avatarProfiles.findFirst({ where: eq(schema.avatarProfiles.id, brief.avatarProfileId) }).sync() : null;
  const scenes = db.select().from(schema.ugcProductionScenes).where(eq(schema.ugcProductionScenes.briefId, briefId)).orderBy(schema.ugcProductionScenes.sceneOrder).all();
  db.delete(schema.ugcGenerationJobs).where(and(eq(schema.ugcGenerationJobs.briefId, briefId), eq(schema.ugcGenerationJobs.status, "queued"))).run();
  let jobs = 0;
  if (avatarReference(avatar)) { const job = db.insert(schema.ugcGenerationJobs).values({ briefId, kind: "avatar_reference", provider: "manus-native", model: "gpt-image-2.5", prompt: "Use the approved creator reference as the locked character master. Preserve face, hair, clothing, body proportions, natural skin texture, and identity. Create a clean, front-facing portrait reference for realistic UGC continuity.", referencesJson: JSON.stringify([avatarReference(avatar)]), aspectRatio: "2:3", status: "queued" }).run(); db.insert(schema.ugcProductionAssets).values({ briefId, jobId: Number(job.lastInsertRowid), kind: "avatar_reference", label: "Locked creator reference", assetUrl: avatarReference(avatar), status: "ready" }).run(); jobs++; }
  if (brief.productAssetUrl || brief.productReferenceUrl) { const refs = [brief.productAssetUrl, brief.productReferenceUrl].filter(Boolean); const job = db.insert(schema.ugcGenerationJobs).values({ briefId, kind: "product_reference", provider: "manus-native", model: "gpt-image-2.5", prompt: `Preserve the verified ${brief.productName} product design exactly. Create a clean product hero reference with accurate proportions, materials, packaging, label layout, cap, hardware, and colors.`, referencesJson: JSON.stringify(refs), aspectRatio: "1:1", status: "queued" }).run(); db.insert(schema.ugcProductionAssets).values({ briefId, jobId: Number(job.lastInsertRowid), kind: "product_reference", label: "Verified product reference", assetUrl: brief.productAssetUrl || brief.productReferenceUrl || null, status: brief.productAssetUrl ? "ready" : "pending" }).run(); jobs++; }
  for (const scene of scenes) { const prompt = buildPrompt({ brief, scene, avatar }); const job = db.insert(schema.ugcGenerationJobs).values({ briefId, sceneId: scene.id, kind: "scene_image", provider: "manus-native", model: "gpt-image-2.5", prompt, referencesJson: JSON.stringify([avatarReference(avatar), brief.productAssetUrl].filter(Boolean)), aspectRatio: brief.aspectRatio, durationSeconds: scene.durationSeconds, status: "queued" }).run(); db.insert(schema.ugcProductionAssets).values({ briefId, sceneId: scene.id, jobId: Number(job.lastInsertRowid), kind: "scene_image", label: `Scene ${scene.sceneOrder} reference frame`, status: "pending" }).run(); jobs++; }
  const videoPrompt = scenes.map((scene) => buildPrompt({ brief, scene, avatar })).join("\n\n");
  const videoJob = db.insert(schema.ugcGenerationJobs).values({ briefId, kind: "video", provider: "manus-native", model: "seedance-2-5", prompt: `${videoPrompt}\n\nGenerate all compatible shots together as one continuous ${styleMap[brief.style] || "realistic social UGC"} video. Maintain the same approved creator and product references across every shot.`, referencesJson: JSON.stringify([avatarReference(avatar), brief.productAssetUrl].filter(Boolean)), aspectRatio: brief.aspectRatio, durationSeconds: brief.durationSeconds, status: "queued" }).run(); db.insert(schema.ugcProductionAssets).values({ briefId, jobId: Number(videoJob.lastInsertRowid), kind: "video", label: `${brief.platform} master video`, status: "pending" }).run(); jobs++;
  db.update(schema.ugcProductionBriefs).set({ status: "queued", updatedAt: new Date().toISOString() }).where(eq(schema.ugcProductionBriefs.id, briefId)).run();
  return { briefId, jobs, provider: "manus-native", model: "seedance-2-5", status: "queued", note: "Generation manifest queued. Connect the native media worker to produce the final PNG/MP4 assets." };
}

export function approveProductionBrief(briefId: number) { const brief = db.query.ugcProductionBriefs.findFirst({ where: eq(schema.ugcProductionBriefs.id, briefId) }).sync(); if (!brief) throw new Error("Production brief not found"); db.update(schema.ugcProductionBriefs).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(schema.ugcProductionBriefs.id, briefId)).run(); db.update(schema.ugcProductionAssets).set({ status: "approved" }).where(eq(schema.ugcProductionAssets.briefId, briefId)).run(); return { success: true, disclosure: "AI-generated virtual creator" }; }
