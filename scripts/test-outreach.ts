import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../server/db.js";
import * as schema from "../server/schema.js";
import { addCreatorNote } from "../server/services/creator-discovery.js";
import { approveOutreach, createDrafts, createSequence, handleReply, sendOutreach, suppressEmail } from "../server/services/outreach.js";

async function run() {
  const creatorResult = db.insert(schema.creatorProfiles).values({
    workspaceId: 1,
    name: "Test Outreach Creator",
    handle: "@testoutreachcreator",
    platform: "instagram",
    niche: "slow wellness",
    location: "London",
    bio: "Test creator for outreach workflow",
    profileUrl: "https://example.com/test-outreach",
    followerCount: 12000,
    engagementRate: "7.20",
    avgViews: 15000,
    email: "creator-test@example.com",
    contactStatus: "discoverable",
    fitScore: 86,
    scoreReasons: "[]",
    status: "shortlisted",
    source: "test",
  }).run();
  const creatorId = Number(creatorResult.lastInsertRowid);
  const sequence = await createSequence({ workspaceId: 1, name: "Test outreach sequence", brandName: "Test Brand", productName: "Test Product", productCategory: "wellness", valueProp: "make daily rituals easier", offer: "a paid collaboration", senderName: "Test Sender", senderEmail: "sender@example.com", dailyLimit: 5 });
  const drafts = await createDrafts({ sequenceId: sequence.sequenceId, creatorIds: [creatorId] });
  assert.equal(drafts.created, 1);
  const draft = db.select().from(schema.creatorOutreach).where(eq(schema.creatorOutreach.sequenceId, sequence.sequenceId)).get();
  assert.ok(draft);
  assert.match(draft.subject, /Test Brand/);
  assert.match(draft.body, /Hi Test,/);
  assert.match(draft.body, /unsubscribe/);
  await approveOutreach({ outreachIds: [draft.id] });
  const delivered = await sendOutreach({ outreachId: draft.id });
  assert.equal(delivered.success, true);
  const sent = db.select().from(schema.creatorOutreach).where(eq(schema.creatorOutreach.id, draft.id)).get();
  assert.equal(sent?.status, "sent");
  assert.ok(sent?.threadId);
  const reply = handleReply({ threadId: sent!.threadId!, providerEventId: "provider_reply_1", body: "Interested — please send the brief." });
  assert.equal(reply.matched, true);
  const replied = db.select().from(schema.creatorOutreach).where(eq(schema.creatorOutreach.id, draft.id)).get();
  assert.equal(replied?.status, "replied");
  await suppressEmail({ email: "creator-test@example.com", source: "test" });
  assert.equal(db.select().from(schema.outreachSuppressions).where(eq(schema.outreachSuppressions.email, "creator-test@example.com")).get()?.email, "creator-test@example.com");

  db.delete(schema.outreachEvents).where(eq(schema.outreachEvents.outreachId, draft.id)).run();
  db.delete(schema.creatorOutreach).where(eq(schema.creatorOutreach.id, draft.id)).run();
  db.delete(schema.outreachSteps).where(eq(schema.outreachSteps.sequenceId, sequence.sequenceId)).run();
  db.delete(schema.outreachSequences).where(eq(schema.outreachSequences.id, sequence.sequenceId)).run();
  db.delete(schema.outreachSuppressions).where(eq(schema.outreachSuppressions.email, "creator-test@example.com")).run();
  db.delete(schema.creatorActivities).where(eq(schema.creatorActivities.creatorId, creatorId)).run();
  db.delete(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, creatorId)).run();
  console.log(JSON.stringify({ passed: true, createdDrafts: drafts.created, delivered: delivered.success, replyTracked: reply.matched }, null, 2));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
