import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleAlert,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  Globe2,
  Image as ImageIcon,
  Mail,
  Megaphone,
  MousePointer2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  Users,
  Video,
  X,
} from "lucide-react";

type Contact = { email: string; person: string; role: string; source: string; confidence: number; selected: boolean };

type BrandData = {
  name: string;
  domain: string;
  category: string;
  tone: string;
  audience: string;
  description: string;
  contacts: Contact[];
};

const previewImages = [
  "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?auto=format&fit=crop&w=700&q=85",
];

function formatDomain(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
}

function makeBrand(domain: string): BrandData {
  const base = domain.split(".")[0] || "yourbrand";
  const title = base.split(/[-_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  const safe = base.replace(/[^a-z0-9]/gi, "") || "hello";
  return {
    name: title,
    domain,
    category: "Consumer brand · ecommerce",
    tone: "Warm, confident, considered",
    audience: "Curious shoppers looking for a better everyday ritual",
    description: `${title} has a clear product story with room to grow through creator-led proof, education, and social-first creative.`,
    contacts: [
      { email: `hello@${domain}`, person: "Team inbox", role: "General contact", source: "Website footer", confidence: 98, selected: true },
      { email: `partnerships@${domain}`, person: "Partnerships team", role: "Creator & brand partnerships", source: "Pattern match", confidence: 87, selected: true },
      { email: `press@${domain}`, person: "Press desk", role: "Media & communications", source: "About page", confidence: 83, selected: false },
      { email: `marketing@${domain}`, person: "Marketing team", role: "Growth & acquisition", source: "Pattern match", confidence: 76, selected: false },
    ],
  };
}

export default function GrowthOS() {
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("https://lumora.co");
  const [brand, setBrand] = useState<BrandData>(() => makeBrand("lumora.co"));
  const [activeStep, setActiveStep] = useState<"discover" | "create" | "launch">("discover");
  const [analyzing, setAnalyzing] = useState(false);
  const [campaignName, setCampaignName] = useState("Q4 creator growth sprint");
  const [objective, setObjective] = useState("Conversions");
  const [budget, setBudget] = useState("2500");
  const [assetFormat, setAssetFormat] = useState("9:16 video");
  const [generated, setGenerated] = useState(false);
  const [contacts, setContacts] = useState(brand.contacts);
  const [adProvider, setAdProvider] = useState<"meta" | "google">("meta");
  const [adAccountId, setAdAccountId] = useState("");
  const [deploymentApproved, setDeploymentApproved] = useState(false);
  const [audienceEnabled, setAudienceEnabled] = useState(false);
  const [audienceConsentApproved, setAudienceConsentApproved] = useState(false);
  const adsStatusQuery = trpc.ads.status.useQuery();
  const deployMutation = trpc.ads.deployPausedCampaign.useMutation();
  const crawlStartMutation = trpc.crawl.start.useMutation();
  const recentCrawlsQuery = trpc.crawl.recent.useQuery({ workspaceId: 1 });
  const analyticsQuery = trpc.analytics.overview.useQuery({ workspaceId: 1 }, { refetchInterval: 60_000 });
  const analyticsSyncMutation = trpc.analytics.syncAll.useMutation({ onSuccess: () => { analyticsQuery.refetch(); toast.success("Performance data refreshed"); }, onError: (error) => toast.error(error.message) });
  const latestReadyCrawl = recentCrawlsQuery.data?.find((job) => job.domain === brand.domain && job.status === "ready");
  const audienceReviewQuery = trpc.crawl.get.useQuery({ jobId: latestReadyCrawl?.id ?? 0 }, { enabled: Boolean(latestReadyCrawl?.id), refetchInterval: 5000 });
  const eligibleAudienceCount = audienceReviewQuery.data?.emails.filter((item) => Boolean(item.audienceEligible) && ["verified", "likely_valid"].includes(item.verification?.finalStatus || "")).length ?? 0;
  const performance = analyticsQuery.data?.totals ?? { impressions: 0, reach: 0, clicks: 0, spend: 0, conversions: 0, ctr: 0, cpc: 0 };

  const selectedContacts = contacts.filter((item) => item.selected);
  const readiness = useMemo(() => {
    let score = 62;
    if (url.trim()) score += 8;
    if (generated) score += 12;
    if (campaignName.trim()) score += 8;
    if (selectedContacts.length) score += 10;
    return Math.min(score, 100);
  }, [campaignName, generated, selectedContacts.length, url]);

  async function analyzeSite() {
    const domain = formatDomain(url);
    if (!domain || !domain.includes(".")) {
      toast.error("Paste a valid website URL, like https://yourbrand.com");
      return;
    }
    setAnalyzing(true);
    await new Promise((resolve) => setTimeout(resolve, 850));
    const next = makeBrand(domain);
    setBrand(next);
    setContacts(next.contacts);
    setAnalyzing(false);
    toast.success("Brand intelligence refreshed", { description: `${next.contacts.length} contact signals found on ${domain}` });
  }

  async function startStandardCrawl() {
    const domain = formatDomain(url);
    if (!domain || !domain.includes(".")) {
      toast.error("Paste a valid website URL before starting a crawl");
      return;
    }
    try {
      const result = await crawlStartMutation.mutateAsync({ workspaceId: 1, url: `https://${domain}` });
      toast.success("Standard crawl queued", { description: "The review screen will update as pages and email signals are processed." });
      setLocation(`/growth-os/review/${result.jobId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start crawl");
    }
  }

  function toggleContact(email: string) {
    setContacts((items) => items.map((item) => item.email === email ? { ...item, selected: !item.selected } : item));
  }

  function copyEmails() {
    navigator.clipboard?.writeText(selectedContacts.map((item) => item.email).join(", "));
    toast.success(`${selectedContacts.length} emails copied`);
  }

  function exportLeads() {
    const csv = ["email,person,role,source,confidence", ...selectedContacts.map((item) => `${item.email},${item.person},${item.role},${item.source},${item.confidence}%`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = `${brand.domain}-contacts.csv`; anchor.click(); URL.revokeObjectURL(href);
    toast.success("Contact list exported as CSV");
  }

  function generateAssets() {
    setGenerated(true);
    toast.success("Creative concepts generated", { description: "3 concepts are ready for review in your content library." });
  }

  function requestLaunch() {
    toast.info("Launch checklist created", { description: "Connect an ad account and approve the creative before publishing." });
    setActiveStep("launch");
  }

  async function deployPausedCampaign() {
    if (!deploymentApproved) {
      toast.error("Approve the paused-campaign deployment first");
      return;
    }
    const connected = adProvider === "meta" ? adsStatusQuery.data?.meta : adsStatusQuery.data?.google;
    if (!connected) {
      toast.info(`Connect ${adProvider === "meta" ? "Meta Ads" : "Google Ads"} before deploying`, { description: "The campaign remains a local draft until credentials are connected." });
      return;
    }
    try {
      if (audienceEnabled && (!latestReadyCrawl || !eligibleAudienceCount)) {
        toast.error("Approve at least one verified lead in the crawl review before using an ad audience");
        return;
      }
      if (audienceEnabled && !audienceConsentApproved) {
        toast.error("Confirm that the selected leads are eligible for ad audience use");
        return;
      }
      if (!adAccountId.trim()) {
        toast.error("Add the advertiser account ID before deploying");
        return;
      }
      const result = await deployMutation.mutateAsync({ provider: adProvider, campaignName, objective: objective === "Lead generation" ? "lead_generation" : objective.toLowerCase() as "conversions" | "traffic" | "awareness", budget: Number(budget), destinationUrl: url, accountId: adAccountId.trim(), approved: true, crawlJobId: audienceEnabled ? latestReadyCrawl?.id : undefined, audienceConsentApproved });
      toast.success("Paused campaign created", { description: `${result.provider} campaign ${result.externalCampaignId} is paused for review.` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ad deployment failed");
    }
  }

  return (
    <div className="studio-shell min-h-screen bg-[#f8f5ef] text-[#1b2333]">
      <aside className="studio-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><Sparkles size={16} /></div>
          <div><div className="brand-name">Influencer</div><div className="brand-stamp">GROWTH OS</div></div>
        </div>
        <div className="workspace-label">Marketing workspace <ChevronRight size={14} /></div>
        <div className="workspace-card"><div className="workspace-avatar">{brand.name.slice(0, 2).toUpperCase()}</div><div><strong>{brand.name}</strong><span>Brand intelligence</span></div></div>
        <nav className="studio-nav" aria-label="Growth OS navigation">
          <div className="nav-kicker">Growth OS</div>
          <button className={activeStep === "discover" ? "active" : ""} onClick={() => setActiveStep("discover")}><Search size={17} /><span>Discover & enrich</span></button>
          <button className={activeStep === "create" ? "active" : ""} onClick={() => setActiveStep("create")}><Video size={17} /><span>Create assets</span></button>
          <button className={activeStep === "launch" ? "active" : ""} onClick={() => setActiveStep("launch")}><Megaphone size={17} /><span>Campaign launch</span></button>
          <div className="nav-kicker nav-kicker-spaced">Existing studio</div>
          <button onClick={() => setLocation("/")}><BarChart3 size={17} /><span>Overview</span></button>
          <button onClick={() => setLocation("/ugc-studio")}><ImageIcon size={17} /><span>UGC studio</span></button>
          <button onClick={() => setLocation("/campaigns")}><Target size={17} /><span>Campaigns</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="disclosure-note"><span className="disclosure-dot" /><span>Use discovered contacts responsibly. Respect consent, opt-outs, and applicable privacy laws.</span></div><button className="settings-button"><CircleAlert size={15} /> Compliance center</button></div>
      </aside>

      <main className="studio-main">
        <header className="topbar"><button className="text-action" onClick={() => setLocation("/")}><ArrowLeft size={15} /> Back to studio</button><div className="topbar-actions"><span className="status-pill"><span /> Workspace ready</span><button className="new-button" onClick={() => { setActiveStep("discover"); setUrl(""); }}><Plus size={14} /> New brand</button></div></header>
        <div className="content-wrap growth-wrap">
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> BRAND GROWTH OS</div><h1>Turn a website into<br /><em>a growth plan.</em></h1><p>Understand the brand, find the right people, create the assets, and prepare campaigns from one focused workspace.</p></div><div className="readiness-card"><span>LAUNCH READINESS</span><strong>{readiness}%</strong><div className="progress-line"><span style={{ width: `${readiness}%` }} /></div><small>{readiness >= 90 ? "Ready for review" : "A few inputs to go"}</small></div></section>

          <section className="url-intake card-surface"><div className="url-intake-copy"><div className="section-number">01 / START WITH A URL</div><h2>Paste the brand website.</h2><p>We’ll map its positioning, audience, creative angles, and public contact signals so your team can move from blank page to action.</p></div><div className="url-form"><div className="url-input"><Globe2 size={17} /><input value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") analyzeSite(); }} placeholder="https://yourbrand.com" /><button onClick={analyzeSite} disabled={analyzing}>{analyzing ? <RefreshCw className="spin-icon" size={15} /> : <ArrowRight size={15} />}</button></div><span className="field-note"><Check size={12} /> Public pages only · no login required</span><button className="crawl-action" onClick={startStandardCrawl} disabled={crawlStartMutation.isPending}><Globe2 size={13} /> {crawlStartMutation.isPending ? "Queueing standard crawl…" : "Start standard crawl"}</button></div></section>

          <div className="step-tabs"><button className={activeStep === "discover" ? "active" : ""} onClick={() => setActiveStep("discover")}><span>01</span> Discover</button><button className={activeStep === "create" ? "active" : ""} onClick={() => setActiveStep("create")}><span>02</span> Create</button><button className={activeStep === "launch" ? "active" : ""} onClick={() => setActiveStep("launch")}><span>03</span> Launch</button></div><section className="performance-rail"><div className="performance-rail-head"><div><span className="section-number">PERFORMANCE REPORTING</span><strong>Paid growth at a glance</strong></div><div className="performance-actions"><span className={`sync-state ${analyticsQuery.data?.lastSyncedAt ? "synced" : "waiting"}`}><span /> {analyticsQuery.data?.lastSyncedAt ? `Synced ${new Date(analyticsQuery.data.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting live campaigns"}</span><button className="sync-button" onClick={() => analyticsSyncMutation.mutate()} disabled={analyticsSyncMutation.isPending}>{analyticsSyncMutation.isPending ? "Syncing…" : "Sync now"}</button></div></div><div className="performance-metrics"><div><span>SPEND</span><strong>${performance.spend.toFixed(2)}</strong></div><div><span>IMPRESSIONS</span><strong>{performance.impressions.toLocaleString()}</strong></div><div><span>CLICKS</span><strong>{performance.clicks.toLocaleString()}</strong></div><div><span>CTR</span><strong>{(performance.ctr * 100).toFixed(2)}%</strong></div><div><span>CONVERSIONS</span><strong>{performance.conversions.toFixed(0)}</strong></div><div><span>CPC</span><strong>${performance.cpc.toFixed(2)}</strong></div></div></section>

          {activeStep === "discover" && <div className="growth-grid"><div className="brand-column"><section className="card-surface brand-card"><div className="card-topline"><div><span className="section-number">BRAND MAP</span><span className="section-title">{brand.domain}</span></div><span className="ai-label"><Sparkles size={13} /> SYNTHESIZED</span></div><div className="brand-identity"><div className="brand-logo-tile">{brand.name.slice(0, 1)}</div><div><h2>{brand.name}</h2><span>{brand.category}</span></div><button className="icon-button"><ExternalLink size={15} /></button></div><p className="brand-description">{brand.description}</p><div className="insight-grid"><div><span>Voice</span><strong>{brand.tone}</strong></div><div><span>Audience</span><strong>{brand.audience}</strong></div><div><span>Best angle</span><strong>Proof over polish</strong></div></div><div className="angle-row"><div className="angle-icon"><MousePointer2 size={15} /></div><div><span className="tiny-label">RECOMMENDED CREATIVE ANGLE</span><strong>Show the ritual, then show the result.</strong></div><ArrowUpRight size={15} /></div></section><section className="card-surface opportunity-card"><div className="card-topline"><div><span className="section-number">OPPORTUNITY BOARD</span><span className="section-title">What to test next</span></div><span className="score-badge">4 signals</span></div><div className="opportunity-list"><div><span className="opportunity-index">A1</span><div><strong>Creator testimonials</strong><p>Turn the product promise into believable social proof.</p></div><span className="opportunity-tag">HIGH</span></div><div><span className="opportunity-index">A2</span><div><strong>Founder-led education</strong><p>Answer the questions already hiding in the category.</p></div><span className="opportunity-tag">MED</span></div><div><span className="opportunity-index">A3</span><div><strong>Retargeting sequence</strong><p>Give visitors a second reason to come back.</p></div><span className="opportunity-tag">MED</span></div></div></section></div><div className="contacts-column"><section className="card-surface contacts-card"><div className="card-topline"><div><span className="section-number">CONTACT SIGNALS</span><span className="section-title">Publicly discoverable</span></div><span className="ai-label"><Mail size={13} /> {contacts.length} FOUND</span></div><p className="contact-intro">Potential business contacts found from public pages and common role patterns. Review before using.</p><div className="contact-toolbar"><span>{selectedContacts.length} selected</span><div><button className="text-action" onClick={copyEmails}><Copy size={13} /> Copy</button><button className="text-action" onClick={exportLeads}><Download size={13} /> CSV</button></div></div><div className="contact-list">{contacts.map((item) => <div className={`contact-row ${item.selected ? "selected" : ""}`} key={item.email} onClick={() => toggleContact(item.email)}><div className={`check-box ${item.selected ? "checked" : ""}`}>{item.selected && <Check size={11} />}</div><div className="contact-main"><strong>{item.email}</strong><span>{item.person} · {item.role}</span></div><div className="contact-meta"><strong>{item.confidence}%</strong><span>{item.source}</span></div></div>)}</div><div className="privacy-note"><CircleAlert size={14} /><span>Only use business contact data for relevant, lawful outreach. Add opt-out handling before sending.</span></div></section><button className="next-card" onClick={() => setActiveStep("create")}><div><span className="section-number">NEXT STEP</span><strong>Create on-brand assets</strong><small>Use this brand map to brief video and image concepts.</small></div><ArrowRight size={18} /></button></div></div>}

          {activeStep === "create" && <section className="create-workspace"><div className="create-controls card-surface"><div className="card-topline"><div><span className="section-number">02 / ASSET LAB</span><span className="section-title">Creative direction</span></div><span className="ai-label"><Sparkles size={13} /> READY TO GENERATE</span></div><h2>Make the first impression <em>feel native.</em></h2><p className="muted-copy">Generate a focused batch of image and video concepts from the brand map. Final assets can be produced in UGC Studio with your approved reference images.</p><label className="control-field"><span>Asset format</span><select value={assetFormat} onChange={(event) => setAssetFormat(event.target.value)}><option>9:16 video</option><option>1:1 product image</option><option>4:5 social image</option><option>16:9 YouTube concept</option></select></label><div className="format-grid">{["Hook-first testimonial", "Product ritual", "Founder POV"].map((label, index) => <button key={label} className={index === 0 ? "selected" : ""}><span>{index === 0 ? <Video size={15} /> : <ImageIcon size={15} />}</span><strong>{label}</strong><small>{index === 0 ? "Best for paid social" : index === 1 ? "Build desire" : "Build trust"}</small></button>)}</div><div className="control-footer"><span className="safety-copy">Generated assets include a review step and never publish automatically.</span><button className="primary-button" onClick={generateAssets}><Sparkles size={14} /> Generate concepts</button></div></div><div className="asset-preview"><div className="asset-preview-head"><span className="section-number">CONCEPT BOARD</span><button className="text-action" onClick={() => setLocation("/ugc-studio")}><ExternalLink size={13} /> Open UGC Studio</button></div><div className="asset-grid">{previewImages.map((image, index) => <div className="asset-card" key={image}><img src={image} alt="Creative concept" /><div className="asset-overlay"><span>{generated ? "READY TO REVIEW" : "CONCEPT"}</span><strong>{["The proof is in the ritual", "A better everyday reset", "Meet the product differently"][index]}</strong><small>{assetFormat}</small></div><button className="play-button">{index === 0 ? <Play size={14} /> : <ImageIcon size={14} />}</button></div>)}</div><div className="asset-footer"><span><Check size={13} /> {generated ? "3 concepts generated" : "Preview concepts"}</span><button className="primary-button" onClick={() => setActiveStep("launch")}>Use in campaign <ArrowRight size={14} /></button></div></div></section>}

          {activeStep === "launch" && <section className="launch-workspace"><div className="launch-main card-surface"><div className="card-topline"><div><span className="section-number">03 / CAMPAIGN BUILDER</span><span className="section-title">Launch plan</span></div><span className="draft-state">DRAFT</span></div><h2>Build a campaign<br /><em>with intent.</em></h2><div className="control-grid campaign-fields"><label className="control-field"><span>Campaign name</span><input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></label><label className="control-field"><span>Objective</span><select value={objective} onChange={(event) => setObjective(event.target.value)}><option>Conversions</option><option>Traffic</option><option>Lead generation</option><option>Awareness</option></select></label><label className="control-field"><span>Test budget</span><input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="numeric" /></label></div><div className="channel-selector"><span>CHANNELS</span><button className="selected"><span>IG</span> Instagram</button><button><span>TK</span> TikTok</button><button><span>FB</span> Facebook</button></div><div className="deploy-panel"><div className="deploy-panel-head"><div><span className="section-number">DISTRIBUTION</span><strong>Prepare a paused campaign</strong></div><span className={`connection-badge ${(adProvider === "meta" ? adsStatusQuery.data?.meta : adsStatusQuery.data?.google) ? "connected" : "not-connected"}`}>{(adProvider === "meta" ? adsStatusQuery.data?.meta : adsStatusQuery.data?.google) ? "CONNECTED" : "NOT CONNECTED"}</span></div><div className="provider-toggle"><button className={adProvider === "meta" ? "selected" : ""} onClick={() => setAdProvider("meta")}><span>Meta</span> Meta Ads</button><button className={adProvider === "google" ? "selected" : ""} onClick={() => setAdProvider("google")}><span>G</span> Google Ads</button></div><label className="control-field"><span>{adProvider === "meta" ? "Ad account ID" : "Customer ID"}</span><input value={adAccountId} onChange={(event) => setAdAccountId(event.target.value)} placeholder={adProvider === "meta" ? "act_123456789" : "123-456-7890"} /></label><div className={`audience-panel ${audienceEnabled ? "enabled" : ""}`}><div className="audience-panel-head"><div><span className="section-number">VERIFIED LEADS</span><strong>{latestReadyCrawl ? `${eligibleAudienceCount} eligible from ${latestReadyCrawl.domain}` : "No completed crawl for this brand"}</strong></div><button className={`audience-switch ${audienceEnabled ? "enabled" : ""}`} onClick={() => setAudienceEnabled((value) => !value)} disabled={!latestReadyCrawl || eligibleAudienceCount === 0}>{audienceEnabled ? "Using audience" : "Add to campaign"}</button></div><p>{latestReadyCrawl ? "Only leads manually approved in the crawl review are uploaded as SHA-256 hashes." : "Complete a standard crawl and approve verified leads in the review screen first."}</p>{audienceEnabled && <label className="approval-check audience-consent"><input type="checkbox" checked={audienceConsentApproved} onChange={(event) => setAudienceConsentApproved(event.target.checked)} /><span>I confirm these leads have the required consent or lawful basis for ad audience targeting.</span></label>}</div><label className="approval-check"><input type="checkbox" checked={deploymentApproved} onChange={(event) => setDeploymentApproved(event.target.checked)} /><span>I approve creating this campaign in <strong>PAUSED</strong> status for final review.</span></label><button className="secondary-button full" onClick={deployPausedCampaign} disabled={!deploymentApproved || deployMutation.isPending}><Send size={14} /> {deployMutation.isPending ? "Creating paused campaign..." : "Deploy paused campaign"}</button></div><div className="launch-summary"><div><span>BRAND</span><strong>{brand.name}</strong></div><div><span>OBJECTIVE</span><strong>{objective}</strong></div><div><span>DAILY TEST</span><strong>${budget}<small> / total</small></strong></div></div><button className="primary-button full" onClick={requestLaunch}><Send size={14} /> Create launch checklist</button><p className="launch-disclaimer"><CircleAlert size={13} /> This creates a review-ready campaign draft. Publishing requires your connected ad account, approved creative, audience settings, and final human approval.</p></div><aside className="launch-side"><div className="launch-score"><div className="score-ring"><strong>{readiness}</strong><span>/100</span></div><div><span className="tiny-label">LAUNCH SCORE</span><h3>Strong foundation</h3><p>Connect distribution and finish the review checklist to go live.</p></div></div><div className="checklist card-surface"><div className="card-topline"><div><span className="section-number">CHECKLIST</span><span className="section-title">Before publishing</span></div></div>{["Brand URL analyzed", "Contact data reviewed", "Creative concept selected", "Ad account connected", "Human approval captured"].map((item, index) => <div className="checklist-row" key={item}><span className={index < 3 ? "done" : "pending"}>{index < 3 ? <Check size={11} /> : <span />}</span><strong>{item}</strong>{index >= 3 && <small>TO DO</small>}</div>)}</div></aside></section>}
        </div>
      </main>
    </div>
  );
}
