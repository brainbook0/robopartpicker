import { ProductStatusBadge } from "./ProductStatusBadge";
import type { ProductStatus } from "@/lib/product-status";

export const PageHeader = ({ title, kicker, sub, actions, status }: { title: string; kicker?: string; sub?: string; actions?: React.ReactNode; status?: ProductStatus }) => (
  <div className="border-b border-border bg-surface">
    <div className="mx-auto max-w-[1400px] px-4 py-6 flex items-end justify-between gap-4">
      <div>
        {kicker && <div className="section-title mb-1">{kicker}</div>}
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-bold tracking-tight">{title}</h1>{status && <ProductStatusBadge status={status} />}</div>
        {sub && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {actions}
    </div>
  </div>
);
