import { AlertTriangle, CheckCircle2, Code2, FileQuestion, FileX2 } from "lucide-react";
import { quoteBlockerForBomState, type BomPublicationState } from "@/shared/bomPublication";

const PRESENTATION: Record<BomPublicationState, {
  title: string;
  tone: string;
  icon: typeof FileQuestion;
}> = {
  verified: { title: "Verified source BOM", tone: "border-positive/40 bg-positive/5", icon: CheckCircle2 },
  partial: { title: "Partial source BOM", tone: "border-warning/40 bg-warning/5", icon: AlertTriangle },
  unavailable: { title: "Source BOM unavailable", tone: "border-border bg-muted/20", icon: FileX2 },
  manufacturer_unavailable: { title: "Manufacturer BOM unavailable", tone: "border-border bg-muted/20", icon: FileX2 },
  not_applicable: { title: "Hardware BOM not applicable", tone: "border-border bg-muted/20", icon: Code2 },
  classification_required: { title: "Project classification required", tone: "border-warning/40 bg-warning/5", icon: FileQuestion },
  draft: { title: "BOM validation in progress", tone: "border-primary/30 bg-primary/5", icon: FileQuestion },
  rejected: { title: "BOM source rejected", tone: "border-negative/40 bg-negative/5", icon: FileX2 },
};

export function BomPublicationNotice({
  state,
  coverageNote,
  omissions = [],
}: {
  state: BomPublicationState;
  coverageNote?: string | null;
  omissions?: Array<{ sourceObjectId?: unknown; reason?: unknown }>;
}) {
  const presentation = PRESENTATION[state];
  const Icon = presentation.icon;
  const defaultMessage = quoteBlockerForBomState(state);
  return (
    <section className={`border p-4 ${presentation.tone}`} aria-labelledby={`bom-state-${state}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id={`bom-state-${state}`} className="font-semibold">{presentation.title}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{coverageNote?.trim() || defaultMessage}</p>
          {omissions.length > 0 && (
            <ul className="mt-2 space-y-1 font-mono text-[10.5px] leading-4 text-muted-foreground" aria-label="Known BOM omissions">
              {omissions.slice(0, 8).map((omission, index) => {
                const source = typeof omission.sourceObjectId === "string" ? omission.sourceObjectId : `source object ${index + 1}`;
                const reason = typeof omission.reason === "string" ? omission.reason.replace(/_/gu, " ") : "unresolved";
                return <li key={`${source}-${index}`}>{source}: {reason}</li>;
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
