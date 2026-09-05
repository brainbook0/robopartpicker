import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FileCheck2, Send, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { projectProposalsApi, type ProjectProposal, type ProjectProposalInput, type ProjectProposalReviewInput, type ProjectProposalType } from "@/lib/api/project-proposals";

const labels: Record<ProjectProposalType, string> = {
  assembly_step: "Assembly step", assembly_video: "Assembly video", integration: "Integration",
  source: "Source or verification", identity_correction: "Identity correction", bom_correction: "BOM correction", issue_report: "Issue or correction",
};

export function ProjectProposalPanel({ projectId, signedIn, canReview, create = projectProposalsApi.create, loadApproved = projectProposalsApi.listApproved, loadReviewQueue = projectProposalsApi.listReviewQueue, review = projectProposalsApi.review }: {
  projectId: string; signedIn: boolean; canReview: boolean;
  create?: (projectId: string, input: ProjectProposalInput) => Promise<ProjectProposal>;
  loadApproved?: (projectId: string) => Promise<ProjectProposal[]>;
  loadReviewQueue?: (projectId: string) => Promise<ProjectProposal[]>;
  review?: (projectId: string, proposalId: string, input: ProjectProposalReviewInput) => Promise<ProjectProposal>;
}) {
  const [form, setForm] = useState<{ proposalType: ProjectProposalType; title: string; details: string; sourceLinks: string }>({ proposalType: "source", title: "", details: "", sourceLinks: "" });
  const [approved, setApproved] = useState<ProjectProposal[]>([]);
  const [queue, setQueue] = useState<ProjectProposal[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { let live = true; loadApproved(projectId).then((items) => { if (live) setApproved(items); }).catch(() => undefined); return () => { live = false; }; }, [loadApproved, projectId]);
  useEffect(() => { if (!canReview) return; let live = true; loadReviewQueue(projectId).then((items) => { if (live) setQueue(items); }).catch(() => undefined); return () => { live = false; }; }, [canReview, loadReviewQueue, projectId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null); setMessage(null);
    const sourceUrls = form.sourceLinks.split(/\r?\n|,/u).map((value) => value.trim()).filter(Boolean);
    if (!sourceUrls.length || sourceUrls.some((value) => { try { new URL(value); return false; } catch { return true; } })) { setError("Add at least one complete http(s) source link."); return; }
    setBusy("submit");
    try { await create(projectId, { proposalType: form.proposalType, title: form.title, details: form.details, sourceUrls }); setForm({ proposalType: "source", title: "", details: "", sourceLinks: "" }); setMessage("Proposal submitted for review"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The proposal could not be submitted."); }
    finally { setBusy(null); }
  };

  const decide = async (proposal: ProjectProposal, action: "approve" | "reject") => {
    const reviewNote = notes[proposal.id]?.trim() ?? "";
    if (reviewNote.length < 10) { setError("Review notes must explain the evidence decision."); return; }
    setBusy(proposal.id); setError(null);
    try { const updated = await review(projectId, proposal.id, { action, reviewNote }); setQueue((items) => items.filter((item) => item.id !== proposal.id)); if (updated.status === "approved") setApproved((items) => [updated, ...items]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The review could not be saved."); }
    finally { setBusy(null); }
  };

  return <section className="surface-card overflow-hidden">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3"><div><h2 className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-4 w-4 text-primary" /> Propose a verified change</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Submit assembly, integration, source, identity, BOM or correction evidence. Every proposal needs source links and remains private until approval.</p></div><span className="text-link border border-primary/30 bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">Moderated</span></header>
    <div className="grid gap-px bg-border lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
      <div className="bg-background p-4">{signedIn ? <form onSubmit={(event) => void submit(event)} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs"><span className="section-title">Proposal type</span><select aria-label="Proposal type" value={form.proposalType} onChange={(event) => setForm({ ...form, proposalType: event.target.value as ProjectProposalType })} className="input-bare mt-1 h-10 w-full">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs"><span className="section-title">Proposal title</span><input aria-label="Proposal title" required minLength={5} maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="input-bare mt-1 h-10 w-full" /></label></div><label className="block text-xs"><span className="section-title">Proposed change</span><textarea aria-label="Proposed change" required minLength={20} maxLength={4000} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} className="input-bare mt-1 min-h-24 w-full" /></label><label className="block text-xs"><span className="section-title">Source links</span><textarea aria-label="Source links" required value={form.sourceLinks} onChange={(event) => setForm({ ...form, sourceLinks: event.target.value })} placeholder="One manufacturer, documentation, repository or test URL per line" className="input-bare mt-1 min-h-16 w-full font-mono" /></label><div className="flex flex-wrap items-center justify-between gap-2"><p className="max-w-lg text-[10.5px] leading-5 text-muted-foreground">The proposal is not public until an owner or moderator approves it. Approval records the reviewer, note and resulting canonical project version when applicable.</p><button type="submit" disabled={busy === "submit"} className="btn-primary"><Send className="h-4 w-4" /> {busy === "submit" ? "Submitting…" : "Submit for review"}</button></div></form> : <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><p className="text-xs leading-5 text-muted-foreground">Sign in before submitting source-linked technical changes.</p><Link to="/auth?redirect=proposal" className="btn-primary mt-3 inline-flex">Sign in to propose a change</Link></div></div>}{message && <p role="status" className="mt-3 border border-positive/30 bg-positive/5 p-2 text-xs text-positive">{message}</p>}{error && <p role="alert" className="mt-3 border border-negative/30 bg-negative/5 p-2 text-xs text-negative">{error}</p>}</div>
      <div className="bg-background p-4"><div className="section-title">Approved community evidence · {approved.length}</div>{approved.length ? <ul className="mt-2 space-y-2">{approved.map((proposal) => <li key={proposal.id} className="border border-border p-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{proposal.title}</span><span className="pill pill-good">approved</span></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{proposal.details}</p><div className="mt-1 flex flex-wrap gap-2">{proposal.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-link inline-flex items-center gap-1 text-[10.5px] hover:underline">source <ExternalLink className="h-3 w-3" /></a>)}</div></li>)}</ul> : <p className="mt-2 text-xs leading-5 text-muted-foreground">No approved community changes yet. Canonical project records remain the source of truth.</p>}</div>
    </div>
    {canReview && queue.length > 0 && <div className="border-t border-border bg-warning/5 p-4"><div className="section-title">Review queue · {queue.length}</div><div className="mt-2 space-y-2">{queue.map((proposal) => <div key={proposal.id} className="border border-warning/30 bg-background p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-medium">{proposal.title}</span><span className="ml-2 text-[10px] uppercase text-muted-foreground">{labels[proposal.proposalType]}</span></div><div className="flex gap-1">{proposal.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Source <ExternalLink className="h-3 w-3" /></a>)}</div></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{proposal.details}</p><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input aria-label={`Review note for ${proposal.title}`} value={notes[proposal.id] ?? ""} onChange={(event) => setNotes({ ...notes, [proposal.id]: event.target.value })} placeholder="Explain the evidence decision" className="input-bare h-9" /><button aria-label={`Approve ${proposal.title}`} disabled={busy === proposal.id} onClick={() => void decide(proposal, "approve")} className="btn-primary btn-sm"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button><button aria-label={`Reject ${proposal.title}`} disabled={busy === proposal.id} onClick={() => void decide(proposal, "reject")} className="btn-ghost btn-sm text-negative"><XCircle className="h-3.5 w-3.5" /> Reject</button></div></div>)}</div></div>}
  </section>;
}
