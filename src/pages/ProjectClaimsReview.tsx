import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FileLock2, Loader2, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api/client";
import { projectClaimsApi } from "@/lib/api/projectClaims";
import type { ProjectClaimReviewItem, ProjectClaimStatus } from "@/shared/projectClaims";
import { PageMeta } from "@/components/PageMeta";

const statuses: ProjectClaimStatus[] = ["pending", "approved", "rejected", "withdrawn"];

export default function ProjectClaimsReview() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<ProjectClaimStatus>("pending");
  const [items, setItems] = useState<ProjectClaimReviewItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    setForbidden(false);
    setError(null);
    try {
      setItems(await projectClaimsApi.reviewQueue(status, signal));
    } catch (cause) {
      if (cause instanceof DOMException) return;
      if (cause instanceof ApiError && cause.status === 403) setForbidden(true);
      else setError(message(cause));
    } finally {
      setLoading(false);
    }
  }, [status, user]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function review(item: ProjectClaimReviewItem, action: "approve" | "reject") {
    const privateModeratorNotes = notes[item.id]?.trim() ?? "";
    if (privateModeratorNotes.length < 10) {
      toast({ title: "Add review notes", description: "Private moderator notes must contain at least 10 characters.", variant: "destructive" });
      return;
    }
    setBusy(item.id);
    try {
      await projectClaimsApi.review(item.id, { action, privateModeratorNotes });
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setNotes((current) => { const next = { ...current }; delete next[item.id]; return next; });
      toast({ title: action === "approve" ? "Claim approved" : "Claim rejected", description: action === "approve" ? "Edit ownership transferred atomically." : "No ownership change was made." });
    } catch (cause) {
      toast({ title: "Review failed", description: message(cause), variant: "destructive" });
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 403)) await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-5">
      <PageMeta title="Project claim review | RoboPartPicker" description="Private moderator queue for open-source project ownership claims." path="/admin/project-claims" noIndex />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="section-title">Moderator workspace</div><h1 className="text-xl font-bold">Project ownership claims</h1><p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">Review private evidence. Approval transfers edit ownership only when the project snapshot is still current. Claimants cannot review their own requests.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading || !user} className="btn-ghost btn-sm disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label="Claim status">
        {statuses.map((value) => <button key={value} type="button" role="tab" aria-selected={status === value} onClick={() => setStatus(value)} className={status === value ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{value}</button>)}
      </div>

      {authLoading || loading ? <State icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Loading claim queue" text="Checking moderator access and private review records." />
        : !user ? <State icon={<ShieldAlert className="h-5 w-5" />} title="Authentication required" text={<><Link to="/auth" className="text-primary hover:underline">Sign in</Link> with a moderator or administrator account.</>} />
        : forbidden ? <State icon={<ShieldAlert className="h-5 w-5 text-warning" />} title="Moderator access required" text="This queue is private. The Worker did not return any claim records." />
        : error ? <State icon={<XCircle className="h-5 w-5 text-destructive" />} title="Claim queue unavailable" text={error} />
        : items.length === 0 ? <State icon={<ShieldCheck className="h-5 w-5 text-primary" />} title={`No ${status} claims`} text="Nothing requires action in this view." />
        : <div className="mt-4 space-y-3">{items.map((item) => (
          <article key={item.id} className="surface-card p-4" aria-labelledby={`claim-${item.id}`}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 id={`claim-${item.id}`} className="text-[13px] font-semibold"><Link to={`/projects/${item.projectSlug}`} className="hover:text-primary">{item.projectName}</Link></h2><div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.projectSlug} · {item.id}</div></div><span className="rounded border border-border px-2 py-1 text-[10px] font-medium uppercase tracking-wide">{item.status}</span></div>
                <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Claimant</dt><dd className="font-medium">{item.claimantDisplayName}</dd><dd className="font-mono text-[10px] text-muted-foreground">{item.claimantUserId}</dd></div>
                  <div><dt className="text-muted-foreground">Submitted</dt><dd>{new Date(item.createdAt).toLocaleString()}</dd></div>
                </dl>
                {item.evidenceReference && <div className="mt-3 border border-border bg-muted/20 p-3 text-[11px] leading-5"><div className="mb-1 font-medium">Private claimant context</div><p className="whitespace-pre-wrap text-muted-foreground">{item.evidenceReference}</p></div>}
              </div>
              <aside className="border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-2"><FileLock2 className="h-4 w-4 text-primary" /><div className="min-w-0"><div className="truncate text-[11px] font-medium">{item.evidenceFile.originalName}</div><div className="text-[10px] text-muted-foreground">{item.evidenceFile.mediaType} · {formatBytes(item.evidenceFile.sizeBytes)}</div></div></div>
                <a href={item.evidenceFile.contentUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 w-full justify-center">Inspect private evidence <ExternalLink className="h-3 w-3" /></a>
                <p className="mt-2 text-[9.5px] leading-4 text-muted-foreground">Protected streaming route. Private, no-store, and denied for the claimant’s own moderator account.</p>
              </aside>
            </div>
            {item.status === "pending" && <div className="mt-4 border-t border-border pt-4"><label htmlFor={`notes-${item.id}`} className="text-[11px] font-medium">Private moderator notes</label><textarea id={`notes-${item.id}`} required minLength={10} maxLength={4000} className="input-bare mt-1 min-h-24 w-full resize-y" value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Record the evidence reviewed and the reason for this decision. Never include notes in public project data." /><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy === item.id} onClick={() => void review(item, "approve")} className="btn-primary btn-sm disabled:opacity-50">{busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Approve and transfer</button><button type="button" disabled={busy === item.id} onClick={() => void review(item, "reject")} className="btn-ghost btn-sm text-destructive disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Reject claim</button></div></div>}
          </article>
        ))}</div>}
    </main>
  );
}

function State({ icon, title, text }: { icon: React.ReactNode; title: string; text: React.ReactNode }) { return <section className="surface-card mt-4 flex items-start gap-3 p-5" role="status"><div className="mt-0.5">{icon}</div><div><h2 className="text-[13px] font-semibold">{title}</h2><div className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</div></div></section>; }
function formatBytes(value: number): string { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(value / 1024))} KiB`; }
function message(error: unknown): string { return error instanceof Error ? error.message : "Request failed."; }
