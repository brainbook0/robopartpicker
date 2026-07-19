export const PageHeader = ({ title, kicker, sub, actions }: { title: string; kicker?: string; sub?: string; actions?: React.ReactNode }) => (
  <div className="border-b border-border bg-surface">
    <div className="mx-auto max-w-[1400px] px-4 py-6 flex items-end justify-between gap-4">
      <div>
        {kicker && <div className="section-title mb-1">{kicker}</div>}
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{sub}</p>}
      </div>
      {actions}
    </div>
  </div>
);
