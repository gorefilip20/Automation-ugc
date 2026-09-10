import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Clapperboard,
  Copy,
  ChevronDown,
  Film,
  Megaphone,
  Music,
  Play,
  Sparkles,
  Type,
  Video,
  WandSparkles,
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
  { value: "instagram", label: "Instagram Reels" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "facebook", label: "Facebook" },
] as const;

export default function UGCStudio() {
  const [, setLocation] = useLocation();
  const workspaceQuery = trpc.workspace.list.useQuery();
  const workspaceId = workspaceQuery.data?.[0]?.id ?? 1;
  const videosQuery = trpc.ugc.listVideos.useQuery({ workspaceId }, { enabled: workspaceId > 0 });
  const generateMutation = trpc.ugc.generateVideo.useMutation();
  const quickMutation = trpc.ugc.generateQuickContent.useMutation();

  const [title, setTitle] = useState("My First UGC Video");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [style, setStyle] = useState<string>("testimonial");
  const [platform, setPlatform] = useState<string>("instagram");
  const [duration, setDuration] = useState(30);
  const [customHook, setCustomHook] = useState("");
  const [callToAction, setCta] = useState("");
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "library">("create");
  const [quickPrompt, setQuickPrompt] = useState("");

  async function handleGenerate() {
    if (!productName.trim()) { toast.error("Enter a product name"); return; }
    if (!productDescription.trim()) { toast.error("Enter a product description"); return; }
    setGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        workspaceId,
        title,
        productName,
        productDescription,
        style: style as any,
        platform: platform as any,
        duration,
        customHook: customHook || undefined,
        callToAction: callToAction || undefined,
      });
      setGeneratedScript(result.script);
      await videosQuery.refetch();
      toast.success("UGC video script generated!", { description: `${style} style for ${platform}` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally { setGenerating(false); }
  }

  async function handleQuickGenerate() {
    if (!quickPrompt.trim() || !productName.trim()) { toast.error("Enter both a prompt and product name"); return; }
    setGenerating(true);
    try {
      const result = await quickMutation.mutateAsync({
        workspaceId,
        prompt: quickPrompt,
        productName,
        platform: platform as any,
      });
      setGeneratedScript(result.script);
      await videosQuery.refetch();
      toast.success("Quick UGC content generated!", { description: `${result.style} style` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally { setGenerating(false); }
  }

  function copyScript() {
    if (!generatedScript) return;
    const text = [
      `HOOK: ${generatedScript.hook}`,
      "",
      ...generatedScript.scenes.map((s: any) =>
        `SCENE ${s.sceneNumber} (${s.duration}):\nVisual: ${s.visual}\nDialogue: ${s.dialogue}\nText overlay: ${s.textOverlay}\nTransition: ${s.transition}`
      ),
      "",
      `VOICEOVER: ${generatedScript.voiceover}`,
      `CTA: ${generatedScript.callToAction}`,
      `MUSIC: ${generatedScript.musicSuggestion}`,
      `CAPTIONS: ${generatedScript.captionStyle}`,
    ].join("\n");
    navigator.clipboard?.writeText(text);
    toast.success("Full script copied to clipboard");
  }

  return (
    <div className="studio-shell min-h-screen bg-[#f8f5ef] text-[#1b2333]">
      <main className="studio-main" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <header className="topbar" style={{ justifyContent: "flex-start", gap: 16 }}>
          <button className="text-action" onClick={() => setLocation("/")} style={{ gap: 8 }}>
            <ArrowLeft size={16} /> Back to dashboard
          </button>
          <div style={{ flex: 1 }} />
          <div className="topbar-actions">
            <button className={`footer-tools button ${activeTab === "create" ? "selected" : ""}`} onClick={() => setActiveTab("create")} style={{ border: "1px solid #dcd7cd", background: activeTab === "create" ? "#1b2333" : "#f8f5ef", color: activeTab === "create" ? "#fff" : "#8991a0", padding: "6px 14px", font: "500 10px 'DM Sans'", borderRadius: 3 }}>
              <WandSparkles size={13} /> Create
            </button>
            <button className={`footer-tools button ${activeTab === "library" ? "selected" : ""}`} onClick={() => setActiveTab("library")} style={{ border: "1px solid #dcd7cd", background: activeTab === "library" ? "#1b2333" : "#f8f5ef", color: activeTab === "library" ? "#fff" : "#8991a0", padding: "6px 14px", font: "500 10px 'DM Sans'", borderRadius: 3 }}>
              <Film size={13} /> Library
            </button>
          </div>
        </header>

        <div className="content-wrap" style={{ padding: "32px 0" }}>
          <section className="page-heading" style={{ marginBottom: 32 }}>
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> UGC VIDEO STUDIO</div>
              <h1>Create UGC<br /><em>that converts.</em></h1>
              <p>Generate realistic UGC video scripts, hooks, scenes, and voiceovers for any product on any platform.</p>
            </div>
          </section>

          {activeTab === "create" && (
            <>
              <section className="card-surface" style={{ padding: 19, marginBottom: 24 }}>
                <div className="card-topline">
                  <div><span className="section-number">QUICK</span><span className="section-title">Generate from a prompt</span></div>
                  <span className="ai-label"><Sparkles size={13} /> AI POWERED</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 200px auto", gap: 12, alignItems: "end" }}>
                  <label className="control-field">
                    <span>Describe what you want</span>
                    <textarea value={quickPrompt} onChange={(e) => setQuickPrompt(e.target.value)} placeholder="e.g. Create a natural unboxing video for a luxury skincare set targeting millennial women" style={{ minHeight: 50 }} />
                  </label>
                  <label className="control-field">
                    <span>Product name</span>
                    <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. GlowUp Serum" />
                  </label>
                  <button className="primary-button" onClick={handleQuickGenerate} disabled={generating} style={{ height: 42, marginBottom: 0 }}>
                    <Sparkles size={14} /> {generating ? "Generating..." : "Quick generate"}
                  </button>
                </div>
              </section>

              <section className="avatar-control-panel card-surface" style={{ marginTop: 0 }}>
                <div className="card-topline">
                  <div><span className="section-number">STUDIO</span><span className="section-title">Full UGC video builder</span></div>
                  <span className="ai-label"><Video size={13} /> FULL CONTROL</span>
                </div>

                <div className="control-grid" style={{ gridTemplateColumns: "1.5fr 1fr 1fr" }}>
                  <label className="control-field control-wide" style={{ gridColumn: "1 / -1" }}>
                    <span>Video title</span>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} />
                  </label>

                  <label className="control-field">
                    <span>Product name</span>
                    <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="GlowUp Vitamin C Serum" />
                  </label>

                  <label className="control-field" style={{ gridColumn: "span 2" }}>
                    <span>Product description</span>
                    <input value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="A lightweight vitamin C serum that brightens and hydrates skin" />
                  </label>

                  <label className="control-field">
                    <span>UGC Style</span>
                    <select value={style} onChange={(e) => setStyle(e.target.value)}>
                      {VIDEO_STYLES.map((s) => <option key={s.value} value={s.value}>{s.label} ({s.desc})</option>)}
                    </select>
                  </label>

                  <label className="control-field">
                    <span>Platform</span>
                    <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                      {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </label>

                  <label className="control-field">
                    <span>Duration (seconds)</span>
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                      <option value={15}>15s (Quick)</option>
                      <option value={30}>30s (Standard)</option>
                      <option value={60}>60s (Extended)</option>
                      <option value={90}>90s (Long-form)</option>
                      <option value={120}>120s (Deep dive)</option>
                    </select>
                  </label>

                  <label className="control-field" style={{ gridColumn: "span 2" }}>
                    <span>Custom hook (optional)</span>
                    <input value={customHook} onChange={(e) => setCustomHook(e.target.value)} placeholder="Leave blank for AI-generated hook" />
                  </label>

                  <label className="control-field">
                    <span>Call to action (optional)</span>
                    <input value={callToAction} onChange={(e) => setCta(e.target.value)} placeholder="Link in bio!" />
                  </label>
                </div>

                <div className="control-footer">
                  <div className="safety-copy" style={{ margin: 0 }}>Every script includes natural dialogue, realistic scene directions, and platform-specific formatting.</div>
                  <button className="primary-button" onClick={handleGenerate} disabled={generating}>
                    <Clapperboard size={16} /> {generating ? "Generating script..." : "Generate UGC video"}
                  </button>
                </div>
              </section>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 16 }}>
                {VIDEO_STYLES.map((s) => (
                  <button key={s.value} onClick={() => setStyle(s.value)} style={{ padding: "12px 8px", border: style === s.value ? "2px solid #3155d8" : "1px solid #ddd8cd", background: style === s.value ? "#edf0ff" : "#fffdf9", borderRadius: 3, textAlign: "left", cursor: "pointer" }}>
                    <strong style={{ display: "block", fontSize: 11, fontWeight: 700 }}>{s.label}</strong>
                    <small style={{ color: "#8c94a1", fontSize: 9 }}>{s.desc}</small>
                  </button>
                ))}
              </div>

              {generatedScript && (
                <section className="card-surface" style={{ padding: 19, marginTop: 24 }}>
                  <div className="card-topline">
                    <div><span className="section-number">RESULT</span><span className="section-title">Generated UGC script</span></div>
                    <button className="text-action" onClick={copyScript}><Copy size={13} /> Copy full script</button>
                  </div>

                  <div style={{ background: "#1b2333", color: "#f8f5ef", padding: 20, borderRadius: 3, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Megaphone size={15} style={{ color: "#aebeff" }} />
                      <span style={{ fontSize: 9, letterSpacing: ".1em", color: "#aebeff", textTransform: "uppercase", fontWeight: 700 }}>Hook</span>
                    </div>
                    <p style={{ fontSize: 16, fontFamily: "'Bodoni Moda', serif", lineHeight: 1.4, margin: 0 }}>"{generatedScript.hook}"</p>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    {generatedScript.scenes.map((scene: any) => (
                      <div key={scene.sceneNumber} style={{ border: "1px solid #e5e0d7", padding: 16, background: "#fbfaf6" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ background: "#3155d8", color: "#fff", fontSize: 9, fontWeight: 700, padding: "3px 6px", borderRadius: 2 }}>SCENE {scene.sceneNumber}</span>
                            <span style={{ fontSize: 10, color: "#8c94a1" }}>{scene.duration}</span>
                          </div>
                          <span style={{ fontSize: 9, color: "#3155d8", fontWeight: 600 }}>{scene.transition}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", marginBottom: 4, fontWeight: 700 }}>
                              <Play size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Visual direction
                            </div>
                            <p style={{ fontSize: 11, lineHeight: 1.5, margin: 0, color: "#4a5568" }}>{scene.visual}</p>
                          </div>
                          <div>
                            <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", marginBottom: 4, fontWeight: 700 }}>
                              <Megaphone size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Dialogue
                            </div>
                            <p style={{ fontSize: 11, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>"{scene.dialogue}"</p>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, padding: "8px 10px", background: "#edf0ff", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Type size={11} style={{ color: "#3155d8" }} />
                          <span style={{ fontSize: 10, color: "#3155d8", fontWeight: 600 }}>{scene.textOverlay}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 20, padding: "16px 0", borderTop: "1px solid #e5e0d7" }}>
                    <div>
                      <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", marginBottom: 6, fontWeight: 700 }}>
                        <Megaphone size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Call to action
                      </div>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{generatedScript.callToAction}</p>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", marginBottom: 6, fontWeight: 700 }}>
                        <Music size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Music style
                      </div>
                      <p style={{ fontSize: 11, margin: 0, color: "#4a5568" }}>{generatedScript.musicSuggestion}</p>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", marginBottom: 6, fontWeight: 700 }}>
                        <Type size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Caption format
                      </div>
                      <p style={{ fontSize: 11, margin: 0, color: "#4a5568" }}>{generatedScript.captionStyle}</p>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, textAlign: "center" }}>
                    <span className="ai-label" style={{ justifyContent: "center" }}><Sparkles size={11} /> AI-GENERATED UGC SCRIPT · DISCLOSURE REQUIRED</span>
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab === "library" && (
            <section className="card-surface" style={{ padding: 19 }}>
              <div className="card-topline">
                <div><span className="section-number">LIBRARY</span><span className="section-title">Generated UGC videos</span></div>
                <span className="ai-label"><Film size={13} /> {videosQuery.data?.length ?? 0} VIDEOS</span>
              </div>
              {!videosQuery.data?.length ? (
                <div className="library-empty">
                  <p>No UGC videos generated yet. Head to the Create tab to build your first script.</p>
                  <button className="primary-button" onClick={() => setActiveTab("create")}>Create first video</button>
                </div>
              ) : (
                <div className="library-list">
                  {videosQuery.data.map((video) => (
                    <div className="library-item" key={video.id} style={{ gridTemplateColumns: "auto 1fr auto" }}>
                      <div className="library-type" style={{ width: 54, height: 54, display: "grid", placeItems: "center" }}>
                        <Video size={18} />
                      </div>
                      <div>
                        <strong>{video.title}</strong>
                        <span>{video.platform} · {video.style} · {video.duration}s</span>
                        <small style={{ color: "#3155d8" }}>{video.productName}</small>
                      </div>
                      <span className="library-status">{video.status}</span>
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
