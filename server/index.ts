import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import "dotenv/config";
import { appRouter } from "./routers/index.js";
import { resumeInterruptedClipProjects } from "./services/clipper.js";
import { extensionFor, mediaDir, mediaUrlFor, uploadsDir } from "./services/media.js";
import { resumeInterruptedRenders } from "./services/video-jobs.js";
import type { Context } from "./trpc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.use(cors({ origin: true, credentials: true }));
// Uploads arrive base64 encoded inside tRPC calls, so allow large bodies.
app.use(express.json({ limit: process.env.MAX_UPLOAD_BODY || "300mb" }));

// Streaming upload for big files (stream recordings, product photos, music).
// The browser sends the raw file as the request body; we pipe it to disk.
const UPLOAD_TYPES = /^(image\/(jpeg|png|webp)|audio\/(mpeg|mp3|wav|x-wav|mp4|aac|x-m4a)|video\/(mp4|quicktime|webm|x-matroska|x-flv))$/i;
const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 4096) * 1024 * 1024;
app.post("/api/upload", (req, res) => {
  const type = String(req.headers["content-type"] || "").split(";")[0].trim();
  if (!UPLOAD_TYPES.test(type)) {
    res.status(415).json({ error: `Unsupported file type: ${type || "unknown"}` });
    return;
  }
  const name = String(req.query.name || "upload");
  const dest = path.join(uploadsDir, `${uuidv4()}${extensionFor(type, name)}`);
  const out = fs.createWriteStream(dest);
  let bytes = 0;
  let aborted = false;
  req.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_BYTES && !aborted) {
      aborted = true;
      req.unpipe(out);
      out.destroy();
      fs.rmSync(dest, { force: true });
      res.status(413).json({ error: "File is too large" });
    }
  });
  req.pipe(out);
  out.on("finish", () => {
    if (!aborted) res.json({ url: mediaUrlFor(dest), bytes });
  });
  out.on("error", (err) => {
    if (!aborted) res.status(500).json({ error: err.message });
  });
});

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: (): Context => {
      return { userId: 1 };
    },
  })
);

// Rendered videos, thumbnails and uploads. Range requests let browsers seek.
app.use("/media", express.static(mediaDir, { maxAge: "1h" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/oauth/callback", (_req, res) => {
  res.redirect("/");
});

// Works from both `tsx server/index.ts` (dev) and `node dist/server/index.js`.
const publicDir = [
  path.resolve(__dirname, "..", "public"),
  path.resolve(__dirname, "..", "dist", "public"),
].find((dir) => fs.existsSync(path.join(dir, "index.html"))) ?? path.resolve(process.cwd(), "dist", "public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`UGC Automation server running on http://localhost:${PORT}`);
  resumeInterruptedRenders();
  resumeInterruptedClipProjects();
});
