import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Check,
  Hash,
  Layers3,
  Megaphone,
  Plus,
  Sparkles,
  Target,
  X,
} from "lucide-react";

const CONTENT_TYPES = [
  "testimonial",
  "unboxing",
  "tutorial",
  "review",
  "lifestyle",
  "before_after",
  "day_in_life",
  "get_ready",
  "haul",
  "storytelling",
];

const PLATFORM_OPTIONS = ["instagram", "tiktok", "youtube_shorts", "facebook"];

export default function Campaigns() {
  const [, setLocation] = useLocation();
  const workspaceQuery = trpc.workspace.list.useQuery();
  const workspaceId = workspaceQuery.data?.[0]?.id ?? 1;
  const campaignsQuery = trpc.ugc.listCampaigns.useQuery({ workspaceId }, { enabled: workspaceId > 0 });
  const createMutation = trpc.ugc.createCampaign.useMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [objectives, setObjectives] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(["testimonial", "review"]);
  const [generating, setGenerating] = useState(false);
  const [campaignResult, setCampaignResult] = useState<any>(null);

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function toggleType(t: string) {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  async function handleCreate() {
    if (!name.trim() || !productName.trim() || !productCategory.trim() || !targetAudience.trim()) {
      toast.error("Fill in all required fields");
      return;
    }
    if (selectedPlatforms.length === 0) { toast.error("Select at least one platform"); return; }
    if (selectedTypes.length === 0) { toast.error("Select at least one content type"); return; }

    setGenerating(true);
    try {
      const result = await createMutation.mutateAsync({
        workspaceId,
        name,
        productName,
        productCategory,
        targetAudience,
        brandVoice: brandVoice || undefined,
        objectives: objectives || undefined,
        platforms: selectedPlatforms,
        contentTypes: selectedTypes,
      });
      setCampaignResult(result.content);
      await campaignsQuery.refetch();
      toast.success("Campaign created!", { description: `${result.content.scripts.length} scripts, ${result.content.captions.length} captions generated` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campaign creation failed");
    } finally { setGenerating(false); }
  }

  return (
    <div className="studio-shell min-h-screen bg-[#f8f5ef] text-[#1b2333]">
      <main className="studio-main" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <header className="topbar" style={{ justifyContent: "flex-start", gap: 16 }}>
          <button className="text-action" onClick={() => setLocation("/")} style={{ gap: 8 }}>
            <ArrowLeft size={16} /> Back to dashboard
          </button>
        </header>

        <div className="content-wrap" style={{ padding: "32px 0" }}>
          <section className="page-heading" style={{ marginBottom: 32 }}>
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> UGC CAMPAIGNS</div>
              <h1>Plan your<br /><em>campaign.</em></h1>
              <p>Create full UGC marketing campaigns with scripts, captions, hashtags, and posting schedules.</p>
            </div>
            <div>
              <button className="primary-button" onClick={() => setShowCreate(!showCreate)}>
                {showCreate ? <><X size={14} /> Close</> : <><Plus size={14} /> New campaign</>}
              </button>
            </div>
          </section>

          {showCreate && (
            <section className="card-surface" style={{ padding: 19, marginBottom: 24 }}>
              <div className="card-topline">
                <div><span className="section-number">NEW</span><span className="section-title">Create a UGC campaign</span></div>
                <span className="ai-label"><Target size={13} /> FULL CAMPAIGN BUILDER</span>
              </div>

              <div className="control-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <label className="control-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Campaign name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Launch Campaign" />
                </label>

                <label className="control-field">
                  <span>Product name</span>
                  <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="GlowUp Serum" />
                </label>

                <label className="control-field">
                  <span>Product category</span>
                  <input value={productCategory} onChange={(e) => setProductCategory(e.target.value)} placeholder="Skincare" />
                </label>

                <label className="control-field">
                  <span>Target audience</span>
                  <input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Women 25-35 interested in clean beauty" />
                </label>

                <label className="control-field">
                  <span>Brand voice (optional)</span>
                  <input value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="Friendly, authentic, empowering" />
                </label>

                <label className="control-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Campaign objectives (optional)</span>
                  <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} placeholder="Drive product awareness and conversion through authentic-feeling creator content" style={{ minHeight: 50 }} />
                </label>
              </div>

              <div style={{ marginTop: 16 }}>
                <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em", color: "#7c8696", fontWeight: 700, display: "block", marginBottom: 8 }}>Platforms</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {PLATFORM_OPTIONS.map((p) => (
                    <button key={p} onClick={() => togglePlatform(p)} style={{ padding: "8px 14px", border: selectedPlatforms.includes(p) ? "2px solid #3155d8" : "1px solid #ddd8cd", background: selectedPlatforms.includes(p) ? "#edf0ff" : "#fffdf9", borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                      {selectedPlatforms.includes(p) && <Check size={11} />}
                      {p.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: ".1em", color: "#7c8696", fontWeight: 700, display: "block", marginBottom: 8 }}>Content types</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {CONTENT_TYPES.map((t) => (
                    <button key={t} onClick={() => toggleType(t)} style={{ padding: "8px 14px", border: selectedTypes.includes(t) ? "2px solid #3155d8" : "1px solid #ddd8cd", background: selectedTypes.includes(t) ? "#edf0ff" : "#fffdf9", borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                      {selectedTypes.includes(t) && <Check size={11} />}
                      {t.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-footer" style={{ marginTop: 20 }}>
                <div className="safety-copy" style={{ margin: 0 }}>Generates scripts, captions, hashtags, and a posting schedule for your campaign.</div>
                <button className="primary-button" onClick={handleCreate} disabled={generating}>
                  <Sparkles size={16} /> {generating ? "Building campaign..." : "Launch campaign"}
                </button>
              </div>
            </section>
          )}

          {campaignResult && (
            <>
              <section className="card-surface" style={{ padding: 19, marginBottom: 16 }}>
                <div className="card-topline">
                  <div><span className="section-number">CAPTIONS</span><span className="section-title">Ready-to-post captions</span></div>
                  <span className="ai-label"><Megaphone size={13} /> {campaignResult.captions.length} CAPTIONS</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {campaignResult.captions.map((caption: string, i: number) => (
                    <div key={i} style={{ border: "1px solid #e5e0d7", padding: 14, background: "#fbfaf6", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>{caption}</p>
                      <button className="text-action" style={{ flexShrink: 0 }} onClick={() => { navigator.clipboard?.writeText(caption); toast.success("Caption copied"); }}>Copy</button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card-surface" style={{ padding: 19, marginBottom: 16 }}>
                <div className="card-topline">
                  <div><span className="section-number">HASHTAGS</span><span className="section-title">Recommended hashtags</span></div>
                  <span className="ai-label"><Hash size={13} /> {campaignResult.hashtags.length} TAGS</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {campaignResult.hashtags.map((tag: string, i: number) => (
                    <span key={i} style={{ background: "#edf0ff", color: "#3155d8", padding: "6px 10px", borderRadius: 2, fontSize: 11, fontWeight: 600, cursor: "pointer" }} onClick={() => { navigator.clipboard?.writeText(tag); toast.success(`${tag} copied`); }}>
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="text-action" style={{ marginTop: 10 }} onClick={() => { navigator.clipboard?.writeText(campaignResult.hashtags.join(" ")); toast.success("All hashtags copied"); }}>
                  Copy all hashtags
                </button>
              </section>

              <section className="card-surface" style={{ padding: 19, marginBottom: 16 }}>
                <div className="card-topline">
                  <div><span className="section-number">SCHEDULE</span><span className="section-title">Posting schedule</span></div>
                  <span className="ai-label"><Calendar size={13} /> {campaignResult.postingSchedule.length} POSTS</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e5e0d7" }}>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", fontWeight: 700 }}>Day</th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", fontWeight: 700 }}>Time</th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", fontWeight: 700 }}>Platform</th>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: "#8c94a1", fontWeight: 700 }}>Content</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignResult.postingSchedule.slice(0, 10).map((item: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f0ece4" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{item.day}</td>
                          <td style={{ padding: "8px 12px" }}>{item.time}</td>
                          <td style={{ padding: "8px 12px" }}>{item.platform}</td>
                          <td style={{ padding: "8px 12px", color: "#3155d8", fontWeight: 600 }}>{item.contentType.replace(/_/g, " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card-surface" style={{ padding: 19 }}>
                <div className="card-topline">
                  <div><span className="section-number">SCRIPTS</span><span className="section-title">Generated video scripts</span></div>
                  <span className="ai-label"><Layers3 size={13} /> {campaignResult.scripts.length} SCRIPTS</span>
                </div>
                {campaignResult.scripts.map((script: any, i: number) => (
                  <div key={i} style={{ border: "1px solid #e5e0d7", padding: 16, background: "#fbfaf6", marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <strong style={{ fontSize: 12 }}>Script {i + 1}</strong>
                      <span style={{ fontSize: 9, color: "#8c94a1" }}>{script.totalDuration}</span>
                    </div>
                    <div style={{ background: "#1b2333", color: "#f8f5ef", padding: 14, borderRadius: 3, marginBottom: 10 }}>
                      <span style={{ fontSize: 8, color: "#aebeff", textTransform: "uppercase", letterSpacing: ".1em" }}>Hook</span>
                      <p style={{ margin: "6px 0 0", fontSize: 13, fontFamily: "'Bodoni Moda', serif" }}>"{script.hook}"</p>
                    </div>
                    {script.scenes.map((scene: any) => (
                      <div key={scene.sceneNumber} style={{ padding: "8px 0", borderBottom: "1px solid #f0ece4", fontSize: 11 }}>
                        <span style={{ color: "#3155d8", fontWeight: 700, fontSize: 9 }}>SCENE {scene.sceneNumber}</span>
                        <p style={{ margin: "4px 0 0", color: "#4a5568" }}>{scene.dialogue}</p>
                      </div>
                    ))}
                    <p style={{ margin: "10px 0 0", fontSize: 11, color: "#3155d8", fontWeight: 600 }}>{script.callToAction}</p>
                  </div>
                ))}
              </section>
            </>
          )}

          {!showCreate && !campaignResult && (
            <section className="card-surface" style={{ padding: 19 }}>
              <div className="card-topline">
                <div><span className="section-number">ALL</span><span className="section-title">Your campaigns</span></div>
                <span className="ai-label"><Target size={13} /> {campaignsQuery.data?.length ?? 0} CAMPAIGNS</span>
              </div>
              {!campaignsQuery.data?.length ? (
                <div className="library-empty">
                  <p>No campaigns yet. Create your first UGC campaign to generate scripts, captions, and posting schedules.</p>
                  <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={14} /> Create first campaign</button>
                </div>
              ) : (
                <div className="library-list">
                  {campaignsQuery.data.map((campaign) => (
                    <div className="library-item" key={campaign.id} style={{ gridTemplateColumns: "auto 1fr auto" }}>
                      <div className="library-type" style={{ width: 54, height: 54, display: "grid", placeItems: "center" }}>
                        <Target size={18} />
                      </div>
                      <div>
                        <strong>{campaign.name}</strong>
                        <span>{campaign.productName} · {campaign.productCategory}</span>
                        <small style={{ color: "#3155d8" }}>{campaign.targetAudience}</small>
                      </div>
                      <span className="library-status">{campaign.status}</span>
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
