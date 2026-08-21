import { Info } from "lucide-react";

/** Compact catalog provenance notice. Demo records are withheld from the live
 *  catalog; missing commercial observations remain explicitly unknown. */
export function CatalogDataNotice({ variant = "banner", className = "" }: { variant?: "banner" | "inline"; className?: string }) {
  const body = "Only non-demo catalog records and offers are shown. Prices, stock, lead times, specifications, and compatibility reflect the latest stored source observation, not a checkout quote or engineering guarantee; unknown values stay blank.";
  if (variant === "inline") {
    return (
      <div className={`text-[11px] text-muted-foreground flex items-start gap-1.5 ${className}`}>
        <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
        <span>{body}</span>
      </div>
    );
  }
  return (
    <div
      role="note"
      aria-label="Catalog data provenance notice"
      className={`surface-card px-3 py-2 flex items-start gap-2 text-[11.5px] text-muted-foreground border-warning/30 bg-warning/5 ${className}`}
    >
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" aria-hidden />
      <span><span className="uppercase tracking-wide text-warning font-medium mr-1">Source observations</span>{body}</span>
    </div>
  );
}

export const FIXTURE_TOOLTIP = "Latest stored source observation. Verify current price, stock, lead time, and fit with the supplier.";
