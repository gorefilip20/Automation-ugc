/* Studio Paper reminder: editorial software with warm ivory surfaces, ink navy structure, Studio Cobalt actions, ruled dividers, and contact-sheet previews. */
import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  FileText,
  Film,
  Image as ImageIcon,
  Layers3,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Play,
  Plus,
  ScanFace,
  Scissors,
  Settings2,
  Sparkles,
  Target,
  Video,
  WandSparkles,
  X,
} from "lucide-react";

const avatarImage = "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85";
const cobaltImage = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=85";
const weekendImage = "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=85";
const activeImage = "https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=900&q=85";
const logoImage = "";

const navItems = [
  { label: "Overview", icon: Layers3 },
  { label: "Avatar studio", icon: ScanFace },
  { label: "Video studio", icon: Video, route: "/ugc-studio" },
  { label: "Stream clipper", icon: Scissors, route: "/clipper" },
  { label: "Image studio", icon: ImageIcon, route: "/image-studio" },
  { label: "Campaigns", icon: Clapperboard, route: "/campaigns" },
  { label: "Content library", icon: ImageIcon },
];

function explainGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("10001") || message.toLowerCase().includes("login") || message.toLowerCase().includes("unauthorized")) return "Sign in is required before the studio can generate and save an avatar.";
  if (message.toLowerCase().includes("storage") || message.toLowerCase().includes("reference image could not be prepared")) return "The reference upload could not be prepared. Please upload the image again and retry.";
  if (message.toLowerCase().includes("image generation") || message.toLowerCase().includes("provider")) return "The image provider did not return an asset. Keep the brief specific and try again.";
  return "The avatar could not be generated. Please review the brief and try again.";
}

const styleOptions = [
  { label: "Editorial", detail: "Polished, considered", image: cobaltImage },
  { label: "Weekend", detail: "Warm, candid", image: weekendImage },
  { label: "Active", detail: "Energetic, direct", image: activeImage },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const workspaceQuery = trpc.workspace.list.useQuery(undefined, { enabled: isAuthenticated });
  const workspaceId = workspaceQuery.data?.[0]?.id ?? 0;
  const libraryQuery = trpc.content.list.useQuery({ workspaceId }, { enabled: isAuthenticated && workspaceId > 0 });
  const avatarMutation = trpc.avatar.generate.useMutation();
  const exportMutation = trpc.content.createExport.useMutation();
  const workspaceCreateMutation = trpc.workspace.create.useMutation();
  const batchMutation = trpc.avatar.batchGenerate.useMutation();
  const selectVariationMutation = trpc.avatar.selectVariation.useMutation();
  const reorderVariationsMutation = trpc.avatar.reorderVariations.useMutation();
  const regenerateMutation = trpc.avatar.regenerate.useMutation();
  const batchExportMutation = trpc.avatar.batchExport.useMutation();
  const [activeNav, setActiveNav] = useState("Overview");
  const [activeStyle, setActiveStyle] = useState("Editorial");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Introduce Aria to a new audience with a thoughtful, everyday ritual.");
  const [selectedFormat, setSelectedFormat] = useState("Carousel");
  const [approved, setApproved] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [seed, setSeed] = useState(1842);
  const [pose, setPose] = useState("Natural three-quarter portrait");
  const [wardrobe, setWardrobe] = useState("Cobalt blazer · fully covered");
  const [setting, setSetting] = useState("Warm coastal beach at golden hour");
  const [composition, setComposition] = useState("Full-body editorial lookbook frame");
  const [identityLock, setIdentityLock] = useState(true);
  const [referenceImage, setReferenceImage] = useState<{ b64Json: string; mimeType: string; fileName: string } | undefined>();
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(3);
  const [batchWardrobes, setBatchWardrobes] = useState(["Cobalt blazer · fully covered", "Cream knit set · relaxed fit", "Black activewear set · fully covered", "Ivory evening tailoring · fully covered"]);
  const [batchResults, setBatchResults] = useState<Array<{ profileId: number; contentId: number; imageUrl?: string; seed: number; variationIndex: number; isSelected: boolean; wardrobe: string; exportSelected: boolean }>>([]);
  const [draggedVariation, setDraggedVariation] = useState<number | null>(null);
  const [variationGroup, setVariationGroup] = useState<string | null>(null);
  const [generatedWorkspaceId, setGeneratedWorkspaceId] = useState(0);

  const activeLook = useMemo(
    () => styleOptions.find((item) => item.label === activeStyle) ?? styleOptions[0],
    [activeStyle],
  );

  function handleReferenceChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast.error('Please upload a PNG, JPEG, or WebP image'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const b64Json = result.split(',')[1] ?? '';
      setReferenceImage({ b64Json, mimeType: file.type, fileName: file.name });
      setReferencePreview(result);
      toast.success('Reference image attached');
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!isAuthenticated) { toast.info("Sign in to generate and save an avatar"); startLogin(); return; }
    setGenerating(true); setApproved(false); setGenerationError(null);
    try {
      let activeWorkspaceId = workspaceId;
      if (!activeWorkspaceId) {
        activeWorkspaceId = await workspaceCreateMutation.mutateAsync({ name: "Aria Vale / Studio", creatorName: "Aria Vale", creatorBio: "A thoughtful fictional virtual creator for everyday rituals.", persona: "Curious, warm, specific, and observant.", voice: "Warm, considered, never salesy.", visualAnchor: "Warm olive skin, shoulder-length dark wavy hair, hazel eyes, softly angular face.", disclosureEnabled: true });
        await workspaceQuery.refetch();
      }
      const result = await avatarMutation.mutateAsync({ workspaceId: activeWorkspaceId, prompt, seed, pose, wardrobe, setting, composition, identityLock, ageConfirmed: true, ...(referenceImage ? { referenceImage } : {}) });
      setGeneratedImage(result.imageUrl ?? null);
      toast.success("Avatar ready for your review", { description: "The visual anchor and disclosure stamp were saved to your library." });
      await libraryQuery.refetch();
    } catch (error) { const message = explainGenerationError(error); setGenerationError(message); toast.error(message); }
    finally { setGenerating(false); }
  }

  async function handleBatchGenerate() {
    if (!isAuthenticated) { toast.info("Sign in to generate and compare variations"); startLogin(); return; }
    setGenerating(true); setGenerationError(null);
    try {
      let activeWorkspaceId = workspaceId;
      if (!activeWorkspaceId) { activeWorkspaceId = await workspaceCreateMutation.mutateAsync({ name: "Aria Vale / Studio", creatorName: "Aria Vale", creatorBio: "A thoughtful fictional virtual creator for everyday rituals.", persona: "Curious, warm, specific, and observant.", voice: "Warm, considered, never salesy.", visualAnchor: "Warm olive skin, shoulder-length dark wavy hair, hazel eyes, softly angular face.", disclosureEnabled: true }); setGeneratedWorkspaceId(activeWorkspaceId); await workspaceQuery.refetch(); } else { setGeneratedWorkspaceId(activeWorkspaceId); }
      const result = await batchMutation.mutateAsync({ workspaceId: activeWorkspaceId, prompt, seed, pose, wardrobe, setting, composition, identityLock, ageConfirmed: true, count: batchCount, wardrobes: batchWardrobes.slice(0, batchCount), ...(referenceImage ? { referenceImage } : {}) });
      setVariationGroup(result.variationGroup); setBatchResults(result.results.map((item, index) => ({ ...item, exportSelected: index === 0 }))); setActiveNav("Avatar studio");
      toast.success(`${result.results.length} variations ready for comparison`, { description: "Choose a winner or download any frame." });
    } catch (error) { const message = explainGenerationError(error); setGenerationError(message); toast.error(message); }
    finally { setGenerating(false); }
  }

  async function handleSelectVariation(profileId: number) {
    const activeWorkspaceId = workspaceId || generatedWorkspaceId;
    if (!activeWorkspaceId || !variationGroup) return;
    setBatchResults((items) => items.map((item) => ({ ...item, isSelected: item.profileId === profileId })));
    await selectVariationMutation.mutateAsync({ workspaceId: activeWorkspaceId, variationGroup, profileId });
    toast.success("Variation selected as the lead frame");
  }

  function toggleExportSelection(profileId: number) {
    setBatchResults((items) => items.map((item) => item.profileId === profileId ? { ...item, exportSelected: !item.exportSelected } : item));
  }

  async function handleRegenerateVariation(item: { profileId: number; seed: number; wardrobe: string }) {
    const activeWorkspaceId = workspaceId || generatedWorkspaceId;
    if (!activeWorkspaceId) { toast.info("Sign in to regenerate this variation"); return; }
    try {
      const result = await regenerateMutation.mutateAsync({ workspaceId: activeWorkspaceId, profileId: item.profileId, prompt, seed: item.seed + 101, pose, wardrobe: item.wardrobe, setting, composition, identityLock, ageConfirmed: true });
      setBatchResults((items) => items.map((variation) => variation.profileId === item.profileId ? { ...variation, imageUrl: result.imageUrl, seed: result.seed } : variation));
      toast.success("Variation regenerated", { description: "The identity anchor and outfit brief were preserved." });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Regeneration failed"); }
  }

  async function handleDropVariation(targetProfileId: number) {
    if (draggedVariation === null || draggedVariation === targetProfileId) return;
    const activeWorkspaceId = workspaceId || generatedWorkspaceId;
    const from = batchResults.findIndex((item) => item.profileId === draggedVariation);
    const to = batchResults.findIndex((item) => item.profileId === targetProfileId);
    if (from < 0 || to < 0) return;
    const reordered = [...batchResults]; const [moved] = reordered.splice(from, 1); reordered.splice(to, 0, moved);
    const ranked = reordered.map((item, index) => ({ ...item, variationIndex: index }));
    setBatchResults(ranked); setDraggedVariation(null);
    if (activeWorkspaceId && variationGroup) await reorderVariationsMutation.mutateAsync({ workspaceId: activeWorkspaceId, variationGroup, profileIds: ranked.map((item) => item.profileId) });
    toast.success("Comparison order saved");
  }

  async function handleBatchExport(platform: "Instagram" | "TikTok") {
    const activeWorkspaceId = workspaceId || generatedWorkspaceId;
    if (!activeWorkspaceId || !variationGroup || batchResults.filter((item) => item.exportSelected).length === 0) { toast.info("Select at least one variation before exporting"); return; }
    try { await batchExportMutation.mutateAsync({ workspaceId: activeWorkspaceId, variationGroup, profileIds: batchResults.filter((item) => item.exportSelected).map((item) => item.profileId), platform }); await libraryQuery.refetch(); toast.success(`${platform} batch export saved`, { description: platform === "Instagram" ? "Carousel-ready frames with disclosure." : "Vertical-ready frames with disclosure." }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Batch export failed"); }
  }

  async function handleExport() {
    if (!isAuthenticated || !workspaceId) { toast.info("Sign in and select a workspace to export"); return; }
    try {
      await exportMutation.mutateAsync({ workspaceId, title: `${activeStyle} launch draft`, channel: selectedFormat === "Reel" ? "TikTok" : selectedFormat === "Square ad" ? "Product ad" : "Instagram", format: selectedFormat === "Reel" ? "Reel" : selectedFormat === "Square ad" ? "Square ad" : "Carousel", caption: "The best parts of the day are usually the ones you make room for." });
      setApproved(true); await libraryQuery.refetch(); toast.success("Export saved with disclosure stamp");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Export failed"); }
  }

  function handleCopy() {
    navigator.clipboard?.writeText("Meet Aria Vale — a thoughtful virtual creator for the rituals that make a day feel like yours.");
    toast.success("Caption copied");
  }

  return (
    <div className="studio-shell min-h-screen bg-[#f8f5ef] text-[#1b2333]">
      <aside className={`studio-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><img src={logoImage} alt="" /></div>
          <div><div className="brand-name">Influencer</div><div className="brand-stamp">SMART / STUDIO</div></div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-label">Your workspace <ChevronDown size={14} /></div>
        <div className="workspace-card"><div className="workspace-avatar">AV</div><div><strong>{workspaceQuery.data?.[0]?.creatorName ?? "Aria Vale"}</strong><span>{isAuthenticated ? "Saved workspace" : "Preview workspace"}</span></div><MoreHorizontal size={17} /></div>
        <nav className="studio-nav" aria-label="Studio navigation">
          <div className="nav-kicker">Workspace</div>
          {navItems.map(({ label, icon: Icon, route }: any) => <button key={label} onClick={() => { if (route) { setLocation(route); } else { setActiveNav(label); setMobileOpen(false); } }} className={activeNav === label ? "active" : ""}><Icon size={17} /><span>{label}</span>{label === "Content library" && <span className="nav-count">{libraryQuery.data?.length ?? 12}</span>}</button>)}
          <div className="nav-kicker nav-kicker-spaced">Project files</div>
          <button className="file-link"><FileText size={16} /><span>persona.md</span><span className="file-dot ready" /></button>
          <button className="file-link"><MessageSquareText size={16} /><span>voice.md</span><span className="file-dot ready" /></button>
          <button className="file-link"><ScanFace size={16} /><span>visual-anchor.md</span><span className="file-dot ready" /></button>
          <button className="file-link"><FileText size={16} /><span>brain.md</span><span className="file-dot muted" /></button>
        </nav>
        <div className="sidebar-bottom"><div className="disclosure-note"><span className="disclosure-dot" /> All output is labeled AI-generated.</div><button className="settings-button"><Settings2 size={16} /> Settings</button>{isAuthenticated ? <div className="profile-row"><div className="profile-avatar">{(user?.name ?? "JM").slice(0, 2).toUpperCase()}</div><div><strong>{user?.name ?? "Creator"}</strong><span>Creator plan</span></div><button className="profile-logout" onClick={() => logout()}>Log out</button></div> : <button className="profile-row sign-in-row" onClick={() => startLogin()}><div className="profile-avatar">→</div><div><strong>Sign in to save</strong><span>Unlock your studio</span></div><ChevronDown size={15} /></button>}</div>
      </aside>

      <main className="studio-main">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{activeNav}</strong></div><div className="topbar-actions"><span className="status-pill"><span /> Autosaved 2m ago</span><button className="icon-button" aria-label="Notifications"><MessageSquareText size={18} /></button><button className="new-button" onClick={() => toast.info("Choose a studio to start a new draft")}> <Plus size={16} /> New project</button></div></header>

        <div className="content-wrap">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Monday, 25 August 2026</div><h1>Make a creator<br /><em>people remember.</em></h1><p>Shape the point of view, then let the studio carry it across every frame.</p></div><div className="heading-actions"><button className="quiet-button" onClick={() => toast.info("A short tour is coming soon")}>Take a tour <ArrowUpRight size={15} /></button></div></section>

          <section className="overview-strip"><div><span className="metric-label">Active creator</span><strong>Aria Vale</strong></div><div><span className="metric-label">Consistency score</span><strong>94<span className="metric-unit">%</span></strong></div><div><span className="metric-label">Drafts this month</span><strong>08</strong></div><div className="strip-action"><button onClick={() => { setActiveNav("Avatar studio"); toast.success("Avatar studio opened"); }}>Open avatar studio <ArrowUpRight size={15} /></button></div></section>

          <section className="workspace-grid">
            <div className="preview-card card-surface">
              <div className="card-topline"><div><span className="section-number">01</span><span className="section-title">Live creator preview</span></div><span className="ai-label"><Sparkles size={13} /> AI GENERATED</span></div>
              <div className="portrait-stage"><img src={generatedImage ?? avatarImage} alt="Aria Vale, a fictional virtual creator in a cobalt blazer" /><div className="portrait-tag"><span className="tag-corner" /> ARIA / 01 <span>Editorial base</span></div><button className="preview-play" onClick={() => toast.info("Preview playback is available when a video draft is generated")} aria-label="Preview motion"><Play size={18} fill="currentColor" /></button></div>
              <div className="preview-footer"><div><strong>Aria Vale</strong><span>Fictional virtual creator · disclosed</span></div><div className="preview-actions">{generatedImage && <a className="download-action" href={generatedImage} download="influencer-smart-avatar.png"><ArrowUpRight size={14} /> Download image</a>}<button className="text-action" onClick={() => { setActiveNav("Avatar studio"); toast.info("Avatar studio opened"); }}>Edit identity <ArrowUpRight size={14} /></button></div></div>
            </div>

            <div className="right-stack">
              <div className="brief-card card-surface"><div className="card-topline"><div><span className="section-number">02</span><span className="section-title">Today’s brief</span></div><button className="more-icon" aria-label="More brief options"><MoreHorizontal size={17} /></button></div><h2>Small rituals,<br /><em>real feeling.</em></h2><p>Build a softer entry point for Aria’s everyday-living series.</p><div className="brief-meta"><div><span>Channel</span><strong>Instagram</strong></div><div><span>Format</span><strong>{selectedFormat}</strong></div><div><span>Due</span><strong>Today, 4:00 PM</strong></div></div><button className="primary-button full" onClick={handleGenerate} disabled={generating}>{generating ? <><span className="spinner" /> Developing draft...</> : <><WandSparkles size={16} /> Generate from brief</>}</button></div>
              <div className="consistency-card card-surface"><div className="card-topline"><div><span className="section-number">03</span><span className="section-title">Brand consistency</span></div><span className="score-badge">94 / 100</span></div><div className="progress-line"><span /></div><div className="consistency-row"><div><strong>Voice &amp; point of view</strong><span>Warm, specific, never salesy</span></div><Check size={17} /></div><div className="consistency-row"><div><strong>Visual anchor</strong><span>Identity held across 12 assets</span></div><Check size={17} /></div><div className="consistency-row warning"><div><strong>Disclosure stamp</strong><span>Applied to every export</span></div><Check size={17} /></div></div>
            </div>
          </section>

          {activeNav === "Avatar studio" && <section className="avatar-control-panel card-surface">
            <div className="card-topline"><div><span className="section-number">STUDIO</span><span className="section-title">Generate a new identity-safe frame</span></div><span className="ai-label"><Sparkles size={13} /> SERVER-SIDE GENERATION</span></div>
            <div className="control-grid"><label className="control-field control-wide"><span>Creative prompt</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label><label className="control-field"><span>Pose</span><select value={pose} onChange={(event) => setPose(event.target.value)}><option>Natural three-quarter portrait</option><option>Walking candid</option><option>Seated product demo</option><option>Full-body lookbook</option></select></label><label className="control-field"><span>Wardrobe</span><input value={wardrobe} onChange={(event) => setWardrobe(event.target.value)} /></label><label className="control-field"><span>Seed</span><input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label><label className="control-field"><span>Setting</span><select value={setting} onChange={(event) => setSetting(event.target.value)}><option>Warm coastal beach at golden hour</option><option>Clean editorial studio</option><option>Modern city street</option><option>Product tabletop scene</option></select></label><label className="control-field"><span>Composition</span><select value={composition} onChange={(event) => setComposition(event.target.value)}><option>Full-body editorial lookbook frame</option><option>Three-quarter fashion portrait</option><option>Close-up beauty crop</option><option>Product-in-hand medium shot</option></select></label><label className="reference-upload"><span>Reference image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleReferenceChange} /><div className="reference-drop">{referencePreview ? <img src={referencePreview} alt="Uploaded generation reference" /> : <><Plus size={16} /><strong>Upload sample</strong><small>PNG, JPG, WebP · adult subjects only</small></>}</div></label><div className="batch-wardrobe-fields control-wide"><span>Batch wardrobe styles</span>{batchWardrobes.slice(0, batchCount).map((style, index) => <input key={index} value={style} onChange={(event) => setBatchWardrobes((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} aria-label={`Wardrobe variation ${index + 1}`} />)}</div></div>
            <div className="control-footer"><label className="lock-toggle"><input type="checkbox" checked={identityLock} onChange={(event) => setIdentityLock(event.target.checked)} /><span className="toggle-track"><span /></span><strong>Identity lock</strong><small>Keep face, hair, and visual anchor consistent</small></label><div className="batch-actions"><select value={batchCount} onChange={(event) => setBatchCount(Number(event.target.value))} aria-label="Number of variations"><option value={2}>2 variations</option><option value={3}>3 variations</option><option value={4}>4 variations</option></select><button className="secondary-button" onClick={handleBatchGenerate} disabled={generating}><Layers3 size={15} /> {generating ? "Comparing…" : "Generate batch"}</button><button className="primary-button" onClick={handleGenerate} disabled={generating}><WandSparkles size={16} /> {generating ? "Generating securely…" : "Generate avatar"}</button></div></div>
            {generationError && <div className="generation-error" role="alert">{generationError}</div>}<div className="safety-copy">Adults only. Fictional likenesses only. Clothing and posing prompts are reviewed server-side, and every generated asset carries a disclosure stamp.</div>
          </section>}

          {batchResults.length > 1 && <section className="comparison-panel card-surface"><div className="card-topline"><div><span className="section-number">COMPARE</span><span className="section-title">Batch variations</span></div><span className="ai-label"><Layers3 size={13} /> {batchResults.length} FRAMES · SAME BRIEF</span></div><div className="comparison-grid">{batchResults.map((item) => <article className={`variation-card ${item.isSelected ? "selected" : ""}`} key={item.profileId} draggable onDragStart={() => setDraggedVariation(item.profileId)} onDragOver={(event) => event.preventDefault()} onDrop={() => handleDropVariation(item.profileId)}><span className="drag-handle" title="Drag to rank">⋮⋮</span>{item.imageUrl ? <img src={item.imageUrl} alt={`Variation ${item.variationIndex + 1}`} /> : <div className="variation-loading">Ready</div>}<div className="variation-meta"><div><strong>Variation {item.variationIndex + 1}</strong><span>Seed {item.seed}</span><small>{item.wardrobe}</small></div>{item.isSelected && <span className="lead-badge">LEAD</span>}</div><div className="variation-actions">{item.imageUrl && <a href={item.imageUrl} download={`influencer-smart-variation-${item.variationIndex + 1}.png`}>Download</a>}<button onClick={() => toggleExportSelection(item.profileId)}>{item.exportSelected ? "In export" : "Add to export"}</button><button onClick={() => handleRegenerateVariation(item)} disabled={regenerateMutation.isPending}>Regenerate</button><button onClick={() => handleSelectVariation(item.profileId)} disabled={item.isSelected}>{item.isSelected ? "Selected" : "Select winner"}</button></div></article>)}</div><div className="comparison-export-bar"><span>Export selected batch</span><button onClick={() => handleBatchExport("Instagram")} disabled={batchExportMutation.isPending}>Instagram carousel</button><button onClick={() => handleBatchExport("TikTok")} disabled={batchExportMutation.isPending}>TikTok vertical</button></div><div className="safety-copy">Every comparison frame is a fictional adult virtual creator asset and carries the Influencer Smart AI disclosure in the saved library. Drag cards to rank them before exporting.</div></section>}

          {activeNav === "Content library" && <section className="library-panel card-surface"><div className="card-topline"><div><span className="section-number">LIBRARY</span><span className="section-title">Saved content</span></div><span className="ai-label"><ImageIcon size={13} /> {libraryQuery.data?.length ?? 0} ITEMS</span></div>{!isAuthenticated ? <div className="library-empty"><p>Sign in to see generated frames and exports saved to your workspace.</p><button className="primary-button" onClick={() => startLogin()}>Sign in to open library</button></div> : libraryQuery.isLoading ? <div className="library-empty"><p>Loading your saved content…</p></div> : libraryQuery.data?.length ? <div className="library-list">{libraryQuery.data.map((item) => <div className="library-item" key={item.id}>{item.assetUrl ? <img src={item.assetUrl} alt={item.title} /> : <div className="library-type">{item.kind}</div>}<div><strong>{item.title}</strong><span>{item.channel ?? "Studio"} · {item.format ?? "Draft"}</span><small>{item.disclosureStamp}</small></div><span className="library-status">{item.status}</span></div>)}</div> : <div className="library-empty"><p>Your first generated frame and export will appear here.</p><button className="primary-button" onClick={() => setActiveNav("Avatar studio")}>Create first frame</button></div>}</section>}

          <section className="lower-grid">
            <div className="lookbook-card card-surface"><div className="card-topline"><div><span className="section-number">04</span><span className="section-title">Select a look</span></div><button className="text-action" onClick={() => toast.info("More looks are available in Avatar studio")}>View all <ArrowUpRight size={14} /></button></div><div className="lookbook-grid">{styleOptions.map((style) => <button key={style.label} className={`look-card ${activeStyle === style.label ? "selected" : ""}`} onClick={() => setActiveStyle(style.label)}><img src={style.image} alt={`${style.label} look for Aria Vale`} /><span className="look-overlay" /><span className="look-check">{activeStyle === style.label && <Check size={13} />}</span><span className="look-label"><strong>{style.label}</strong><small>{style.detail}</small></span></button>)}</div></div>
            <div className="draft-card card-surface"><div className="card-topline"><div><span className="section-number">05</span><span className="section-title">Latest draft</span></div><span className="draft-state">Needs review</span></div><div className="draft-preview"><img src={activeLook.image} alt={`${activeStyle} campaign draft`} /><div className="draft-copy"><span className="tiny-label">CAPTION / V1</span><span className="visible-disclosure">AI-generated virtual creator · Influencer Smart</span><p>“The best parts of the day are usually the ones you make room for.”</p><div className="draft-actions"><button onClick={handleCopy}><Copy size={14} /> Copy caption</button><button onClick={handleExport}>{approved ? <Check size={14} /> : <ArrowUpRight size={14} />} {approved ? "Export saved" : "Export with disclosure"}</button></div></div></div></div>
          </section>

          <section className="footer-tools"><span>Direct the story. Keep the disclosure.</span><div><button onClick={() => setSelectedFormat("Carousel")} className={selectedFormat === "Carousel" ? "selected" : ""}>Instagram</button><button onClick={() => setSelectedFormat("Reel")} className={selectedFormat === "Reel" ? "selected" : ""}>TikTok</button><button onClick={() => setSelectedFormat("Square ad")} className={selectedFormat === "Square ad" ? "selected" : ""}>Product ad</button></div></section>
        </div>
      </main>
    </div>
  );
}
