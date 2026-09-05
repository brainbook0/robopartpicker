import { BookOpen, ExternalLink, FileCheck2, FlaskConical, GitBranch, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export type VerificationEvidence = {
  claim: string;
  source_type: string;
  confidence?: number | null;
  retrieved_at?: string | null;
  source_url?: string | null;
};

export function SourcesVerification({ evidence, projectId }: { evidence: VerificationEvidence[]; projectId: string }) {
  return (
    <section aria-label="Sources & verification" className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div><h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Sources & verification</h2><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Each technical claim retains its source type, retrieval date, and confidence. Sources support a claim; they do not turn an estimate into a measured fact.</p></div>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{evidence.length} verified record{evidence.length === 1 ? "" : "s"}</span>
      </div>

      {evidence.length === 0 ? (
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><h3 className="text-sm font-semibold">Source verification is open</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Add an official document, repository location, test result, teardown, or other source-backed correction. Proposals require review before publication.</p></div><Link to={`/community?compose=source&project=${encodeURIComponent(projectId)}`} className="btn-primary justify-center">Propose a source</Link></div>
      ) : (
        <div className="grid gap-px bg-border sm:grid-cols-2">
          {evidence.map((item, index) => {
            const confidence = normalizedConfidence(item.confidence);
            const source = sourcePresentation(item.source_type);
            const Icon = source.icon;
            return (
              <article key={`${item.claim}-${index}`} className="min-w-0 bg-background p-4">
                <div className="flex min-w-0 items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center border border-primary/30 bg-primary/5 text-primary"><Icon className="h-4 w-4" /></span><div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{source.label}</div><div className="mt-0.5 text-[11px] font-medium text-foreground">{confidence.label}</div></div></div><span className="shrink-0 font-mono text-[10px] text-muted-foreground">{confidence.percent}% confidence</span></div>
                <p className="mt-3 break-words text-[12px] leading-5 [overflow-wrap:anywhere]">{humanizeEvidenceClaim(item.claim)}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[10.5px] text-muted-foreground"><span>Retrieved {formatDate(item.retrieved_at)}</span>{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer" aria-label={`Open ${source.label.toLowerCase()} source`} className="text-link inline-flex items-center gap-1 font-medium hover:underline">Open source <ExternalLink className="h-3 w-3" /></a> : <span>Source link review queued</span>}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function normalizedConfidence(value: number | null | undefined): { percent: number; label: string } {
  const bounded = Number.isFinite(value) ? Math.min(1, Math.max(0, value ?? 0.5)) : 0.5;
  const percent = Math.round(bounded * 100);
  return { percent, label: percent >= 85 ? "Strong verification" : percent >= 60 ? "Moderate verification" : "Preliminary verification" };
}

function sourcePresentation(value: string): { label: string; icon: typeof FileCheck2 } {
  const normalized = value.trim().toLowerCase();
  if (normalized === "datasheet" || normalized === "docs") return { label: normalized === "datasheet" ? "Datasheet" : "Documentation", icon: BookOpen };
  if (normalized === "official_product_page") return { label: "Official product page", icon: BookOpen };
  if (normalized === "repo") return { label: "Repository", icon: GitBranch };
  if (normalized === "test" || normalized === "paper") return { label: normalized === "test" ? "Test result" : "Research paper", icon: FlaskConical };
  if (normalized === "supplier" || normalized === "listing") return { label: "Commercial source", icon: FileCheck2 };
  return { label: normalized ? normalized.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase()) : "Source record", icon: FileCheck2 };
}

function formatDate(value: string | null | undefined): string {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(time))
    : "date review queued";
}

function humanizeEvidenceClaim(value: string): string {
  if (/\b(?:sha[- ]?256|checksum)\b/iu.test(value) || /\b[a-f0-9]{32,}\b/iu.test(value)) {
    return /\b(?:image|photo|cover|media)\b/iu.test(value)
      ? "Official product image retained with integrity verification."
      : "Source artifact retained with integrity verification.";
  }
  return value;
}
