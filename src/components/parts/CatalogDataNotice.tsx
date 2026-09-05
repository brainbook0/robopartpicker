import { Info } from "lucide-react";

/** Compact catalog provenance notice for public technical component data. */
export function CatalogDataNotice({ variant = "banner", className = "" }: { variant?: "banner" | "inline"; className?: string }) {
  const body = "Public profiles show source-backed component identity, technical specifications, engineering files, project usage, and explicit unknowns. Commercial sourcing observations remain private; verify every specification and fit against the linked product source.";
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
      <span><span className="mr-1 font-semibold uppercase tracking-wide text-foreground">Source observations</span>{body}</span>
    </div>
  );
}
