import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FileCheck2, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/api/files";
import { projectClaimsApi } from "@/lib/api/projectClaims";
import type { ProjectClaimEligibility, ProjectClaimReceipt } from "@/shared/projectClaims";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function ProjectClaimPanel({ projectId, signedIn, isOwner }: { projectId: string; signedIn: boolean; isOwner: boolean }) {
  const [eligibility, setEligibility] = useState<ProjectClaimEligibility | null>(null);
  const [claim, setClaim] = useState<ProjectClaimReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      projectClaimsApi.eligibility(projectId, controller.signal),
      signedIn ? projectClaimsApi.mine(projectId, controller.signal) : Promise.resolve([]),
    ]).then(([nextEligibility, claims]) => {
      setEligibility(nextEligibility);
      setClaim(claims[0] ?? null);
    }).catch((error) => {
      if (!(error instanceof DOMException)) setEligibility(null);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [projectId, signedIn]);

  if (loading || isOwner || !eligibility?.claimable) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidenceFile) return;
    if (evidenceFile.size > MAX_EVIDENCE_BYTES) {
      toast({ title: "Evidence file is too large", description: "Use one private file no larger than 10 MiB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadFile(evidenceFile, "test_evidence", "private");
      const receipt = await projectClaimsApi.submit(projectId, {
        evidenceFileId: uploaded.fileId,
        ...(reference.trim() ? { evidenceReference: reference.trim() } : {}),
      });
      setClaim(receipt);
      setEvidenceFile(null);
      setReference("");
      toast({ title: "Ownership claim submitted", description: "A moderator will review the private evidence before edit ownership changes." });
    } catch (error) {
      toast({ title: "Claim submission failed", description: message(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!claim) return;
    setBusy(true);
    try {
      setClaim(await projectClaimsApi.withdraw(claim.id));
      toast({ title: "Claim withdrawn" });
    } catch (error) {
      toast({ title: "Could not withdraw claim", description: message(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-card border-primary/30 p-4" aria-labelledby="project-claim-title">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 id="project-claim-title" className="text-[13px] font-semibold">Maintain this open-source project</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Project maintainers can request edit ownership. A different platform moderator reviews private evidence before any transfer.</p>
        </div>
      </div>

      {claim ? (
        <div className="mt-3 border border-border bg-muted/20 p-3 text-[11px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-primary" /><span className="font-medium">Claim {statusLabel(claim.status)}</span></div>
            <span className="mono text-[10px] text-muted-foreground">{new Date(claim.updatedAt).toLocaleDateString()}</span>
          </div>
          <p className="mt-2 leading-5 text-muted-foreground">{statusCopy(claim.status)}</p>
          {claim.status === "pending" && <button type="button" disabled={busy} onClick={() => void withdraw()} className="btn-ghost btn-sm mt-2 disabled:opacity-50">{busy ? "Withdrawing…" : "Withdraw claim"}</button>}
        </div>
      ) : signedIn ? (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label className="block text-[11px] font-medium" htmlFor={`claim-evidence-${projectId}`}>Private ownership evidence</label>
          <label className="flex cursor-pointer items-center gap-3 border border-dashed border-primary/50 bg-primary/5 p-3 text-[11px] focus-within:ring-2 focus-within:ring-ring">
            <UploadCloud className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">{evidenceFile?.name ?? "Choose a PDF, image, text file, or archive up to 10 MiB"}</span>
            <input id={`claim-evidence-${projectId}`} type="file" required className="sr-only" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,application/zip" onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)} />
          </label>
          <p className="text-[10px] leading-4 text-muted-foreground">Evidence stays private. It is never attached to the public project or returned by public APIs.</p>
          <label className="block text-[11px] font-medium" htmlFor={`claim-reference-${projectId}`}>Private context <span className="font-normal text-muted-foreground">optional</span></label>
          <textarea id={`claim-reference-${projectId}`} className="input-bare min-h-20 w-full resize-y" maxLength={2000} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Explain your relationship to the repository, release, maintainer account, or organization." />
          <button type="submit" disabled={busy || !evidenceFile} className="btn-primary btn-sm disabled:opacity-50">{busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading privately…</> : "Submit ownership claim"}</button>
        </form>
      ) : (
        <div className="mt-3 border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">Sign in to submit private maintainer evidence. <Link to="/auth" className="font-medium text-primary hover:underline">Sign in</Link></div>
      )}
    </section>
  );
}

function statusLabel(status: ProjectClaimReceipt["status"]): string {
  return ({ pending: "pending review", approved: "approved", rejected: "not approved", withdrawn: "withdrawn" })[status];
}

function statusCopy(status: ProjectClaimReceipt["status"]): string {
  return ({
    pending: "The evidence is private and queued for review. Edit ownership has not changed.",
    approved: "A moderator approved the claim and edit ownership was transferred.",
    rejected: "The submitted evidence did not establish ownership. Submit a new claim with stronger evidence if needed.",
    withdrawn: "This claim was withdrawn before review. You can submit a new claim.",
  })[status];
}

function message(error: unknown): string { return error instanceof Error ? error.message : "Request failed."; }
