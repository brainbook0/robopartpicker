import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { bomsApi } from "@/lib/api/builds";

export default function BomsIndex() {
  const query = useQuery({ queryKey: ["boms"], queryFn: ({ signal }) => bomsApi.list(signal) });
  return <>
    <PageHeader kicker="BOMs" title="Versioned bills of materials" sub="D1-backed production BOMs with source-observed offers and explicit unresolved lines."
      actions={<Link to="/builder" className="btn-primary">Open build workspace</Link>} />
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      {query.isLoading && <div className="surface-card p-6 text-sm text-muted-foreground">Loading BOMs from D1…</div>}
      {query.error && <div className="surface-card p-6 text-sm text-negative">{query.error.message}</div>}
      {query.data && <>
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground"><span>{query.data.total} BOMs</span><span className="pill pill-yellow">Data mode: {query.data.dataMode}</span></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {query.data.items.map((bom) => <Link to={`/boms/${bom.slug ?? bom.id}`} key={bom.id} className="surface-card surface-card-hover p-4">
            <div className="mb-2 flex items-center gap-2"><span className={`pill ${bom.is_demo ? "pill-yellow" : "pill-good"}`}>{bom.is_demo ? "demo fixture" : bom.visibility}</span>{bom.project_id && <span className="text-[10px] text-muted-foreground">project-linked</span>}</div>
            <div className="font-semibold">{bom.name}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <Stat label="Known cost" value={money(bom.known_cost_minor)} />
              <Stat label="Lines" value={String(bom.line_count)} />
              <Stat label="Unpriced" value={String(bom.unpriced_lines)} />
            </div>
            <div className="mt-3 text-[10px] text-muted-foreground">Updated {new Date(bom.updated_at).toLocaleDateString()}</div>
          </Link>)}
        </div>
      </>}
    </div>
  </>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div><div className="text-muted-foreground">{label}</div><div className="mono font-semibold">{value}</div></div>; }
function money(minor: number): string { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(minor / 100); }
