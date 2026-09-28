import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { appRouter } from "./routers/index.js";
import type { Context } from "./trpc.js";
import { startCrawlerWorker } from "./services/crawl-worker.js";
import { startAnalyticsWorker } from "./services/analytics.js";
import { handleReply, suppressEmail } from "./services/outreach.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: (): Context => {
      return { userId: 1 };
    },
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/outreach/webhook", (req, res) => {
  const secret = process.env.OUTREACH_WEBHOOK_SECRET;
  if (secret && req.header("x-outreach-webhook-secret") !== secret) return res.status(401).json({ error: "Invalid webhook secret" });
  const event = req.body as { type?: string; threadId?: string; providerEventId?: string; email?: string; body?: string };
  if (event.type === "reply" && event.threadId) return res.json(handleReply({ threadId: event.threadId, providerEventId: event.providerEventId, body: event.body }));
  if (event.type === "unsubscribe" && event.email) return res.json(suppressEmail({ email: event.email, source: "provider-webhook" }));
  return res.status(400).json({ error: "Unsupported outreach event" });
});

app.get("/api/oauth/callback", (_req, res) => {
  res.redirect("/");
});

const publicDir = path.resolve(__dirname, "..", "dist", "public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`UGC Automation server running on http://localhost:${PORT}`);
  startCrawlerWorker();
  startAnalyticsWorker();
});
