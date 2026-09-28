import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Check, CircleAlert, Clock3, Globe2, Mail, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

const stages = [
  { key: "queued", label: "Queued", detail: "Job accepted" },
  { key: "crawling", label: "Crawling", detail: "Public pages" },
  { key: "extracting", label: "Extracting", detail: "Email signals" },
  { key: "verifying", label: "Verifying", detail: "DNS + SMTP" },
  { key: "ready", label: "Ready", detail: "Review results" },
];

const statusCopy: Record<string, string> = {
  verified: "Verified",
  likely_valid: "Likely valid",
  risky: "Risky",
  catch_all: "Catch-all",
  unknown: "Unknown",
  invalid: "Invalid",
  pending: "Pending",
};

export default function CrawlReview() {
  const [, params] = useRoute("/growth-os/review/:jobId");
  const [, setLocation] = useLocation();
  const jobId = Number(params?.jobId || 0);
  const reviewQuery = trpc.crawl.get.useQuery({ jobId }, { enabled: jobId > 0, refetchInterval: 3500 });
  const data = reviewQuery.data;
  const job = data?.job;
  const currentIndex = Math.max(0, stages.findIndex((stage) => stage.key === job?.status));
  const counts = data?.verificationCounts ?? {};
  const total = data?.emails.length ?? 0;
  const verifiedTotal = (counts.verified ?? 0) + (counts.likely_valid ?? 0);
  const progress = useMemo(() => {
    if (!job) return 0;
    if (job.status === "ready") return 100;
    if (job.status === "failed") return 100;
    if (job.status === "crawling") return Math.min(48, 12 + Math.round((job.pagesCrawled / Math.max(job.pagesDiscovered, 1)) * 28));
    if (job.status === "extracting") return 58;
    if (job.status === "verifying") return Math.min(94, 63 + Math.round((verifiedTotal / Math.max(total, 1)) * 28));
    return 6;
  }, [job, total, verifiedTotal]);

  if (reviewQuery.isLoading) return <div className="review-loading"><RefreshCw className="spin-icon" size={20} /> Loading crawl review…</div>;
  if (!job || !data) return <div className="review-loading"><CircleAlert size={20} /> Crawl job not found.</div>;

  return (
    <div className="studio-shell min-h-screen bg-[#f8f5ef] text-[#1b2333]">
      <aside className="studio-sidebar"><div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={16} /></div><div><div className="brand-name">Influencer</div><div className="brand-stamp">GROWTH OS</div></div></div><div className="workspace-label">Review center <Globe2 size={14} /></div><div className="workspace-card"><div className="workspace-avatar">{job.domain.slice(0, 2).toUpperCase()}</div><div><strong>{job.domain}</strong><span>Email intelligence</span></div></div><nav className="studio-nav"><div className="nav-kicker">Crawl job</div><button className="active"><Mail size={17} /><span>Email review</span></button><button onClick={() => setLocation("/growth-os")}><ArrowLeft size={17} /><span>Back to Growth OS</span></button></nav><div className="sidebar-bottom"><div className="disclosure-note"><span className="disclosure-dot" /><span>Public pages only. SMTP checks never send an email and may return unknown for protected servers.</span></div></div></aside>
      <main className="studio-main"><header className="topbar"><button className="text-action" onClick={() => setLocation("/growth-os")}><ArrowLeft size={15} /> Back to Growth OS</button><div className="topbar-actions"><span className="status-pill"><span /> Standard crawl · 100 page limit</span></div></header><div className="content-wrap review-wrap">
        <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> EMAIL INTELLIGENCE / REVIEW</div><h1>Review the <em>signals.</em></h1><p>Every candidate is traceable to a public source page and paired with a transparent DNS and SMTP verification result.</p></div><div className={`review-state ${job.status}`}><span>{job.status === "ready" ? <Check size={14} /> : job.status === "failed" ? <XCircle size={14} /> : <Clock3 size={14} />}</span><strong>{job.status === "ready" ? "Ready for review" : job.status === "failed" ? "Needs attention" : "Processing crawl"}</strong><small>{job.domain}</small></div></section>
        <section className="review-progress card-surface"><div className="review-progress-head"><div><span className="section-number">CRAWL STATUS</span><span className="section-title">{job.pagesCrawled} pages crawled · {job.pagesDiscovered} discovered</span></div><strong>{progress}%</strong></div><div className="progress-line"><span style={{ width: `${progress}%` }} /></div><div className="stage-row">{stages.map((stage, index) => <div className={`stage ${index < currentIndex || (job.status === "ready" && index <= currentIndex) ? "complete" : index === currentIndex ? "current" : ""}`} key={stage.key}><span className="stage-dot">{index < currentIndex || (job.status === "ready" && index <= currentIndex) ? <Check size={11} /> : index + 1}</span><strong>{stage.label}</strong><small>{stage.detail}</small></div>)}</div>{job.errorMessage && <div className="error-callout"><CircleAlert size={14} /> {job.errorMessage}</div>}</section>
        <section className="review-metrics"><div className="metric-card"><span>PUBLIC PAGES</span><strong>{job.pagesCrawled}<small> / {job.pageLimit}</small></strong><p>Within {job.depthLimit} levels of the root domain</p></div><div className="metric-card"><span>EMAIL SIGNALS</span><strong>{total}</strong><p>Deduplicated candidates with source URLs</p></div><div className="metric-card"><span>LIKELY VALID</span><strong>{verifiedTotal}</strong><p>DNS found and SMTP accepted</p></div><div className="metric-card"><span>NEEDS REVIEW</span><strong>{(counts.unknown ?? 0) + (counts.risky ?? 0)}</strong><p>Protected, catch-all, or temporary responses</p></div></section>
        <div className="review-grid"><section className="card-surface email-review-card"><div className="card-topline"><div><span className="section-number">EMAIL BREAKDOWN</span><span className="section-title">Verification results</span></div><span className="ai-label"><Mail size={13} /> {total} CANDIDATES</span></div><div className="breakdown-bars">{["verified", "likely_valid", "risky", "catch_all", "unknown", "invalid"].map((key) => <div className="breakdown-row" key={key}><span>{statusCopy[key]}</span><div className="breakdown-track"><i className={`status-${key}`} style={{ width: `${Math.max(0, ((counts[key] ?? 0) / Math.max(total, 1)) * 100)}%` }} /></div><strong>{counts[key] ?? 0}</strong></div>)}</div><div className="email-table">{data.emails.length === 0 && <div className="empty-review">No email signals found yet. The worker will update this view while the crawl is running.</div>}{data.emails.map((item) => <div className="email-row" key={item.id}><div className={`email-status-dot status-${item.verification?.finalStatus ?? "pending"}`} /><div className="email-value"><strong>{item.email}</strong><span>{item.role || "Business contact"} · {item.sourceUrl}</span></div><div className="email-result"><strong>{statusCopy[item.verification?.finalStatus ?? "pending"]}</strong><span>{item.verification?.reason || "Waiting for verification"}</span></div></div>)}</div></section><aside className="review-side"><section className="card-surface source-card"><div className="card-topline"><div><span className="section-number">CRAWL SOURCES</span><span className="section-title">Recent pages</span></div></div>{data.pages.map((page) => <div className="source-row" key={page.id}><div><strong>{page.title || new URL(page.url).pathname || "/"}</strong><span>{page.url}</span></div><small>{page.discoveredEmails} email{page.discoveredEmails === 1 ? "" : "s"}</small></div>)}</section><section className="slack-card"><div className="slack-icon"><Send size={16} /></div><div><span className="tiny-label">SLACK NOTIFICATION</span><h3>{job.status === "ready" ? "Review-ready alert queued" : "Alert when ready"}</h3><p>Add SLACK_REVIEW_WEBHOOK_URL on the server to deliver the alert.</p></div></section></aside></div>
      </div></main>
    </div>
  );
}
