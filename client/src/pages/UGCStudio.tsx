import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { uploadFile } from "@/lib/upload";
import EngineStatus from "@/components/EngineStatus";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  Clapperboard,
  Copy,
  Download,
  Film,
  ImagePlus,
  Megaphone,
  Music,
  RefreshCw,
  Rocket,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  UserRound,
  Video,
  WandSparkles,
  X,
} from "lucide-react";

const VIDEO_STYLES = [
  { value: "testimonial", label: "Testimonial", desc: "Authentic, personal endorsement" },
  { value: "unboxing", label: "Unboxing", desc: "First-look excitement" },
  { value: "tutorial", label: "Tutorial", desc: "Step-by-step how-to" },
  { value: "review", label: "Review", desc: "Honest product evaluation" },
  { value: "lifestyle", label: "Lifestyle", desc: "Aspirational daily integration" },
  { value: "before_after", label: "Before & After", desc: "Transformation reveal" },
  { value: "day_in_life", label: "Day in Life", desc: "Full day with the product" },
  { value: "get_ready", label: "GRWM", desc: "Get ready with me routine" },
  { value: "haul", label: "Haul", desc: "Product showcase roundup" },
  { value: "storytelling", label: "Storytelling", desc: "Narrative-driven content" },
] as const;

const PLATFORMS = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram Reels" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "facebook", label: "Facebook" },
] as const;

const VIDEO_TYPES = [
  { value: "ugc", label: "UGC ad", desc: "A creator talks about and promotes your product", icon: UserRound },
  { value: "launch", label: "Product launch", desc: "Teaser, reveal, features and CTA for something new", icon: Rocket },
  { value: "custom", label: "Anything", desc: "Describe any video and it gets written and rendered", icon: WandSparkles },
] as const;

type VideoType = (typeof VIDEO_TYPES)[number]["value"];
type Presenter = "none" | "voiceover" | "talking_avatar";

const tabButton = (active: boolean) => ({
  border: "1px solid #dcd7cd",
  background: active ? "#1b2333" : "#f8f5ef",
  color: active ? "#fff" : "#8991a0",
  padding: "6px 14px",
  font: "500 10px 'DM Sans'",
  borderRadius: 3,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});

const eyebrow = { fontSize: 8, textTransform: "uppercase" as const, letterSpacing: ".1em", color: "#8c94a1", marginBottom: 6, fontWeight: 700 };

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, [string, string]> = {
    ready: ["#5ca679", "#edf7f0"],
    failed: ["#9b4f37", "#fff2ec"],
    rendering: ["#3155d8", "#edf0ff"],
    queued: ["#b9754d", "#fbefe7"],
    none: ["#8c94a1", "#f1eee8"],
  };
  const [fg, bg] = colors[status] ?? colors.none;
  return (
    <span style={{ color: fg, background: bg, fontSize: 8, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", padding: "4px 6px", borderRadius: 2 }}>
      {status === "none" ? "script only" : status}
    </span>
  );
}

function RenderProgress({ video }: { video: any }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 6 }}>
        <span>{video.renderStage || "Waiting"}{video.queuePosition > 0 ? ` (position ${video.queuePosition} in queue)` : ""}</span>
        <strong>{video.renderProgress}%</strong>
      </div>
      <div style={{ height: 6, background: "#e5e0d7", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${video.renderProgress}%`, height: "100%", background: "#3155d8", transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

function RenderLog({ lines }: { lines: string[] }) {
  if (!lines?.length) return null;
  return (
    <ul style={{ margin: "10px 0 0", paddingLeft: 16, fontSize: 10, color: "#6e7888", lineHeight: 1.6 }}>
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  );
}

function VideoResult({ videoId, onClose }: { videoId: number; onClose?: () => void }) {
  const utils = trpc.useUtils();
  const query = trpc.video.get.useQuery(
    { id: videoId },
    { refetchInterval: (q) => (["queued", "rendering"].includes(q.state.data?.renderStatus ?? "") ? 2000 : false) }
  );
  const renderMutation = trpc.video.render.useMutation();
  const video = query.data;
  const prevStatus = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!video) return;
    if (prevStatus.current && prevStatus.current !== video.renderStatus) {
      if (video.renderStatus === "ready") toast.success("Your video is ready");
      if (video.renderStatus === "failed") toast.error("Render failed", { description: video.renderError ?? undefined });
      utils.video.list.invalidate();
    }
    prevStatus.current = video.renderStatus;
  }, [video?.renderStatus]);

  if (!video) return null;
  const script = video.script as any;
  const busy = video.renderStatus === "queued" || video.renderStatus === "rendering";

  async function rerender(rewriteScript: boolean) {
    await renderMutation.mutateAsync({ id: videoId, rewriteScript });
    await query.refetch();
  }

  return (
    <section className="card-surface" style={{ padding: 19, marginTop: 24 }}>
      <div className="card-topline">
        <div><span className="section-number">RESULT</span><span className="section-title">{video.title}</span></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <StatusBadge status={video.renderStatus} />
          {onClose && <button className="text-action" onClick={onClose} aria-label="Close"><X size={14} /></button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: video.videoUrl ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr", gap: 20 }}>
        {video.videoUrl && (
          <div>
            <video key={video.videoUrl} src={video.videoUrl} poster={video.thumbnailUrl ?? undefined} controls playsInline style={{ width: "100%", maxWidth: 360, display: "block", background: "#000", borderRadius: 3, maxHeight: 600 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <a className="primary-button" href={video.videoUrl} download style={{ textDecoration: "none" }}><Download size={14} /> Download MP4</a>
              <button className="secondary-button" disabled={busy} onClick={() => rerender(false)}><RefreshCw size={13} /> Re-render</button>
            </div>
          </div>
        )}

        <div>
          {busy && <RenderProgress video={video} />}
          {video.renderStatus === "failed" && (
            <div className="generation-error" style={{ marginTop: 0 }}>
              <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
              {video.renderError}
              <div style={{ marginTop: 8 }}><button className="secondary-button" onClick={() => rerender(false)}><RefreshCw size={13} /> Try again</button></div>
            </div>
          )}
          {video.renderStatus === "none" && (
            <button className="primary-button" onClick={() => rerender(false)} disabled={renderMutation.isPending}>
              <Clapperboard size={14} /> Render this script into a video
            </button>
          )}
          <RenderLog lines={video.renderLog} />

          {script?.scenes?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {script.hook && (
                <div style={{ background: "#1b2333", color: "#f8f5ef", padding: 16, borderRadius: 3, marginBottom: 12 }}>
                  <div style={{ ...eyebrow, color: "#aebeff" }}><Megaphone size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Hook</div>
                  <p style={{ fontSize: 15, fontFamily: "'Bodoni Moda', serif", lineHeight: 1.4, margin: 0 }}>"{script.hook}"</p>
                </div>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {script.scenes.map((scene: any) => (
                  <div key={scene.sceneNumber} style={{ border: "1px solid #e5e0d7", padding: 12, background: "#fbfaf6" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <span style={{ background: "#3155d8", color: "#fff", fontSize: 9, fontWeight: 700, padding: "3px 6px", borderRadius: 2 }}>SCENE {scene.sceneNumber}</span>
                      {scene.kind && <span style={{ fontSize: 9, color: "#3155d8", fontWeight: 600, textTransform: "uppercase" }}>{scene.kind}</span>}
                      <span style={{ fontSize: 10, color: "#8c94a1" }}>{scene.duration}</span>
                    </div>
                    {scene.dialogue && <p style={{ fontSize: 11, lineHeight: 1.5, margin: "0 0 4px", fontStyle: "italic" }}>"{scene.dialogue}"</p>}
                    <p style={{ fontSize: 10, lineHeight: 1.5, margin: 0, color: "#6e7888" }}>{scene.visual}</p>
                    {(scene.textOverlay || scene.headline) && (
                      <div style={{ marginTop: 6, padding: "4px 8px", background: "#edf0ff", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Type size={10} style={{ color: "#3155d8" }} />
                        <span style={{ fontSize: 10, color: "#3155d8", fontWeight: 600 }}>{scene.headline || scene.textOverlay}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {script.postCaption && (
                <div style={{ marginTop: 14 }}>
                  <div style={eyebrow}>Post caption</div>
                  <p style={{ fontSize: 11, margin: 0, lineHeight: 1.5 }}>{script.postCaption} {script.hashtags?.join(" ")}</p>
                  <button className="text-action" style={{ marginTop: 6 }} onClick={() => { navigator.clipboard?.writeText(`${script.postCaption} ${script.hashtags?.join(" ") ?? ""}`); toast.success("Caption copied"); }}>
                    <Copy size={12} /> Copy caption
                  </button>
                </div>
              )}
              <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 10, color: "#6e7888", flexWrap: "wrap" }}>
                <span><Music size={10} style={{ display: "inline", verticalAlign: "middle" }} /> {script.musicSuggestion}</span>
                <span>Script by {video.scriptSource === "claude" ? "Claude" : "templates"}</span>
                {!busy && video.renderStatus !== "none" && <button className="text-action" onClick={() => rerender(true)}><Sparkles size={11} /> Rewrite script and re-render</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function UploadList({ label, hint, accept, multiple, urls, onChange, icon: Icon }: {
  label: string; hint: string; accept: string; multiple?: boolean; urls: string[]; onChange: (urls: string[]) => void; icon: any;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = multiple ? [...urls] : [];
    try {
      for (const file of Array.from(files)) {
        setProgress(0);
        next.push(await uploadFile(file, setProgress));
      }
      onChange(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isImage = accept.startsWith("image");
  return (
    <div className="reference-upload">
      <span>{label}</span>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={(e) => handleFiles(e.target.files)} />
      <button type="button" className="reference-drop" onClick={() => inputRef.current?.click()} disabled={progress !== null}>
        <Icon size={16} />
        <strong>{progress !== null ? `Uploading ${Math.round(progress * 100)}%` : urls.length ? (multiple ? "Add more" : "Replace") : "Upload"}</strong>
        <small>{hint}</small>
      </button>
      {urls.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {urls.map((u) => (
            <div key={u} style={{ position: "relative" }}>
              {isImage ? <img src={u} alt="" style={{ width: 52, height: 52, objectFit: "cover", border: "1px solid #ddd8cd" }} /> : <span style={{ fontSize: 9, padding: 6, border: "1px solid #ddd8cd", display: "inline-block" }}>{u.split("/").pop()?.slice(0, 12)}</span>}
              <button type="button" onClick={() => onChange(urls.filter((x) => x !== u))} aria-label="Remove" style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", border: 0, background: "#1b2333", color: "#fff", display: "grid", placeItems: "center", padding: 0 }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UGCStudio() {
  const [, setLocation] = useLocation();
  const workspaceQuery = trpc.workspace.list.useQuery();
  const workspaceId = workspaceQuery.data?.[0]?.id ?? 1;
  const caps = trpc.video.capabilities.useQuery().data;
  const videosQuery = trpc.video.list.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0, refetchInterval: (q) => (q.state.data?.some((v) => ["queued", "rendering"].includes(v.renderStatus)) ? 3000 : false) }
  );
  const createMutation = trpc.video.create.useMutation();
  const scriptMutation = trpc.ugc.generateVideo.useMutation();
  const deleteMutation = trpc.video.delete.useMutation();

  const [activeTab, setActiveTab] = useState<"create" | "library">("create");
  const [videoType, setVideoType] = useState<VideoType>("ugc");
  const [title, setTitle] = useState("My first video");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("testimonial");
  const [platform, setPlatform] = useState<string>("tiktok");
  const [duration, setDuration] = useState(30);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [presenter, setPresenter] = useState<Presenter>("voiceover");
  const [customHook, setCustomHook] = useState("");
  const [callToAction, setCta] = useState("");
  const [voice, setVoice] = useState("");
  const [colors, setColors] = useState<[string, string]>(["#3155d8", "#1b2333"]);
  const [captions, setCaptions] = useState(true);
  const [disclosure, setDisclosure] = useState(true);
  const [generateImages, setGenerateImages] = useState(true);
  const [images, setImages] = useState<string[]>([]);
  const [presenterImage, setPresenterImage] = useState<string[]>([]);
  const [presenterConsent, setPresenterConsent] = useState(false);
  const [music, setMusic] = useState<string[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<number | null>(null);

  function validate() {
    if (!productName.trim()) { toast.error(videoType === "custom" ? "Give the video a subject or product name" : "Enter a product name"); return false; }
    if (videoType === "custom" && !prompt.trim()) { toast.error("Describe the video you want"); return false; }
    if (videoType !== "custom" && !productDescription.trim()) { toast.error("Describe the product"); return false; }
    if (presenterImage.length && !presenterConsent) { toast.error("Confirm you have the right to use the presenter's likeness"); return false; }
    return true;
  }

  async function handleRender() {
    if (!validate()) return;
    try {
      const { id } = await createMutation.mutateAsync({
        workspaceId,
        videoType,
        title: title || productName,
        productName,
        productDescription,
        prompt: prompt || undefined,
        style: style as any,
        platform: platform as any,
        duration,
        aspectRatio,
        presenter,
        customHook: customHook || undefined,
        callToAction: callToAction || undefined,
        images,
        presenterImage: presenterImage[0],
        presenterConsent,
        music: music[0],
        voice: voice || undefined,
        captions,
        disclosure,
        generateImages,
        brandColors: colors,
      });
      setActiveVideoId(id);
      videosQuery.refetch();
      toast.success("Render started", { description: "You can keep working; it will show up in the Library." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the render");
    }
  }

  async function handleScriptOnly() {
    if (!validate()) return;
    try {
      const result = await scriptMutation.mutateAsync({
        workspaceId, title: title || productName, productName, productDescription,
        style: style as any, platform: platform as any, duration: Math.max(15, duration),
        customHook: customHook || undefined, callToAction: callToAction || undefined,
      });
      setActiveVideoId(result.videoId);
      videosQuery.refetch();
      toast.success("Script written", { description: "Review it, then render it into a video." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Script generation failed");
    }
  }

  const avatarUnavailable = caps && !caps.talkingAvatar;

  return (
    <div className="studio-shell min-h-screen bg-[#f8f5ef] text-[#1b2333]">
      <main className="studio-main" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
        <header className="topbar" style={{ justifyContent: "flex-start", gap: 16, padding: "0 8px" }}>
          <button className="text-action" onClick={() => setLocation("/")} style={{ gap: 8 }}>
            <ArrowLeft size={16} /> Dashboard
          </button>
          <div style={{ flex: 1 }} />
          <div className="topbar-actions" style={{ gap: 6 }}>
            <button style={tabButton(activeTab === "create")} onClick={() => setActiveTab("create")}><WandSparkles size={13} /> Create</button>
            <button style={tabButton(activeTab === "library")} onClick={() => setActiveTab("library")}><Film size={13} /> Library</button>
            <button style={tabButton(false)} onClick={() => setLocation("/clipper")}><Scissors size={13} /> Clipper</button>
            <button style={tabButton(false)} onClick={() => setLocation("/image-studio")}><ImagePlus size={13} /> Images</button>
          </div>
        </header>

        <div className="content-wrap" style={{ padding: "32px 0" }}>
          <section className="page-heading" style={{ marginBottom: 24 }}>
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> VIDEO STUDIO</div>
              <h1>Write it. Render it.<br /><em>Post it.</em></h1>
              <p>UGC ads with a talking creator, product launch films, or any video you can describe. Each one is scripted, voiced, edited, captioned and rendered to an MP4.</p>
            </div>
          </section>

          <section className="card-surface" style={{ padding: 16, marginBottom: 20 }}>
            <div className="card-topline" style={{ marginBottom: 10 }}>
              <div><span className="section-number">ENGINES</span><span className="section-title">What this studio can use right now</span></div>
            </div>
            <EngineStatus only={["script", "voice", "avatar", "images"]} />
          </section>

          {activeTab === "create" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
                {VIDEO_TYPES.map(({ value, label, desc, icon: Icon }) => (
                  <button key={value} onClick={() => setVideoType(value)} style={{ padding: 14, textAlign: "left", cursor: "pointer", borderRadius: 3, border: videoType === value ? "2px solid #3155d8" : "1px solid #ddd8cd", background: videoType === value ? "#edf0ff" : "#fffdf9" }}>
                    <Icon size={16} style={{ color: "#3155d8" }} />
                    <strong style={{ display: "block", fontSize: 12, marginTop: 6 }}>{label}</strong>
                    <small style={{ color: "#8c94a1", fontSize: 10 }}>{desc}</small>
                  </button>
                ))}
              </div>

              <section className="avatar-control-panel card-surface" style={{ marginTop: 0 }}>
                <div className="card-topline">
                  <div><span className="section-number">BRIEF</span><span className="section-title">What is the video about?</span></div>
                  <span className="ai-label"><Sparkles size={13} /> {caps?.scriptWriter === "claude" ? "WRITTEN BY CLAUDE" : "TEMPLATE SCRIPTS"}</span>
                </div>

                <div className="control-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  <label className="control-field">
                    <span>Video title</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} />
                  </label>
                  <label className="control-field">
                    <span>{videoType === "custom" ? "Subject / product" : "Product name"}</span>
                    <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="GlowUp Vitamin C Serum" />
                  </label>
                  <label className="control-field" style={{ gridColumn: "1 / -1" }}>
                    <span>{videoType === "custom" ? "Product / subject details (optional)" : "Product description"}</span>
                    <input value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="A lightweight vitamin C serum that brightens and hydrates skin" />
                  </label>
                  <label className="control-field" style={{ gridColumn: "1 / -1" }}>
                    <span>{videoType === "custom" ? "Describe the video you want" : "Extra direction (optional)"}</span>
                    <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={videoType === "custom" ? "e.g. A 30 second explainer on how our app splits bills between roommates, upbeat, ends with a download CTA" : videoType === "launch" ? "e.g. Launching Friday, emphasise the new 24h formula and the refill pack" : "e.g. Target busy moms, mention it takes 10 seconds"} style={{ minHeight: 60 }} />
                  </label>

                  {videoType === "ugc" && (
                    <label className="control-field">
                      <span>UGC style</span>
                      <select value={style} onChange={(e) => setStyle(e.target.value)}>
                        {VIDEO_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="control-field">
                    <span>Platform</span>
                    <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                      {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </label>
                  <label className="control-field">
                    <span>Length</span>
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                      {[15, 20, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} seconds</option>)}
                    </select>
                  </label>
                  <label className="control-field">
                    <span>Format</span>
                    <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)}>
                      <option value="9:16">9:16 vertical (TikTok, Reels, Shorts)</option>
                      <option value="1:1">1:1 square (feed)</option>
                      <option value="16:9">16:9 landscape (YouTube, web)</option>
                    </select>
                  </label>
                  <label className="control-field">
                    <span>Who speaks?</span>
                    <select value={presenter} onChange={(e) => setPresenter(e.target.value as Presenter)}>
                      <option value="talking_avatar">Talking AI creator on camera{avatarUnavailable ? " (needs HeyGen/D-ID key)" : ""}</option>
                      <option value="voiceover">Voiceover over visuals</option>
                      <option value="none">No voice (music + captions)</option>
                    </select>
                  </label>
                  <label className="control-field">
                    <span>Hook (optional)</span>
                    <input value={customHook} onChange={(e) => setCustomHook(e.target.value)} placeholder="Leave blank for an AI hook" />
                  </label>
                  <label className="control-field">
                    <span>Call to action (optional)</span>
                    <input value={callToAction} onChange={(e) => setCta(e.target.value)} placeholder="Link in bio" />
                  </label>
                  <label className="control-field">
                    <span>Voice (optional)</span>
                    <input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder={caps?.voiceover === "elevenlabs" ? "ElevenLabs voice ID" : "e.g. nova, coral, onyx"} />
                  </label>
                  <label className="control-field">
                    <span>Brand colours</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="color" value={colors[0]} onChange={(e) => setColors([e.target.value, colors[1]])} style={{ height: 38, padding: 2, flex: 1 }} />
                      <input type="color" value={colors[1]} onChange={(e) => setColors([colors[0], e.target.value])} style={{ height: 38, padding: 2, flex: 1 }} />
                    </div>
                  </label>
                </div>

                {videoType === "ugc" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6, marginTop: 14 }}>
                    {VIDEO_STYLES.map((s) => (
                      <button key={s.value} onClick={() => setStyle(s.value)} style={{ padding: "10px 8px", border: style === s.value ? "2px solid #3155d8" : "1px solid #ddd8cd", background: style === s.value ? "#edf0ff" : "#fffdf9", borderRadius: 3, textAlign: "left", cursor: "pointer" }}>
                        <strong style={{ display: "block", fontSize: 11 }}>{s.label}</strong>
                        <small style={{ color: "#8c94a1", fontSize: 9 }}>{s.desc}</small>
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 16 }}>
                  <UploadList label="Product photos" hint="Used in product scenes and title cards" accept="image/png,image/jpeg,image/webp" multiple urls={images} onChange={setImages} icon={ImagePlus} />
                  {presenter === "talking_avatar" && (
                    <div>
                      <UploadList label="Presenter photo (optional)" hint={caps?.imageGeneration ? "Leave empty to generate a fictional AI creator" : "Front-facing photo, mouth closed"} accept="image/png,image/jpeg" urls={presenterImage} onChange={setPresenterImage} icon={UserRound} />
                      {presenterImage.length > 0 && (
                        <label style={{ display: "flex", gap: 6, fontSize: 9, color: "#6e7888", marginTop: 6, alignItems: "flex-start" }}>
                          <input type="checkbox" checked={presenterConsent} onChange={(e) => setPresenterConsent(e.target.checked)} />
                          This is me, or I have the person's permission to turn their likeness into a talking AI video.
                        </label>
                      )}
                    </div>
                  )}
                  <UploadList label="Background music (optional)" hint="MP3/WAV, looped and mixed under the voice" accept="audio/mpeg,audio/wav,audio/mp4,audio/aac" urls={music} onChange={setMusic} icon={Music} />
                </div>

                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, fontSize: 10 }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Burned-in captions</label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={generateImages} onChange={(e) => setGenerateImages(e.target.checked)} disabled={!caps?.imageGeneration} /> Generate missing scenes with AI images</label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={disclosure} onChange={(e) => setDisclosure(e.target.checked)} /> Ad / AI disclosure label</label>
                </div>

                <div className="control-footer">
                  <div className="safety-copy" style={{ margin: 0, maxWidth: 420 }}>
                    Paid promotions need an ad disclosure on most platforms, and AI-generated presenters should be labelled as AI. Keep the disclosure on unless you add your own.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {videoType === "ugc" && (
                      <button className="secondary-button" onClick={handleScriptOnly} disabled={scriptMutation.isPending}>
                        <Type size={13} /> {scriptMutation.isPending ? "Writing..." : "Script only"}
                      </button>
                    )}
                    <button className="primary-button" onClick={handleRender} disabled={createMutation.isPending}>
                      <Clapperboard size={16} /> {createMutation.isPending ? "Starting..." : "Generate video"}
                    </button>
                  </div>
                </div>
              </section>

              {activeVideoId && <VideoResult videoId={activeVideoId} onClose={() => setActiveVideoId(null)} />}
            </>
          )}

          {activeTab === "library" && (
            <section className="card-surface" style={{ padding: 19 }}>
              <div className="card-topline">
                <div><span className="section-number">LIBRARY</span><span className="section-title">Your videos</span></div>
                <span className="ai-label"><Film size={13} /> {videosQuery.data?.length ?? 0} VIDEOS</span>
              </div>
              {!videosQuery.data?.length ? (
                <div className="library-empty">
                  <p>No videos yet. Head to Create to make your first one.</p>
                  <button className="primary-button" onClick={() => setActiveTab("create")}>Create first video</button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                  {videosQuery.data.map((video) => (
                    <div key={video.id} style={{ border: "1px solid #e5e0d7", background: "#fbfaf6", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {video.videoUrl ? (
                        <video src={video.videoUrl} poster={video.thumbnailUrl ?? undefined} controls playsInline preload="none" style={{ width: "100%", aspectRatio: video.aspectRatio.replace(":", "/"), background: "#000", maxHeight: 380 }} />
                      ) : (
                        <div className="library-type" style={{ width: "100%", height: 160 }}><Video size={20} /></div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "flex-start" }}>
                        <div>
                          <strong style={{ fontSize: 11, display: "block" }}>{video.title}</strong>
                          <span style={{ fontSize: 9, color: "#8c94a1" }}>{video.videoType} · {video.platform} · {video.duration}s · {video.aspectRatio}</span>
                        </div>
                        <StatusBadge status={video.renderStatus} />
                      </div>
                      {["queued", "rendering"].includes(video.renderStatus) && <RenderProgress video={video} />}
                      <div style={{ display: "flex", gap: 10, fontSize: 10 }}>
                        <button className="text-action" onClick={() => { setActiveVideoId(video.id); setActiveTab("create"); }}>Open</button>
                        {video.videoUrl && <a className="text-action" href={video.videoUrl} download>Download</a>}
                        <button className="text-action" style={{ marginLeft: "auto", color: "#9b4f37" }} disabled={["queued", "rendering"].includes(video.renderStatus)} onClick={async () => {
                          if (!confirm(`Delete "${video.title}"?`)) return;
                          await deleteMutation.mutateAsync({ id: video.id });
                          if (activeVideoId === video.id) setActiveVideoId(null);
                          videosQuery.refetch();
                        }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
