import { Clock3, TrendingUp } from "lucide-react";

export function PriceHistoryPlaceholder({ entityName, kind }: { entityName: string; kind: "project" | "part" }) {
  const method = kind === "project"
    ? "The graph will track the aggregate of source-backed BOM prices for the complete design."
    : "The graph will track verified component price observations without publishing supplier identities.";
  return (
    <section aria-label={`${entityName} price history`} className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Price history</h2><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{method}</p></div><span className="text-link inline-flex items-center gap-1 border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"><Clock3 className="h-3.5 w-3.5" /> Coming soon</span></div>
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_230px] md:items-center">
        <div className="relative h-36 overflow-hidden border border-border bg-muted/15" aria-hidden="true">
          <svg viewBox="0 0 640 160" preserveAspectRatio="none" className="h-full w-full text-border">
            {[32, 64, 96, 128].map((y) => <line key={`y-${y}`} x1="0" y1={y} x2="640" y2={y} stroke="currentColor" strokeWidth="1" />)}
            {[80, 160, 240, 320, 400, 480, 560].map((x) => <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="160" stroke="currentColor" strokeWidth="1" />)}
          </svg>
          <div className="absolute inset-0 grid place-items-center"><div className="border border-border bg-background/95 px-4 py-2 text-center"><div className="text-xs font-semibold">No historical prices are plotted yet</div><div className="mt-1 text-[10px] text-muted-foreground">Only timestamped, validated observations will create graph points.</div></div></div>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border text-[11px] md:grid-cols-1">
          <HistoryState label="Range" value="Awaiting observations" />
          <HistoryState label="Currency" value="USD normalized" />
          <HistoryState label="Shipping" value="Tracked separately" />
          <HistoryState label="History policy" value="No synthetic points" />
        </dl>
      </div>
    </section>
  );
}

function HistoryState({ label, value }: { label: string; value: string }) {
  return <div className="bg-background p-2.5"><dt className="section-title">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
}
