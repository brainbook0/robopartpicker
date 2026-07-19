import { Info } from "lucide-react";

/** Compact fixture-data honesty notice. Two visual variants: `inline` for tight
 *  contexts (side rails, cards) and `banner` for page tops. Content is deliberately
 *  explicit: no claim of current inventory, real reviews, or verified reliability. */
export function CatalogDataNotice({ variant = "banner", className = "" }: { variant?: "banner" | "inline"; className?: string }) {
  const body = "Demonstration data only. Component specs, offers, stock levels, prices, supplier verification/rating, incident counts, and lead times are static fixtures — not live feeds, validated engineering claims, or current commercial availability.";
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
      aria-label="Fixture data notice"
      className={`surface-card px-3 py-2 flex items-start gap-2 text-[11.5px] text-muted-foreground border-warning/30 bg-warning/5 ${className}`}
    >
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" aria-hidden />
      <span><span className="uppercase tracking-wide text-warning font-medium mr-1">Fixture data</span>{body}</span>
    </div>
  );
}

export const FIXTURE_TOOLTIP = "Static demonstration fixture. Not sourced from a live catalog or current supplier feed.";