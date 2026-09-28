import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../schema.js";

const STANDARD_PAGE_LIMIT = 100;
const STANDARD_DEPTH_LIMIT = 4;
const REQUEST_TIMEOUT_MS = 9_000;
const SMTP_TIMEOUT_MS = 7_000;
const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const SKIP_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|mp4|mov|avi|css|js|woff2?|ttf)(?:[?#].*)?$/i;
let workerBusy = false;

function now() { return new Date().toISOString(); }
function hostFor(url: string) { return new URL(url).hostname.toLowerCase(); }
function normalizeUrl(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
function updateJob(id: number, values: Record<string, unknown>) {
  db.update(schema.crawlJobs).set({ ...values, updatedAt: now() } as any).where(eq(schema.crawlJobs.id, id)).run();
}
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "InfluencerGrowthOSBot/1.0 (+public-site-crawl; contact your workspace owner)" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("text/html") ? await response.text() : "";
  return { response, body: body.slice(0, 1_500_000) };
}

async function readRobots(rootUrl: string) {
  try {
    const response = await fetch(new URL("/robots.txt", rootUrl), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return [];
    const lines = (await response.text()).split(/\r?\n/);
    let applies = false;
    const disallow: string[] = [];
    for (const raw of lines) {
      const line = raw.split("#")[0].trim();
      const [key, value = ""] = line.split(":", 2).map((item) => item.trim());
      if (key?.toLowerCase() === "user-agent") applies = value === "*";
      if (applies && key?.toLowerCase() === "disallow" && value) disallow.push(value);
    }
    return disallow;
  } catch { return []; }
}
function allowedByRobots(url: string, disallow: string[]) {
  const path = new URL(url).pathname;
  return !disallow.some((rule) => rule === "/" || path.startsWith(rule));
}
function extractLinks(html: string, pageUrl: string, domain: string) {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    try {
      const target = new URL(match[1], pageUrl);
      if (!["http:", "https:"].includes(target.protocol)) continue;
      if (target.hostname !== domain || SKIP_EXTENSIONS.test(target.pathname)) continue;
      target.hash = "";
      links.add(target.toString().replace(/\/$/, ""));
    } catch { /* malformed link */ }
  }
  return [...links];
}
function extractTitle(html: string) { return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 180) || null; }
function extractEmails(html: string, domain: string) {
  const found = new Set<string>();
  for (const raw of html.match(EMAIL_PATTERN) || []) {
    const email = raw.toLowerCase().replace(/[),.;:]+$/, "");
    if (email.endsWith(`@${domain}`) || email.split("@")[1]?.includes(".")) found.add(email);
  }
  for (const raw of html.matchAll(/mailto:([^"'?#>\s]+)/gi)) found.add(decodeURIComponent(raw[1]).toLowerCase());
  return [...found].filter((email) => email.length <= 320);
}

function smtpProbe(host: string, recipient: string, sender: string) {
  return new Promise<{ status: "accepted" | "rejected" | "unknown"; code: string; reason: string }>((resolve) => {
    const socket = net.createConnection({ host, port: 25 });
    let buffer = "";
    let stage = 0;
    let settled = false;
    const finish = (result: { status: "accepted" | "rejected" | "unknown"; code: string; reason: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const timeout = setTimeout(() => finish({ status: "unknown", code: "TIMEOUT", reason: "SMTP server did not respond in time" }), SMTP_TIMEOUT_MS);
    socket.on("error", (error) => { clearTimeout(timeout); finish({ status: "unknown", code: "NETWORK", reason: error.message }); });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      if (!buffer.includes("\n")) return;
      const line = buffer.trim().split(/\r?\n/).pop() || "";
      buffer = "";
      const code = line.slice(0, 3);
      if (stage === 0 && /^220/.test(code)) { stage = 1; socket.write("EHLO growth-os.local\r\n"); return; }
      if (stage === 1 && /^2/.test(code)) { stage = 2; socket.write(`MAIL FROM:<${sender}>\r\n`); return; }
      if (stage === 2 && /^2/.test(code)) { stage = 3; socket.write(`RCPT TO:<${recipient}>\r\n`); return; }
      if (stage === 3) {
        clearTimeout(timeout);
        if (/^2/.test(code)) finish({ status: "accepted", code, reason: "SMTP server accepted the recipient probe" });
        else if (/^5/.test(code)) finish({ status: "rejected", code, reason: line.slice(4) || "SMTP server rejected the recipient" });
        else finish({ status: "unknown", code, reason: line.slice(4) || "SMTP server returned a temporary response" });
      }
    });
  });
}

async function verifyEmail(email: string) {
  const syntaxValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!syntaxValid) return { syntaxStatus: "invalid", dnsStatus: "not_checked", smtpStatus: "not_checked", finalStatus: "invalid" as const, reason: "Invalid email syntax" };
  const domain = email.split("@")[1];
  let mx: Array<{ exchange: string; priority: number }>;
  try { mx = await dns.resolveMx(domain); } catch { return { syntaxStatus: "valid", dnsStatus: "missing_mx", smtpStatus: "not_checked", finalStatus: "invalid" as const, reason: "Domain has no resolvable MX record" }; }
  if (!mx.length) return { syntaxStatus: "valid", dnsStatus: "missing_mx", smtpStatus: "not_checked", finalStatus: "invalid" as const, reason: "Domain returned no MX records" };
  const selected = [...mx].sort((a, b) => a.priority - b.priority)[0].exchange;
  const sender = process.env.VERIFICATION_MAIL_FROM || `probe@${domain}`;
  const probe = await smtpProbe(selected, email, sender);
  if (probe.status === "accepted") return { syntaxStatus: "valid", dnsStatus: "mx_found", smtpStatus: "accepted", finalStatus: "likely_valid" as const, mxHost: selected, responseCode: probe.code, reason: probe.reason };
  if (probe.status === "rejected") return { syntaxStatus: "valid", dnsStatus: "mx_found", smtpStatus: "rejected", finalStatus: "invalid" as const, mxHost: selected, responseCode: probe.code, reason: probe.reason };
  return { syntaxStatus: "valid", dnsStatus: "mx_found", smtpStatus: "unknown", finalStatus: "unknown" as const, mxHost: selected, responseCode: probe.code, reason: probe.reason };
}

async function sendSlackReviewReady(jobId: number) {
  const webhookUrl = process.env.SLACK_REVIEW_WEBHOOK_URL;
  if (!webhookUrl) return;
  const job = db.query.crawlJobs.findFirst({ where: eq(schema.crawlJobs.id, jobId) }).sync();
  if (!job) return;
  const deliveries = db.insert(schema.webhookDeliveries).values({ jobId, provider: "slack", eventType: "review.ready", status: "queued" }).run();
  const deliveryId = Number(deliveries.lastInsertRowid);
  const candidates = db.select().from(schema.emailCandidates).where(eq(schema.emailCandidates.jobId, jobId)).all();
  const verifications = candidates.map((candidate) => db.query.emailVerifications.findFirst({ where: eq(schema.emailVerifications.candidateId, candidate.id) }).sync()).filter(Boolean) as any[];
  const count = (status: string) => verifications.filter((item) => item.finalStatus === status).length;
  const payload = { event: "review.ready", event_id: `crawl_${jobId}_${Date.now()}`, workspace_id: job.workspaceId, brand: { domain: job.domain }, crawl: { job_id: jobId, pages_crawled: job.pagesCrawled, pages_discovered: job.pagesDiscovered }, email_list: { total_found: candidates.length, verified: count("verified"), likely_valid: count("likely_valid"), risky: count("risky"), unknown: count("unknown"), invalid: count("invalid") } };
  const signature = process.env.SLACK_REVIEW_WEBHOOK_SECRET ? crypto.createHmac("sha256", process.env.SLACK_REVIEW_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest("hex") : undefined;
  const slackBody = { text: `Growth OS review ready for ${job.domain}: ${candidates.length} email candidates from ${job.pagesCrawled} crawled pages.`, blocks: [{ type: "header", text: { type: "plain_text", text: `Review ready · ${job.domain}` } }, { type: "section", fields: [{ type: "mrkdwn", text: `*Pages crawled*\n${job.pagesCrawled}/${job.pagesDiscovered}` }, { type: "mrkdwn", text: `*Email candidates*\n${candidates.length}` }, { type: "mrkdwn", text: `*Likely valid*\n${count("likely_valid")}` }, { type: "mrkdwn", text: `*Unknown / risky*\n${count("unknown") + count("risky")}` }] }, { type: "context", elements: [{ type: "mrkdwn", text: `Growth OS job ${jobId}${signature ? ` · signature ${signature.slice(0, 12)}…` : ""}` }] }] };
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(webhookUrl, { method: "POST", headers: { "content-type": "application/json", ...(signature ? { "x-growth-os-signature": signature } : {}) }, body: JSON.stringify(slackBody), signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`Slack returned ${response.status}`);
      db.update(schema.webhookDeliveries).set({ status: "delivered", attemptCount: attempt, responseCode: response.status, deliveredAt: now() }).where(eq(schema.webhookDeliveries.id, deliveryId)).run();
      return;
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); await sleep(attempt * 700); }
  }
  db.update(schema.webhookDeliveries).set({ status: "failed", attemptCount: 3, errorMessage: lastError }).where(eq(schema.webhookDeliveries.id, deliveryId)).run();
}

async function processJob(job: typeof schema.crawlJobs.$inferSelect) {
  const domain = hostFor(job.rootUrl);
  const disallow = await readRobots(job.rootUrl);
  const queue: Array<{ url: string; depth: number }> = [{ url: job.rootUrl, depth: 0 }];
  const visited = new Set<string>();
  updateJob(job.id, { status: "crawling", pagesDiscovered: 1 });
  while (queue.length && visited.size < STANDARD_PAGE_LIMIT) {
    const next = queue.shift()!;
    if (visited.has(next.url) || next.depth > STANDARD_DEPTH_LIMIT || !allowedByRobots(next.url, disallow)) continue;
    visited.add(next.url);
    const pageInsert = db.insert(schema.crawlPages).values({ jobId: job.id, url: next.url, depth: next.depth, status: "queued" }).run();
    const pageId = Number(pageInsert.lastInsertRowid);
    try {
      const { response, body } = await fetchText(next.url);
      const emails = extractEmails(body, domain);
      const links = extractLinks(body, next.url, domain);
      db.update(schema.crawlPages).set({ status: "crawled", httpStatus: response.status, title: extractTitle(body), discoveredEmails: emails.length, crawledAt: now() }).where(eq(schema.crawlPages.id, pageId)).run();
      for (const email of emails) {
        const exists = db.query.emailCandidates.findFirst({ where: (candidate, operators) => operators.and(operators.eq(candidate.jobId, job.id), operators.eq(candidate.email, email)) }).sync();
        if (!exists) db.insert(schema.emailCandidates).values({ jobId: job.id, email, sourceUrl: next.url, confidence: next.url.includes("contact") || next.url.includes("about") ? 90 : 65 }).run();
      }
      for (const link of links) if (!visited.has(link) && !queue.some((item) => item.url === link) && next.depth < STANDARD_DEPTH_LIMIT && visited.size + queue.length < STANDARD_PAGE_LIMIT) queue.push({ url: link, depth: next.depth + 1 });
      updateJob(job.id, { pagesCrawled: visited.size, pagesDiscovered: visited.size + queue.length, candidatesFound: db.select().from(schema.emailCandidates).where(eq(schema.emailCandidates.jobId, job.id)).all().length });
    } catch (error) {
      db.update(schema.crawlPages).set({ status: "failed", crawledAt: now() }).where(eq(schema.crawlPages.id, pageId)).run();
    }
    await sleep(180);
  }
  updateJob(job.id, { status: "extracting", pagesCrawled: visited.size, candidatesFound: db.select().from(schema.emailCandidates).where(eq(schema.emailCandidates.jobId, job.id)).all().length });
  const candidates = db.select().from(schema.emailCandidates).where(eq(schema.emailCandidates.jobId, job.id)).all();
  updateJob(job.id, { status: "verifying" });
  for (const candidate of candidates) {
    const result = await verifyEmail(candidate.email);
    db.insert(schema.emailVerifications).values({ candidateId: candidate.id, syntaxStatus: result.syntaxStatus, dnsStatus: result.dnsStatus, smtpStatus: result.smtpStatus, finalStatus: result.finalStatus, mxHost: "mxHost" in result ? result.mxHost : undefined, responseCode: "responseCode" in result ? result.responseCode : undefined, reason: result.reason }).run();
    const rows = db.query.emailVerifications.findMany({ where: (verification, operators) => operators.eq(verification.candidateId, candidate.id) }).sync();
    void rows;
    const all = candidates.map((item) => db.query.emailVerifications.findFirst({ where: eq(schema.emailVerifications.candidateId, item.id) }).sync()).filter(Boolean) as any[];
    updateJob(job.id, { verifiedCount: all.filter((item) => item.finalStatus === "verified" || item.finalStatus === "likely_valid").length, riskyCount: all.filter((item) => item.finalStatus === "risky" || item.finalStatus === "catch_all").length, unknownCount: all.filter((item) => item.finalStatus === "unknown").length });
  }
  updateJob(job.id, { status: "ready" });
  await sendSlackReviewReady(job.id);
}

async function tick() {
  if (workerBusy) return;
  const job = db.query.crawlJobs.findFirst({ where: eq(schema.crawlJobs.status, "queued"), orderBy: (crawl, { asc }) => [asc(crawl.createdAt)] }).sync();
  if (!job) return;
  workerBusy = true;
  try { await processJob(job); } catch (error) { updateJob(job.id, { status: "failed", errorMessage: error instanceof Error ? error.message : String(error) }); }
  finally { workerBusy = false; }
}

export function startCrawlerWorker() {
  const interrupted = db.select().from(schema.crawlJobs).all().filter((job) => ["crawling", "extracting", "verifying"].includes(job.status));
  for (const job of interrupted) updateJob(job.id, { status: "queued", errorMessage: null });
  void tick();
  setInterval(() => void tick(), 4_000);
  console.log("Growth OS crawler worker ready (standard depth: 100 pages / depth 4)");
}
