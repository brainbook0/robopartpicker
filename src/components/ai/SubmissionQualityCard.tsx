import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { SubmissionQualityReview } from "@/lib/assistant";

export function SubmissionQualityCard({ review }: { review: SubmissionQualityReview }) {
  const passes = review.decision === "meets_standard";
  return (
    <section className={`surface-card border p-3 ${passes ? "border-emerald-500/35" : "border-amber-500/45"}`} aria-live="polite">
      <div className="flex items-center gap-2">
        {passes ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
        <div className="section-title">AI quality review</div>
        <span className={`pill ml-auto ${passes ? "pill-good" : "pill-warn"}`}>{passes ? "meets standard" : "changes suggested"}</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed">{review.summary}</p>
      {review.issues.length > 0 && (
        <div className="mt-3 space-y-2">
          {review.issues.map((issue, index) => (
            <div key={`${issue.field ?? "general"}-${index}`} className="rounded border border-border/70 bg-muted/20 p-2 text-[10.5px]">
              <div className="flex items-center gap-1.5"><span className="font-mono uppercase text-muted-foreground">{issue.severity}</span>{issue.field && <span className="pill">{issue.field}</span>}</div>
              <p className="mt-1">{issue.message}</p>
              <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Suggested:</span> {issue.suggestedChange}</p>
            </div>
          ))}
        </div>
      )}
      {review.missingEvidence.length > 0 && (
        <div className="mt-3 rounded border border-dashed border-border p-2 text-[10.5px]">
          <div className="flex items-center gap-1 font-medium"><ShieldCheck className="h-3 w-3" /> Evidence still missing</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">{review.missingEvidence.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
      <p className="mt-2 text-[9.5px] text-muted-foreground">Advisory AI review, not engineering certification. The creator controls the final wording and submission.</p>
    </section>
  );
}
