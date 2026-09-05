import type { ProductStatus } from "@/lib/product-status";

export function ProductStatusBadge({ status, className = "" }: { status: ProductStatus; className?: string }) {
  const tone = status.maturity === "beta"
    ? "border-warning/50 bg-warning/10 text-foreground"
    : "border-border bg-muted/60 text-muted-foreground";

  return (
    <span
      aria-label={`${status.label} feature status`}
      data-product-status={status.maturity}
      className={`inline-flex shrink-0 items-center border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${tone} ${className}`}
    >
      {status.label}
    </span>
  );
}
