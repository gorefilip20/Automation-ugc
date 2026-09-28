import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../schema.js";

export type DeliveryAdapter = { send(input: { to: string; from: string; subject: string; body: string; threadId?: string }): Promise<{ providerMessageId: string; threadId: string }> };

const demoAdapter: DeliveryAdapter = { async send(input) { return { providerMessageId: `sim_msg_${Date.now()}`, threadId: input.threadId || `sim_thread_${Date.now()}` }; } };
function emailKey(email: string) { return email.trim().toLowerCase(); }
function tokens(value: string) { return value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2); }
function render(template: string, values: Record<string, string>) { return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => values[key] ?? ""); }
function addUnsubscribeFooter(body: string) { return `${body.trim()}\n\n—\nIf this is not relevant, reply “unsubscribe” and we’ll close the loop.`; }

export function personalizeDraft(input: { creator: { name: string; handle: string; niche: string; fitScore: number; notes?: string | null }; sequence: { brandName: string; productName: string; productCategory: string; valueProp: string; offer?: string | null; senderName: string; senderEmail: string }; step: { subjectTemplate: string; bodyTemplate: string } }) {
  const firstName = input.creator.name.split(" ")[0];
  const values = { firstName, creatorName: input.creator.name, handle: input.creator.handle, niche: input.creator.niche, fitScore: String(input.creator.fitScore), brandName: input.sequence.brandName, productName: input.sequence.productName, productCategory: input.sequence.productCategory, valueProp: input.sequence.valueProp, offer: input.sequence.offer || "a thoughtful collaboration", senderName: input.sequence.senderName };
  return { subject: render(input.step.subjectTemplate, values), body: addUnsubscribeFooter(render(input.step.bodyTemplate, values)) };
}

function isSuppressed(email: string) { return Boolean(db.select().from(schema.outreachSuppressions).where(eq(schema.outreachSuppressions.email, emailKey(email))).get()); }

export async function createSequence(input: { workspaceId: number; name: string; brandName: string; productName: string; productCategory: string; valueProp: string; offer?: string; senderName: string; senderEmail: string; dailyLimit?: number }) {
  const result = db.insert(schema.outreachSequences).values({ ...input, offer: input.offer || null, dailyLimit: input.dailyLimit ?? 25, status: "draft" }).run();
  const sequenceId = Number(result.lastInsertRowid);
  db.insert(schema.outreachSteps).values({ sequenceId, stepOrder: 1, delayHours: 0, subjectTemplate: "A thoughtful idea for {{handle}} × {{brandName}}", bodyTemplate: "Hi {{firstName}},\n\nI’ve been following {{handle}}’s work around {{niche}}, and your approach feels like a strong fit for {{brandName}}. We’re building {{productName}}, a {{productCategory}} designed to {{valueProp}}.\n\nWould you be open to exploring {{offer}}? I can send a concise brief with the idea, timing, and deliverables.\n\nBest,\n{{senderName}}" }).run();
  db.insert(schema.outreachSteps).values({ sequenceId, stepOrder: 2, delayHours: 96, subjectTemplate: "Re: a thoughtful idea for {{handle}} × {{brandName}}", bodyTemplate: "Hi {{firstName}},\n\nJust following up in case this got buried. The reason I reached out is that {{handle}}’s perspective on {{niche}} is unusually aligned with the story we want to tell for {{productName}}.\n\nHappy to share the one-page brief if useful.\n\nBest,\n{{senderName}}" }).run();
  return { sequenceId };
}

export function listSequences(workspaceId = 1) {
  return db.select().from(schema.outreachSequences).where(eq(schema.outreachSequences.workspaceId, workspaceId)).orderBy(desc(schema.outreachSequences.updatedAt)).all().map((sequence) => ({ ...sequence, steps: db.select().from(schema.outreachSteps).where(eq(schema.outreachSteps.sequenceId, sequence.id)).orderBy(schema.outreachSteps.stepOrder).all(), stats: getSequenceStats(sequence.id) }));
}

export function getSequenceStats(sequenceId: number) {
  const rows = db.select().from(schema.creatorOutreach).where(eq(schema.creatorOutreach.sequenceId, sequenceId)).all();
  return { total: rows.length, drafts: rows.filter((row) => row.status === "draft").length, queued: rows.filter((row) => row.status === "queued").length, sent: rows.filter((row) => row.status === "sent").length, replied: rows.filter((row) => row.status === "replied").length, optedOut: rows.filter((row) => row.status === "opted_out").length };
}

export function listOutreach(sequenceId: number) {
  return db.select().from(schema.creatorOutreach).where(eq(schema.creatorOutreach.sequenceId, sequenceId)).orderBy(desc(schema.creatorOutreach.createdAt)).all().map((row) => ({ ...row, creator: db.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.id, row.creatorId) }).sync() }));
}

export async function createDrafts(input: { sequenceId: number; creatorIds: number[] }) {
  const sequence = db.query.outreachSequences.findFirst({ where: eq(schema.outreachSequences.id, input.sequenceId) }).sync();
  if (!sequence) throw new Error("Outreach sequence not found");
  const step = db.select().from(schema.outreachSteps).where(and(eq(schema.outreachSteps.sequenceId, sequence.id), eq(schema.outreachSteps.stepOrder, 1))).get();
  if (!step) throw new Error("Outreach sequence has no first step");
  const creators = db.select().from(schema.creatorProfiles).where(inArray(schema.creatorProfiles.id, input.creatorIds)).all();
  let created = 0;
  for (const creator of creators) {
    if (!creator.email || creator.contactStatus === "opted_out" || isSuppressed(creator.email)) continue;
    const existing = db.select().from(schema.creatorOutreach).where(and(eq(schema.creatorOutreach.creatorId, creator.id), eq(schema.creatorOutreach.sequenceId, sequence.id), eq(schema.creatorOutreach.stepId, step.id))).get();
    if (existing) continue;
    const draft = personalizeDraft({ creator, sequence, step });
    db.insert(schema.creatorOutreach).values({ creatorId: creator.id, sequenceId: sequence.id, stepId: step.id, email: emailKey(creator.email), subject: draft.subject, body: draft.body, status: "draft" }).run();
    created++;
  }
  return { created, skipped: creators.length - created };
}

export async function approveOutreach(input: { outreachIds: number[]; scheduledAt?: string }) {
  const rows = db.select().from(schema.creatorOutreach).where(inArray(schema.creatorOutreach.id, input.outreachIds)).all();
  for (const row of rows) {
    if (isSuppressed(row.email)) {
      db.update(schema.creatorOutreach).set({ status: "opted_out", updatedAt: new Date().toISOString() }).where(eq(schema.creatorOutreach.id, row.id)).run();
      continue;
    }
    db.update(schema.creatorOutreach).set({ status: "queued", approvedAt: new Date().toISOString(), scheduledAt: input.scheduledAt || new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(schema.creatorOutreach.id, row.id)).run();
    db.insert(schema.outreachEvents).values({ outreachId: row.id, type: "queued", payload: JSON.stringify({ scheduledAt: input.scheduledAt || null }) }).run();
  }
  return { queued: rows.filter((row) => !isSuppressed(row.email)).length };
}

export async function sendOutreach(input: { outreachId: number; adapter?: DeliveryAdapter }) {
  const row = db.query.creatorOutreach.findFirst({ where: eq(schema.creatorOutreach.id, input.outreachId) }).sync();
  if (!row) throw new Error("Outreach draft not found");
  if (row.status !== "queued") throw new Error("Only approved queued outreach can be sent");
  if (isSuppressed(row.email)) {
    db.update(schema.creatorOutreach).set({ status: "opted_out", updatedAt: new Date().toISOString() }).where(eq(schema.creatorOutreach.id, row.id)).run();
    throw new Error("Recipient is suppressed");
  }
  try {
    const sequence = db.query.outreachSequences.findFirst({ where: eq(schema.outreachSequences.id, row.sequenceId) }).sync();
    if (!sequence) throw new Error("Sequence not found");
    const result = await (input.adapter || demoAdapter).send({ to: row.email, from: sequence.senderEmail, subject: row.subject, body: row.body, threadId: row.threadId || undefined });
    db.update(schema.creatorOutreach).set({ status: "sent", sentAt: new Date().toISOString(), providerMessageId: result.providerMessageId, threadId: result.threadId, updatedAt: new Date().toISOString() }).where(eq(schema.creatorOutreach.id, row.id)).run();
    db.insert(schema.outreachEvents).values({ outreachId: row.id, type: "sent", providerEventId: result.providerMessageId }).run();
    return { success: true, providerMessageId: result.providerMessageId, threadId: result.threadId };
  } catch (error) {
    db.update(schema.creatorOutreach).set({ status: "failed", lastError: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() }).where(eq(schema.creatorOutreach.id, row.id)).run();
    throw error;
  }
}

export function handleReply(input: { threadId: string; providerEventId?: string; body?: string }) {
  const row = db.query.creatorOutreach.findFirst({ where: eq(schema.creatorOutreach.threadId, input.threadId) }).sync();
  if (!row) return { matched: false };
  db.update(schema.creatorOutreach).set({ status: "replied", repliedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(schema.creatorOutreach.id, row.id)).run();
  db.insert(schema.outreachEvents).values({ outreachId: row.id, type: "reply", providerEventId: input.providerEventId || null, payload: JSON.stringify({ body: input.body || "" }) }).run();
  db.insert(schema.creatorActivities).values({ creatorId: row.creatorId, type: "replied", body: "Creator replied to outreach" }).run();
  return { matched: true, outreachId: row.id };
}

export function suppressEmail(input: { email: string; reason?: string; source?: string }) {
  const email = emailKey(input.email);
  if (!email.includes("@")) throw new Error("Valid email is required");
  const existing = db.select().from(schema.outreachSuppressions).where(eq(schema.outreachSuppressions.email, email)).get();
  if (!existing) db.insert(schema.outreachSuppressions).values({ email, reason: input.reason || "unsubscribe", source: input.source || "manual" }).run();
  db.update(schema.creatorOutreach).set({ status: "opted_out", updatedAt: new Date().toISOString() }).where(eq(schema.creatorOutreach.email, email)).run();
  return { success: true, email };
}
