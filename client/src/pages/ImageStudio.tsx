import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { uploadFile } from "@/lib/upload";
import EngineStatus from "@/components/EngineStatus";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ArrowLeft, Download, ImagePlus, Images, Scissors, Sparkles, Trash2, Type, Video } from "lucide-react";

const SOURCES = [
  { value: "ai", label: "Generate with AI", desc: "Describe it and an image model creates it", icon: Sparkles },
  { value: "photo", label: "Design on my photo", desc: "Turn a product photo into an ad creative", icon: ImagePlus },
  { value: "text", label: "Text card", desc: "Brand-colour graphic with your headline", icon: Type },
] as const;

const STYLES = [
  { value: "product_ad", label: "Product ad" },
  { value: "lifestyle", label: "Lifestyle shot" },
  { value: "ugc_selfie", label: "UGC creator selfie" },
  { value: "flat_lay", label: "Flat lay" },
  { value: "thumbnail", label: "Thumbnail background" },
  { value: "custom", label: "Custom (prompt only)" },
] as const;

type Source = (typeof SOURCES)[number]["value"];

export default function ImageStudio() {
  const [, setLocation] = useLocation();
  const workspaceQuery = trpc.workspace.list.useQuery();
  const workspaceId = workspaceQuery.data?.[0]?.id ?? 1;
  const caps = trpc.video.capabilities.useQuery().data;
  const listQuery = trpc.image.list.useQuery({ workspaceId });
  const generateMutation = trpc.image.generate.useMutation();
  const deleteMutation = trpc.image.delete.useMutation();

  const [source, setSource] = useState<Source>("ai");
  const [prompt, setPrompt] = useState("");
  const [productName, setProductName] = useState("");
  const [style, setStyle] = useState<string>("product_ad");
  const [format, setFormat] = useState<"9:16" | "4:5" | "1:1" | "16:9">("1:1");
  const [count, setCount] = useState(2);
  const [layout, setLayout] = useState<"full" | "card">("card");
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [label, setLabel] = useState("");
  const [colors, setColors] = useState<[string, string]>(["#3155d8", "#1b2333"]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [latest, setLatest] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setUploading(0);
    try {
      setPhoto(await uploadFile(file, setUploading));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function handleGenerate() {
    if (source === "ai" && !prompt.trim() && !productName.trim()) { toast.error("Describe the image you want"); return; }
    if (source === "photo" && !photo) { toast.error("Upload a photo first"); return; }
    if (source === "text" && !headline.trim()) { toast.error("Add a headline"); return; }
    try {
      const result = await generateMutation.mutateAsync({
        workspaceId, source, prompt, style: style as any, productName: productName || undefined,
        format, count, photo: photo ?? undefined, layout,
        headline: headline || undefined, subline: subline || undefined, label: label || undefined,
        brandColors: colors,
      });
      setLatest(result.images.map((i) => i.url));
      listQuery.refetch();
      if (result.images.length < result.requested) toast.warning(`Made ${result.images.length} of ${result.requested} images; the rest failed`);
      else toast.success(result.images.length > 1 ? `${result.images.length} images ready` : "Image ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image creation failed");
    }
  }

  const aiOff = source === "ai" && caps && !caps.imageGeneration;

  return (
    <div className="studio-shell min-h-screen bg-[#f8f5ef] text-[#1b2333]">
      <main className="studio-main" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
        <header className="topbar" style={{ justifyContent: "flex-start", gap: 16, padding: "0 8px" }}>
          <button className="text-action" onClick={() => setLocation("/")} style={{ gap: 8 }}><ArrowLeft size={16} /> Dashboard</button>
          <div style={{ flex: 1 }} />
          <button className="text-action" onClick={() => setLocation("/ugc-studio")} style={{ gap: 6 }}><Video size={14} /> Video studio</button>
          <button className="text-action" onClick={() => setLocation("/clipper")} style={{ gap: 6 }}><Scissors size={14} /> Clipper</button>
        </header>

        <div className="content-wrap" style={{ padding: "32px 0" }}>
          <section className="page-heading" style={{ marginBottom: 24 }}>
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> IMAGE STUDIO</div>
              <h1>Ad images,<br /><em>on demand.</em></h1>
              <p>Generate product shots, lifestyle scenes and creator selfies with AI, or turn your own product photo into a finished ad with your headline and brand colours.</p>
            </div>
          </section>

          <section className="card-surface" style={{ padding: 16, marginBottom: 20 }}>
            <EngineStatus only={["images"]} />
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
            {SOURCES.map(({ value, label: l, desc, icon: Icon }) => (
              <button key={value} onClick={() => setSource(value)} style={{ padding: 14, textAlign: "left", cursor: "pointer", borderRadius: 3, border: source === value ? "2px solid #3155d8" : "1px solid #ddd8cd", background: source === value ? "#edf0ff" : "#fffdf9" }}>
                <Icon size={16} style={{ color: "#3155d8" }} />
                <strong style={{ display: "block", fontSize: 12, marginTop: 6 }}>{l}</strong>
                <small style={{ color: "#8c94a1", fontSize: 10 }}>{desc}</small>
              </button>
            ))}
          </div>

          <section className="avatar-control-panel card-surface" style={{ marginTop: 0 }}>
            <div className="control-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {source === "ai" && (
                <>
                  <label className="control-field" style={{ gridColumn: "1 / -1" }}>
                    <span>Describe the image</span>
                    <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Matte black wireless earbuds on a wet stone surface at sunrise, water droplets, moody" style={{ minHeight: 60 }} />
                  </label>
                  <label className="control-field">
                    <span>Product name (optional)</span>
                    <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Nimbus Earbuds" />
                  </label>
                  <label className="control-field">
                    <span>Style</span>
                    <select value={style} onChange={(e) => setStyle(e.target.value)}>
                      {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="control-field">
                    <span>How many</span>
                    <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </>
              )}
              {source === "photo" && (
                <>
                  <div className="reference-upload">
                    <span>Your photo</span>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleFile(e.target.files?.[0])} />
                    <button type="button" className="reference-drop" onClick={() => fileRef.current?.click()} disabled={uploading !== null}>
                      {photo ? <img src={photo} alt="" /> : <><ImagePlus size={16} /><strong>{uploading !== null ? `Uploading ${Math.round(uploading * 100)}%` : "Upload photo"}</strong><small>PNG, JPG or WebP</small></>}
                    </button>
                  </div>
                  <label className="control-field">
                    <span>Layout</span>
                    <select value={layout} onChange={(e) => setLayout(e.target.value as any)}>
                      <option value="card">Product on brand background</option>
                      <option value="full">Photo fills the frame</option>
                    </select>
                  </label>
                </>
              )}
              <label className="control-field">
                <span>Format</span>
                <select value={format} onChange={(e) => setFormat(e.target.value as any)}>
                  <option value="1:1">1:1 square post</option>
                  <option value="4:5">4:5 feed post</option>
                  <option value="9:16">9:16 story / reel cover</option>
                  <option value="16:9">16:9 thumbnail / banner</option>
                </select>
              </label>
              <label className="control-field">
                <span>Headline {source === "text" ? "" : "(optional)"}</span>
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="40 hours. Zero noise." maxLength={80} />
              </label>
              <label className="control-field">
                <span>Subline (optional)</span>
                <input value={subline} onChange={(e) => setSubline(e.target.value)} placeholder="Launching Friday · Link in bio" maxLength={160} />
              </label>
              <label className="control-field">
                <span>Corner label (optional)</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="#ad" maxLength={60} />
              </label>
              {source !== "ai" && (
                <label className="control-field">
                  <span>Brand colours</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="color" value={colors[0]} onChange={(e) => setColors([e.target.value, colors[1]])} style={{ height: 38, padding: 2, flex: 1 }} />
                    <input type="color" value={colors[1]} onChange={(e) => setColors([colors[0], e.target.value])} style={{ height: 38, padding: 2, flex: 1 }} />
                  </div>
                </label>
              )}
            </div>

            <div className="control-footer">
              <div className="safety-copy" style={{ margin: 0, maxWidth: 440 }}>
                {aiOff ? "AI generation is off until OPENAI_API_KEY is set on the server. Design on your photo or make a text card in the meantime." : "AI images of people are fictional. Label paid posts as ads."}
              </div>
              <button className="primary-button" onClick={handleGenerate} disabled={generateMutation.isPending || uploading !== null || Boolean(aiOff)}>
                <Sparkles size={15} /> {generateMutation.isPending ? "Creating..." : "Create image"}
              </button>
            </div>
          </section>

          {latest.length > 0 && (
            <section className="card-surface" style={{ padding: 19, marginTop: 20 }}>
              <div className="card-topline"><div><span className="section-number">RESULT</span><span className="section-title">Just created</span></div></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                {latest.map((url) => (
                  <div key={url}>
                    <img src={url} alt="" style={{ width: "100%", border: "1px solid #e5e0d7", display: "block" }} />
                    <a className="text-action" href={url} download style={{ marginTop: 8 }}><Download size={12} /> Download PNG</a>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card-surface" style={{ padding: 19, marginTop: 20 }}>
            <div className="card-topline">
              <div><span className="section-number">LIBRARY</span><span className="section-title">Your images</span></div>
              <span className="ai-label"><Images size={13} /> {listQuery.data?.length ?? 0}</span>
            </div>
            {!listQuery.data?.length ? (
              <div className="library-empty"><p>No images yet.</p></div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                {listQuery.data.map((img) => (
                  <div key={img.id} style={{ border: "1px solid #e5e0d7", background: "#fbfaf6", padding: 6 }}>
                    <img src={img.assetUrl!} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                      <a className="text-action" href={img.assetUrl!} download><Download size={11} /></a>
                      <span style={{ fontSize: 9, color: "#8c94a1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{img.title}</span>
                      <button className="text-action" style={{ color: "#9b4f37" }} onClick={async () => { await deleteMutation.mutateAsync({ id: img.id }); listQuery.refetch(); }}><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
