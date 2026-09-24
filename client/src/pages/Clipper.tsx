import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { uploadFile } from "@/lib/upload";
import EngineStatus from "@/components/EngineStatus";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, Copy, Download, Link2, RefreshCw, Scissors, Trash2, Upload, Video } from "lucide-react";

const eyebrow = { fontSize: 8, textTransform: "uppercase" as const, letterSpacing: ".1em", color: "#8c94a1", fontWeight: 700 };

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ProjectCard({ project, onChanged }: { project: any; onChanged: () => void }) {
  const rerun = trpc.clips.rerun.useMutation();
  const deleteClip = trpc.clips.deleteClip.useMutation();
  const busy = project.status === "queued" || project.status === "processing";

  return (
    <section className="card-surface" style={{ padding: 19, marginTop: 18 }}>
      <div className="card-topline">
        <div>
          <span className="section-number">#{project.id}</span>
          <span className="section-title">{project.title}</span>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: project.status === "ready" ? "#5ca679" : project.status === "failed" ? "#9b4f37" : "#3155d8" }}>
          {project.status}{project.sourceDuration ? ` · ${fmt(project.sourceDuration)} source` : ""}
        </span>
      </div>

      {busy && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 6 }}>
            <span>{project.stage}{project.queuePosition > 0 ? ` (position ${project.queuePosition} in queue)` : ""}</span>
            <strong>{project.progress}%</strong>
          </div>
          <div style={{ height: 6, background: "#e5e0d7", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${project.progress}%`, height: "100%", background: "#3155d8", transition: "width .4s ease" }} />
          </div>
        </div>
      )}

      {project.status === "failed" && (
        <div className="generation-error" style={{ marginTop: 0, marginBottom: 12 }}>
          <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
          {project.error}
        </div>
      )}

      {project.log?.length > 0 && (
        <ul style={{ margin: "0 0 12px", paddingLeft: 16, fontSize: 10, color: "#6e7888", lineHeight: 1.6 }}>
          {project.log.map((l: string, i: number) => <li key={i}>{l}</li>)}
        </ul>
      )}

      {project.clips.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
          {project.clips.map((clip: any) => (
            <div key={clip.id} style={{ border: "1px solid #e5e0d7", background: "#fbfaf6", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <video src={clip.videoUrl} poster={clip.thumbnailUrl} controls playsInline preload="none" style={{ width: "100%", aspectRatio: String(project.options?.aspectRatio ?? "9:16").replace(":", "/"), background: "#000", maxHeight: 380 }} />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <strong style={{ fontSize: 11 }}>{clip.title}</strong>
                {clip.score != null && <span style={{ fontSize: 9, color: "#3155d8", fontWeight: 700, whiteSpace: "nowrap" }}>{Math.round(clip.score)}/100</span>}
              </div>
              <span style={{ fontSize: 9, color: "#8c94a1" }}>{fmt(clip.startSec)} to {fmt(clip.endSec)} · {Math.round(clip.endSec - clip.startSec)}s</span>
              {clip.reason && <span style={{ fontSize: 10, color: "#6e7888", lineHeight: 1.4 }}>{clip.reason}</span>}
              {clip.postCaption && (
                <div>
                  <div style={eyebrow}>Caption</div>
                  <p style={{ fontSize: 10, margin: "2px 0 0", lineHeight: 1.4 }}>{clip.postCaption} {clip.hashtags?.join(" ")}</p>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, fontSize: 10, marginTop: "auto" }}>
                <a className="text-action" href={clip.videoUrl} download><Download size={12} /> MP4</a>
                {clip.postCaption && (
                  <button className="text-action" onClick={() => { navigator.clipboard?.writeText(`${clip.postCaption} ${clip.hashtags?.join(" ") ?? ""}`); toast.success("Caption copied"); }}>
                    <Copy size={12} /> Caption
                  </button>
                )}
                <button className="text-action" style={{ marginLeft: "auto", color: "#9b4f37" }} onClick={async () => { await deleteClip.mutateAsync({ id: clip.id }); onChanged(); }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!busy && (
        <div style={{ marginTop: 12 }}>
          <button className="secondary-button" onClick={async () => { await rerun.mutateAsync({ id: project.id }); onChanged(); }}>
            <RefreshCw size={13} /> {project.status === "failed" ? "Try again" : "Re-clip this video"}
          </button>
        </div>
      )}
    </section>
  );
}

export default function Clipper() {
  const [, setLocation] = useLocation();
  const workspaceQuery = trpc.workspace.list.useQuery();
  const workspaceId = workspaceQuery.data?.[0]?.id ?? 1;
  const projectsQuery = trpc.clips.list.useQuery(
    { workspaceId },
    { refetchInterval: (q) => (q.state.data?.some((p) => p.status === "queued" || p.status === "processing") ? 2500 : false) }
  );
  const createMutation = trpc.clips.create.useMutation();

  const [title, setTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<"link" | "upload">("upload");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceFile, setSourceFile] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [context, setContext] = useState("");
  const [clipCount, setClipCount] = useState(5);
  const [minSeconds, setMinSeconds] = useState(15);
  const [maxSeconds, setMaxSeconds] = useState(45);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [layout, setLayout] = useState<"fit" | "crop">("fit");
  const [captions, setCaptions] = useState(true);
  const [hookBanner, setHookBanner] = useState(true);
  const [disclosure, setDisclosure] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const prevStatuses = useRef<Record<number, string>>({});

  useEffect(() => {
    for (const p of projectsQuery.data ?? []) {
      const prev = prevStatuses.current[p.id];
      if (prev && prev !== p.status && p.status === "ready") toast.success(`${p.clips.length} clips ready from "${p.title}"`);
      if (prev && prev !== p.status && p.status === "failed") toast.error(`Clipping failed for "${p.title}"`);
      prevStatuses.current[p.id] = p.status;
    }
  }, [projectsQuery.data]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploadProgress(0);
    try {
      const url = await uploadFile(file, setUploadProgress);
      setSourceFile(url);
      setSourceName(file.name);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleCreate() {
    if (sourceMode === "upload" && !sourceFile) { toast.error("Upload the stream recording first"); return; }
    if (sourceMode === "link" && !/^https?:\/\//.test(sourceUrl)) { toast.error("Paste a video link starting with http"); return; }
    if (maxSeconds < minSeconds) { toast.error("Max length must be at least the min length"); return; }
    try {
      await createMutation.mutateAsync({
        workspaceId,
        title: title || sourceName || "Stream clips",
        sourceUrl: sourceMode === "link" ? sourceUrl : undefined,
        sourceFile: sourceMode === "upload" ? sourceFile! : undefined,
        context: context || undefined,
        clipCount, minSeconds, maxSeconds, aspectRatio, layout, captions, hookBanner,
        disclosure: disclosure || undefined,
      });
      toast.success("Clipping started");
      setSourceFile(null);
      setSourceName("");
      setSourceUrl("");
      projectsQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start clipping");
    }
  }

  return (
    <div className="studio-shell min-h-screen bg-[#f8f5ef] text-[#1b2333]">
      <main className="studio-main" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
        <header className="topbar" style={{ justifyContent: "flex-start", gap: 16, padding: "0 8px" }}>
          <button className="text-action" onClick={() => setLocation("/")} style={{ gap: 8 }}><ArrowLeft size={16} /> Dashboard</button>
          <div style={{ flex: 1 }} />
          <button className="text-action" onClick={() => setLocation("/ugc-studio")} style={{ gap: 6 }}><Video size={14} /> Video studio</button>
        </header>

        <div className="content-wrap" style={{ padding: "32px 0" }}>
          <section className="page-heading" style={{ marginBottom: 24 }}>
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> STREAM CLIPPER</div>
              <h1>Long stream in.<br /><em>Viral clips out.</em></h1>
              <p>Drop in a pump.fun livestream recording, a podcast, a Twitch VOD or any long video. The clipper finds the best moments, reframes them for vertical, adds captions and a hook, and hands you ready-to-post MP4s.</p>
            </div>
          </section>

          <section className="card-surface" style={{ padding: 16, marginBottom: 20 }}>
            <EngineStatus only={["script", "transcription", "downloads"]} />
          </section>

          <section className="avatar-control-panel card-surface" style={{ marginTop: 0 }}>
            <div className="card-topline">
              <div><span className="section-number">SOURCE</span><span className="section-title">What should we clip?</span></div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["upload", "link"] as const).map((m) => (
                  <button key={m} onClick={() => setSourceMode(m)} style={{ border: "1px solid #dcd7cd", background: sourceMode === m ? "#1b2333" : "#f8f5ef", color: sourceMode === m ? "#fff" : "#8991a0", padding: "5px 10px", font: "500 10px 'DM Sans'", borderRadius: 3, display: "inline-flex", gap: 5, alignItems: "center" }}>
                    {m === "upload" ? <Upload size={12} /> : <Link2 size={12} />} {m === "upload" ? "Upload recording" : "Paste link"}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {sourceMode === "upload" ? (
                <div className="reference-upload" style={{ gridColumn: "1 / -1" }}>
                  <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska" onChange={(e) => handleFile(e.target.files?.[0])} />
                  <button type="button" className="reference-drop" onClick={() => fileRef.current?.click()} disabled={uploadProgress !== null}>
                    <Upload size={16} />
                    <strong>{uploadProgress !== null ? `Uploading ${Math.round(uploadProgress * 100)}%` : sourceName || "Upload the stream recording"}</strong>
                    <small>MP4, MOV, WebM or MKV. Screen-record the pump.fun stream or download the VOD, then drop it here.</small>
                  </button>
                </div>
              ) : (
                <label className="control-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Video link</span>
                  <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://.../stream.m3u8, https://.../vod.mp4, or a YouTube/Twitch/Kick/X link" />
                  <small style={{ fontSize: 9, color: "#8c94a1" }}>Direct .mp4 and .m3u8 links always work. Page links (YouTube, Twitch, Kick, X) need yt-dlp installed on the server. Only clip streams you have permission to repost.</small>
                </label>
              )}
              <label className="control-field">
                <span>Project name</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="$TICKER launch stream" />
              </label>
              <label className="control-field" style={{ gridColumn: "1 / -1" }}>
                <span>Context for the AI (optional)</span>
                <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="pump.fun livestream for $TICKER, dev answering holder questions, the coin hit KOTH at 1:20:00" />
              </label>
              <label className="control-field">
                <span>How many clips</span>
                <select value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))}>
                  {[1, 3, 5, 8, 10, 15].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="control-field">
                <span>Min length (s)</span>
                <input type="number" min={5} max={120} value={minSeconds} onChange={(e) => setMinSeconds(Number(e.target.value))} />
              </label>
              <label className="control-field">
                <span>Max length (s)</span>
                <input type="number" min={8} max={180} value={maxSeconds} onChange={(e) => setMaxSeconds(Number(e.target.value))} />
              </label>
              <label className="control-field">
                <span>Format</span>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)}>
                  <option value="9:16">9:16 vertical</option>
                  <option value="1:1">1:1 square</option>
                  <option value="16:9">16:9 landscape</option>
                </select>
              </label>
              <label className="control-field">
                <span>Framing</span>
                <select value={layout} onChange={(e) => setLayout(e.target.value as any)}>
                  <option value="fit">Whole frame on blurred background</option>
                  <option value="crop">Fill the frame (crop sides)</option>
                </select>
              </label>
              <label className="control-field">
                <span>Corner label (optional)</span>
                <input value={disclosure} onChange={(e) => setDisclosure(e.target.value)} placeholder="Clipped from @streamer · #ad" />
              </label>
            </div>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, fontSize: 10 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Word-timed captions</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={hookBanner} onChange={(e) => setHookBanner(e.target.checked)} /> Hook banner at the top</label>
            </div>

            <div className="control-footer">
              <div className="safety-copy" style={{ margin: 0, maxWidth: 440 }}>
                If you are paid to clip a coin's stream, label the clips as sponsored. Clip captions never promise gains or tell viewers to buy.
              </div>
              <button className="primary-button" onClick={handleCreate} disabled={createMutation.isPending || uploadProgress !== null}>
                <Scissors size={15} /> {createMutation.isPending ? "Starting..." : "Find clips"}
              </button>
            </div>
          </section>

          {projectsQuery.data?.length === 0 && (
            <div className="library-empty" style={{ marginTop: 20 }}><p>No clip projects yet. Upload a stream above to get your first clips.</p></div>
          )}
          {projectsQuery.data?.map((project) => (
            <ProjectCard key={project.id} project={project} onChanged={() => projectsQuery.refetch()} />
          ))}
        </div>
      </main>
    </div>
  );
}
