import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Filter, Mail, MapPin, MessageSquare, Search, Sparkles, Star, Users, X } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Platform = "instagram" | "tiktok" | "youtube" | "pinterest" | "blog";
const platforms: Array<{ id: Platform; label: string }> = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "pinterest", label: "Pinterest" },
];
const statuses = ["all", "discovered", "shortlisted", "contacted", "partnered"] as const;
const platformShort: Record<string, string> = { instagram: "IG", tiktok: "TK", youtube: "YT", pinterest: "PI", blog: "WEB" };
function compactNumber(value: number) { return value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K` : String(value); }
function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

export default function CreatorCRM() {
  const [, setLocation] = useLocation();
  const [niche, setNiche] = useState("wellness and everyday rituals");
  const [location, setCreatorLocation] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["instagram", "tiktok", "youtube"]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statuses)[number]>("all");
  const [selectedCreatorId, setSelectedCreatorId] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const creatorsQuery = trpc.creators.list.useQuery({ workspaceId: 1, search: search || undefined, status: statusFilter === "all" ? undefined : statusFilter, limit: 100 }, { refetchInterval: 30_000 });
  const discoverMutation = trpc.creators.discover.useMutation({ onSuccess: async (result) => { await creatorsQuery.refetch(); toast.success(`${result.resultCount} creator profiles scored`, { description: result.notice }); }, onError: (error) => toast.error(error.message) });
  const statusMutation = trpc.creators.updateStatus.useMutation({ onSuccess: () => creatorsQuery.refetch(), onError: (error) => toast.error(error.message) });
  const noteMutation = trpc.creators.addNote.useMutation({ onSuccess: async () => { setNote(""); await creatorsQuery.refetch(); toast.success("Creator note saved"); }, onError: (error) => toast.error(error.message) });

  const creators = creatorsQuery.data ?? [];
  const selectedCreator = creators.find((creator) => creator.id === selectedCreatorId) ?? null;
  const stats = useMemo(() => ({ total: creators.length, shortlist: creators.filter((creator) => creator.status === "shortlisted").length, contactable: creators.filter((creator) => creator.contactStatus === "discoverable" || creator.contactStatus === "verified").length, average: creators.length ? Math.round(creators.reduce((sum, creator) => sum + creator.fitScore, 0) / creators.length) : 0 }), [creators]);

  function togglePlatform(platform: Platform) { setSelectedPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]); }
  function discover() { if (selectedPlatforms.length === 0) { toast.error("Choose at least one platform"); return; } discoverMutation.mutate({ workspaceId: 1, niche, platforms: selectedPlatforms, location: location || undefined, minFollowers: 1000 }); }
  function setStatus(creatorId: number, nextStatus: "shortlisted" | "contacted" | "partnered" | "archived") { statusMutation.mutate({ creatorId, status: nextStatus }); }

  return <div className="crm-shell">
    <header className="crm-topbar"><button className="crm-back" onClick={() => setLocation("/growth-os")}><ArrowLeft size={14} /> Growth OS</button><div className="crm-top-actions"><span className="crm-live"><span /> CRM workspace</span><button className="crm-top-button" onClick={() => setLocation("/outreach")}><Mail size={14} /> Outreach</button></div></header>
    <main className="crm-main">
      <section className="crm-heading"><div><div className="crm-eyebrow"><span /> CREATOR DISCOVERY / CRM</div><h1>Find creators who<br /><em>make a category move.</em></h1><p>Search a niche, score creator fit, and turn promising profiles into a thoughtful outreach pipeline.</p></div><div className="crm-heading-note"><Sparkles size={16} /><span>Explainable scoring<br /><strong>Audience fit over vanity reach</strong></span></div></section>
      <section className="discovery-panel"><div className="discovery-copy"><span className="crm-section-label">01 / DISCOVERY BRIEF</span><h2>Tell us who you want to reach.</h2><p>Start with a niche and we'll rank creators by relevance, engagement quality, reach, view strength, and contactability.</p></div><div className="discovery-form"><label><span>Niche or audience</span><input value={niche} onChange={(event) => setNiche(event.target.value)} placeholder="e.g. clean beauty for busy mums" /></label><div className="discovery-row"><label><span>Location <small>OPTIONAL</small></span><div className="crm-input-icon"><MapPin size={14} /><input value={location} onChange={(event) => setCreatorLocation(event.target.value)} placeholder="Any location" /></div></label><div className="platform-field"><span>Platforms</span><div className="platform-pills">{platforms.map((platform) => <button key={platform.id} className={selectedPlatforms.includes(platform.id) ? "selected" : ""} onClick={() => togglePlatform(platform.id)}>{platform.label}</button>)}</div></div></div><button className="crm-primary" onClick={discover} disabled={discoverMutation.isPending}><Sparkles size={14} /> {discoverMutation.isPending ? "Scoring creators…" : "Discover and score creators"}<ArrowRight size={14} /></button></div></section>
      <section className="crm-stats"><div><span>CREATOR PROFILES</span><strong>{stats.total}</strong><small>in this workspace</small></div><div><span>SHORTLISTED</span><strong>{stats.shortlist}</strong><small>ready for outreach</small></div><div><span>CONTACTABLE</span><strong>{stats.contactable}</strong><small>public contact signal</small></div><div><span>AVERAGE FIT</span><strong>{stats.average}<small>/100</small></strong><small>explainable score</small></div></section>
      <section className="crm-toolbar"><div><span className="crm-section-label">02 / CREATOR BOARD</span><strong>{statusFilter === "all" ? "All discovered creators" : `${statusFilter[0].toUpperCase()}${statusFilter.slice(1)} creators`}</strong></div><div className="crm-filters"><div className="crm-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, handle, niche…" /></div><div className="status-filter"><Filter size={13} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as (typeof statuses)[number])}>{statuses.map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : status[0].toUpperCase() + status.slice(1)}</option>)}</select><ChevronDown size={13} /></div></div></section>
      {creators.length === 0 ? <section className="crm-empty"><div className="crm-empty-mark"><Users size={22} /></div><h2>Your creator board is ready.</h2><p>Run a discovery brief to populate this workspace with ranked creator profiles. Every score includes a reason so your team can make the final call.</p><button className="crm-primary" onClick={discover}><Sparkles size={14} /> Run first discovery</button></section> : <section className="creator-grid">{creators.map((creator) => <article className={`creator-card ${selectedCreatorId === creator.id ? "active" : ""}`} key={creator.id} onClick={() => setSelectedCreatorId(creator.id)}><div className="creator-card-top"><div className="creator-avatar">{initials(creator.name)}</div><div className="creator-identity"><strong>{creator.name}</strong><span>{creator.handle} · {platformShort[creator.platform]}</span></div><div className="creator-score"><strong>{creator.fitScore}</strong><span>FIT</span></div></div><div className="creator-niche"><span>{creator.niche}</span><span className={`creator-status status-${creator.status}`}>{creator.status}</span></div><p className="creator-bio">{creator.bio}</p><div className="creator-metrics"><div><span>FOLLOWERS</span><strong>{compactNumber(creator.followerCount)}</strong></div><div><span>ENGAGEMENT</span><strong>{Number(creator.engagementRate).toFixed(1)}%</strong></div><div><span>AVG VIEWS</span><strong>{compactNumber(creator.avgViews)}</strong></div></div><div className="creator-reasons">{creator.scoreReasons.slice(0, 3).map((reason) => <span key={reason}><Check size={11} /> {reason}</span>)}</div><div className="creator-card-footer"><span className={`contact-signal ${creator.contactStatus}`}><Mail size={12} /> {creator.contactStatus === "verified" ? "Verified contact" : creator.contactStatus === "discoverable" ? "Public contact" : "No contact found"}</span><button className="creator-link" onClick={(event) => { event.stopPropagation(); window.open(creator.profileUrl, "_blank", "noopener,noreferrer"); }}>View profile <ArrowUpRightIcon /></button></div></article>)}</section>}
      {selectedCreator && <aside className="creator-drawer"><div className="drawer-head"><div><span className="crm-section-label">CREATOR PROFILE</span><h2>{selectedCreator.name}</h2><span>{selectedCreator.handle} · {selectedCreator.location}</span></div><button className="drawer-close" onClick={() => setSelectedCreatorId(null)}><X size={16} /></button></div><div className="drawer-score"><div><strong>{selectedCreator.fitScore}</strong><span>/100 fit score</span></div><p>Scored for <strong>{selectedCreator.niche}</strong> using niche relevance, engagement, reach, views, and contactability.</p></div><div className="drawer-actions"><button onClick={() => setStatus(selectedCreator.id, "shortlisted")}><Star size={13} /> Shortlist</button><button onClick={() => setStatus(selectedCreator.id, "contacted")}><MessageSquare size={13} /> Mark contacted</button></div><label className="drawer-note"><span>CRM NOTE</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={selectedCreator.notes || "Add context for your team…"} /><button className="crm-secondary" onClick={() => noteMutation.mutate({ creatorId: selectedCreator.id, body: note })} disabled={!note.trim()}>Save note</button></label><div className="drawer-reasons"><span className="crm-section-label">WHY THIS CREATOR</span>{selectedCreator.scoreReasons.map((reason) => <div key={reason}><Check size={13} /> {reason}</div>)}</div></aside>}
    </main>
  </div>;
}

function ArrowUpRightIcon() { return <ArrowRight size={12} className="rotate-[-45deg]" />; }
