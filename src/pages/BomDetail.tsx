import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, GitFork } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { bomsApi } from "@/lib/api/builds";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export default function BomDetail() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [forking, setForking] = useState(false);
  const query = useQuery({ queryKey: ["bom", slug], queryFn: ({ signal }) => bomsApi.get(slug, signal), enabled: Boolean(slug) });
  if (query.isLoading) return <div className="mx-auto max-w-[1400px] p-8 text-sm text-muted-foreground">Loading BOM…</div>;
  if (query.error || !query.data) return <div className="mx-auto max-w-[1400px] p-8 text-negative">{query.error?.message ?? "BOM not found."}</div>;
  const bom = query.data.item;

  const fork = async () => {
    if (!user) { navigate(`/auth?redirect=${encodeURIComponent(`/boms/${slug}`)}`); return; }
    setForking(true);
    try {
      const result = await bomsApi.forkToBuild(bom.id, { name: `${bom.name} build`, visibility: "private" });
      toast({ title: "Persistent build created", description: `${bom.items.length} BOM lines copied to your private build.` });
      navigate(`/builder?build=${encodeURIComponent(result.item.id)}`);
    } catch (error) { toast({ title: "Could not create build", description: error instanceof Error ? error.message : "Unexpected error.", variant: "destructive" }); }
    finally { setForking(false); }
  };

  return <div className="mx-auto max-w-[1400px] px-4 py-6">
    <div className="mb-1 text-xs text-muted-foreground"><Link to="/boms" className="hover:text-primary">BOMs</Link> / {bom.name}</div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><h1 className="text-[22px] font-bold">{bom.name}</h1><span className={`pill ${bom.is_demo ? "pill-yellow" : "pill-good"}`}>{bom.is_demo ? "demo fixture" : bom.visibility}</span></div><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{bom.version?.notes ?? "No version notes."}</p><div className="mt-1 text-[10px] uppercase text-muted-foreground">Version {bom.version?.label ?? "unknown"} · {bom.version?.currency ?? "USD"}</div></div>
      <div className="flex gap-2"><a className="btn-ghost inline-flex items-center gap-1" href={`/api/v1/boms/${encodeURIComponent(bom.id)}/export?format=csv`}><Download className="h-3.5 w-3.5" /> CSV</a><a className="btn-ghost inline-flex items-center gap-1" href={`/api/v1/boms/${encodeURIComponent(bom.id)}/export?format=json`}><Download className="h-3.5 w-3.5" /> RPPS JSON</a><button onClick={() => void fork()} disabled={forking} className="btn-primary inline-flex items-center gap-1"><GitFork className="h-3.5 w-3.5" /> {forking ? "Creating…" : "Fork to build"}</button></div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Kpi label="Known cost" value={money(bom.totals.knownCostMinor, bom.version?.currency)} /><Kpi label="Lines" value={String(bom.totals.lines)} /><Kpi label="Units" value={String(bom.totals.units)} /><Kpi label="Unpriced" value={String(bom.totals.unpricedLines)} /></div>
    <div className="mt-4 surface-card overflow-x-auto"><table className="data-table min-w-[900px]"><thead><tr><th>Slot</th><th>Component</th><th className="text-right">Qty</th><th>Selected supplier</th><th className="text-right">Known unit</th><th className="text-right">Offers</th></tr></thead><tbody>{bom.items.map((item) => <tr key={item.id}><td className="text-xs text-muted-foreground">{item.description}</td><td>{item.componentSlug ? <Link to={`/parts/${item.componentCategory}/${item.componentSlug}`} className="font-medium hover:text-primary">{item.componentName}</Link> : <span>{item.componentName ?? "Unmatched item"}</span>}<div className="text-[10px] text-muted-foreground">{item.manufacturerName ?? item.slotKey}</div></td><td className="text-right mono">{item.quantity} {item.unit}</td><td>{item.selectedSupplierName ?? "Not selected"}</td><td className="text-right mono">{money(item.targetUnitPriceMinor ?? item.selectedUnitPriceMinor ?? item.lowestUnitPriceMinor, bom.version?.currency)}</td><td className="text-right mono">{item.knownOfferCount}</td></tr>)}</tbody></table></div>
    {bom.is_demo === 1 && <div className="mt-3 border border-warning/40 bg-warning/10 p-3 text-xs">Fixture data is for product demonstration only. Prices and availability are not live commercial claims.</div>}
  </div>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="surface-card p-3"><div className="section-title">{label}</div><div className="mono text-lg font-bold">{value}</div></div>; }
function money(minor: number | null, currency = "USD"): string { return minor == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "USD" }).format(minor / 100); }
