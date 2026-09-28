import { and, desc, eq } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../schema.js";

export type CreatorPlatform = "instagram" | "tiktok" | "youtube" | "pinterest" | "blog";
export type CreatorCandidate = {
  name: string;
  handle: string;
  platform: CreatorPlatform;
  niche: string;
  location: string;
  bio: string;
  profileUrl: string;
  followerCount: number;
  engagementRate: number;
  avgViews: number;
  email?: string;
  contactStatus: "unknown" | "discoverable" | "verified" | "opted_out";
};

const demoCandidates: Omit<CreatorCandidate, "niche" | "bio">[] = [
  { name: "Maya Chen", handle: "@mayamakesroom", platform: "instagram", location: "London, UK", profileUrl: "https://example.com/creators/maya-chen", followerCount: 28400, engagementRate: 6.8, avgViews: 31000, email: "hello@mayamakesroom.example", contactStatus: "discoverable" },
  { name: "Nora Ellis", handle: "@noraeveryday", platform: "tiktok", location: "Manchester, UK", profileUrl: "https://example.com/creators/nora-ellis", followerCount: 127000, engagementRate: 5.1, avgViews: 89000, email: "partnerships@noraeveryday.example", contactStatus: "discoverable" },
  { name: "Sofia Park", handle: "@sofiaslowedit", platform: "youtube", location: "New York, US", profileUrl: "https://example.com/creators/sofia-park", followerCount: 16300, engagementRate: 8.4, avgViews: 22000, contactStatus: "unknown" },
  { name: "Amara Brooks", handle: "@amarabuilds", platform: "instagram", location: "Bristol, UK", profileUrl: "https://example.com/creators/amara-brooks", followerCount: 45200, engagementRate: 3.9, avgViews: 27000, email: "collab@amarabuilds.example", contactStatus: "verified" },
  { name: "Jules Rivera", handle: "@julesinmotion", platform: "tiktok", location: "Austin, US", profileUrl: "https://example.com/creators/jules-rivera", followerCount: 76300, engagementRate: 4.6, avgViews: 64000, email: "jules@julesinmotion.example", contactStatus: "discoverable" },
  { name: "Theo Martin", handle: "@theoexplains", platform: "youtube", location: "Paris, FR", profileUrl: "https://example.com/creators/theo-martin", followerCount: 9800, engagementRate: 9.2, avgViews: 18000, contactStatus: "unknown" },
  { name: "Priya Shah", handle: "@priyapractically", platform: "pinterest", location: "Toronto, CA", profileUrl: "https://example.com/creators/priya-shah", followerCount: 22100, engagementRate: 7.2, avgViews: 26000, email: "studio@priyapractically.example", contactStatus: "discoverable" },
  { name: "Leah Okafor", handle: "@leahtriesit", platform: "instagram", location: "Dublin, IE", profileUrl: "https://example.com/creators/leah-okafor", followerCount: 6700, engagementRate: 10.4, avgViews: 12000, contactStatus: "unknown" },
];

const stopWords = new Set(["and", "the", "for", "with", "creator", "creators", "content", "brand"]);
function tokens(value: string) { return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !stopWords.has(token)); }

export function scoreCreator(candidate: CreatorCandidate, requestedNiche: string) {
  const requested = tokens(requestedNiche);
  const nicheWords = new Set(tokens(`${candidate.niche} ${candidate.bio}`));
  const matched = requested.filter((token) => nicheWords.has(token));
  const nichePoints = requested.length ? Math.min(35, Math.round((matched.length / requested.length) * 35)) : 20;
  const engagementPoints = Math.min(25, Math.round(Math.min(candidate.engagementRate, 12) / 12 * 25));
  const reachPoints = Math.min(20, Math.round(Math.log10(Math.max(candidate.followerCount, 1000)) / 6 * 20));
  const viewPoints = Math.min(10, Math.round(Math.min(candidate.avgViews / Math.max(candidate.followerCount, 1), 3) / 3 * 10));
  const contactPoints = candidate.contactStatus === "verified" ? 10 : candidate.contactStatus === "discoverable" ? 7 : 3;
  const score = Math.min(100, nichePoints + engagementPoints + reachPoints + viewPoints + contactPoints);
  const reasons = [
    `${nichePoints}/35 niche match${matched.length ? `: ${matched.slice(0, 3).join(", ")}` : ""}`,
    `${engagementPoints}/25 engagement quality`,
    `${reachPoints}/20 audience reach`,
    `${viewPoints}/10 average-view strength`,
    `${contactPoints}/10 contactability`,
  ];
  return { score, reasons };
}

function materializeCandidate(candidate: Omit<CreatorCandidate, "niche" | "bio">, niche: string) {
  const bio = `${niche} creator sharing practical routines, honest reviews, and useful ideas for an engaged audience.`;
  const scored = scoreCreator({ ...candidate, niche, bio }, niche);
  return { ...candidate, engagementRate: candidate.engagementRate.toFixed(2), niche, bio, fitScore: scored.score, scoreReasons: JSON.stringify(scored.reasons), lastSeenAt: new Date().toISOString(), source: "demo-public-signal" };
}

export async function discoverCreators(input: { workspaceId: number; niche: string; platforms: CreatorPlatform[]; location?: string; minFollowers?: number; maxFollowers?: number }) {
  const jobInsert = db.insert(schema.creatorDiscoveryJobs).values({ workspaceId: input.workspaceId, niche: input.niche, platforms: input.platforms.join(","), location: input.location || null, minFollowers: input.minFollowers ?? 1000, maxFollowers: input.maxFollowers ?? null, status: "running", source: "demo-public-signal" }).run();
  const jobId = Number(jobInsert.lastInsertRowid);
  try {
    const filtered = demoCandidates
      .filter((candidate) => input.platforms.includes(candidate.platform))
      .filter((candidate) => candidate.followerCount >= (input.minFollowers ?? 1000))
      .filter((candidate) => !input.maxFollowers || candidate.followerCount <= input.maxFollowers)
      .filter((candidate) => !input.location || candidate.location.toLowerCase().includes(input.location.toLowerCase()))
      .map((candidate) => materializeCandidate(candidate, input.niche))
      .sort((a, b) => b.fitScore - a.fitScore);
    const inserted: number[] = [];
    for (const candidate of filtered) {
      const existing = db.select().from(schema.creatorProfiles).where(and(eq(schema.creatorProfiles.workspaceId, input.workspaceId), eq(schema.creatorProfiles.handle, candidate.handle), eq(schema.creatorProfiles.platform, candidate.platform))).get();
      if (existing) {
        db.update(schema.creatorProfiles).set({ ...candidate, updatedAt: new Date().toISOString() }).where(eq(schema.creatorProfiles.id, existing.id)).run();
        inserted.push(existing.id);
      } else {
        const result = db.insert(schema.creatorProfiles).values({ workspaceId: input.workspaceId, ...candidate }).run();
        inserted.push(Number(result.lastInsertRowid));
      }
    }
    db.update(schema.creatorDiscoveryJobs).set({ status: "completed", resultCount: inserted.length, completedAt: new Date().toISOString() }).where(eq(schema.creatorDiscoveryJobs.id, jobId)).run();
    return { jobId, source: "demo-public-signal", notice: "Demo public-signal adapter active. Connect platform data providers for live creator discovery.", resultCount: inserted.length };
  } catch (error) {
    db.update(schema.creatorDiscoveryJobs).set({ status: "failed", errorMessage: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() }).where(eq(schema.creatorDiscoveryJobs.id, jobId)).run();
    throw error;
  }
}

export function listCreators(input: { workspaceId: number; search?: string; niche?: string; platform?: CreatorPlatform; status?: CreatorProfileStatus; limit?: number }) {
  const rows = db.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.workspaceId, input.workspaceId)).orderBy(desc(schema.creatorProfiles.fitScore)).all();
  const search = input.search?.toLowerCase().trim();
  return rows.filter((row) => (!search || `${row.name} ${row.handle} ${row.niche} ${row.location || ""}`.toLowerCase().includes(search)) && (!input.niche || row.niche.toLowerCase().includes(input.niche.toLowerCase())) && (!input.platform || row.platform === input.platform) && (!input.status || row.status === input.status)).slice(0, input.limit ?? 100).map((row) => ({ ...row, scoreReasons: JSON.parse(row.scoreReasons || "[]") as string[] }));
}

export async function updateCreatorStatus(input: { creatorId: number; status: CreatorProfileStatus }) {
  db.update(schema.creatorProfiles).set({ status: input.status, updatedAt: new Date().toISOString() }).where(eq(schema.creatorProfiles.id, input.creatorId)).run();
  const activityType = input.status === "shortlisted" ? "shortlisted" : input.status === "contacted" ? "contacted" : input.status === "partnered" ? "partnered" : "discovered";
  db.insert(schema.creatorActivities).values({ creatorId: input.creatorId, type: activityType, body: `Status changed to ${input.status}` }).run();
  return { success: true };
}

export async function addCreatorNote(input: { creatorId: number; body: string }) {
  const note = input.body.trim();
  if (!note) throw new Error("Note cannot be empty");
  db.update(schema.creatorProfiles).set({ notes: note, updatedAt: new Date().toISOString() }).where(eq(schema.creatorProfiles.id, input.creatorId)).run();
  db.insert(schema.creatorActivities).values({ creatorId: input.creatorId, type: "note", body: note }).run();
  return { success: true };
}

export type CreatorProfileStatus = "discovered" | "shortlisted" | "contacted" | "partnered" | "archived";
