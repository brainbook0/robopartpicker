import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { useComponents } from "@/lib/api/catalog";
import { categoryLabel, lowestPrice, type PartCategory } from "@/shared/catalog";

const validCategories = new Set<PartCategory>(["actuator", "hand", "sensor", "compute", "driver", "reducer"]);

export default function Finder() {
  const { type } = useParams();
  const category: PartCategory = validCategories.has(type as PartCategory) ? type as PartCategory : "actuator";
  const [maxPrice, setMaxPrice] = useState("");
  const [minOffers, setMinOffers] = useState(0);
  const [openSource, setOpenSource] = useState(false);
  const [ros, setRos] = useState(false);
  const query = useComponents({ category, limit: 100 });
  const rows = useMemo(() => (query.data?.items ?? []).filter((part) => {
    if (maxPrice && (!part.offers.length || lowestPrice(part) > Number(maxPrice))) return false;
    if (part.offers.length < minOffers) return false;
    if (openSource && !part.openSource) return false;
    if (ros && part.rosSupport === "none") return false;
    return true;
  }).sort((left, right) => (left.offers.length ? lowestPrice(left) : Infinity) - (right.offers.length ? lowestPrice(right) : Infinity)), [query.data, maxPrice, minOffers, openSource, ros]);

  return <main className="mx-auto max-w-[1200px] px-4 py-6">
    <div className="section-title">Guided finder · D1 catalog</div><h1 className="mt-1 flex items-center gap-2 text-[22px] font-bold"><SlidersHorizontal className="h-5 w-5 text-primary" /> Find {categoryLabel[category].toLowerCase()}</h1><p className="mt-1 text-xs text-muted-foreground">Filters use normalized catalog fields and observed supplier records. Results are recommendations for review, not compatibility guarantees.</p>
    <div className="surface-card mt-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs"><span className="text-muted-foreground">Maximum observed USD</span><input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className="input-bare mt-1 h-9 w-full" placeholder="No maximum" /></label><label className="text-xs"><span className="text-muted-foreground">Minimum known offers</span><select value={minOffers} onChange={(event) => setMinOffers(Number(event.target.value))} className="input-bare mt-1 h-9 w-full"><option value="0">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option></select></label><label className="mt-5 flex items-center gap-2 text-xs"><input type="checkbox" checked={openSource} onChange={(event) => setOpenSource(event.target.checked)} /> Open source only</label><label className="mt-5 flex items-center gap-2 text-xs"><input type="checkbox" checked={ros} onChange={(event) => setRos(event.target.checked)} /> ROS support</label></div>
    {query.isLoading && <State>Loading components from D1…</State>}{query.error && <State error>{query.error.message}</State>}
    {!query.isLoading && <div className="mt-4 surface-card overflow-x-auto"><table className="data-table min-w-[850px]"><thead><tr><th>Component</th><th>Manufacturer</th><th>Relevant specs</th><th className="text-right">Offers</th><th className="text-right">Lowest observed</th><th></th></tr></thead><tbody>{rows.map((part) => <tr key={part.id}><td><Link to={`/parts/${part.category}/${part.slug}`} className="font-medium hover:text-primary">{part.name}</Link>{part.isDemo && <span className="pill pill-yellow ml-2">demo</span>}<div className="text-[10px] text-muted-foreground">{part.provenanceLabel}</div></td><td>{part.maker}</td><td className="max-w-[360px] text-xs text-muted-foreground">{specSummary(part)}</td><td className="text-right mono">{part.offers.length}</td><td className="text-right mono">{part.offers.length ? `$${lowestPrice(part).toLocaleString()}` : "—"}</td><td className="text-right"><Link className="btn-primary btn-sm" to={`/parts/${part.category}/${part.slug}`}>Review</Link></td></tr>)}{rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No records match. Increase the price limit or relax the supplier/feature filters.</td></tr>}</tbody></table></div>}
  </main>;
}

function specSummary(part: Record<string, unknown>): string { const ignored = new Set(["id", "slug", "category", "name", "maker", "makerCountry", "region", "blurb", "tags", "offers", "priceHistory", "compatibility", "provenanceLabel", "freshnessAt", "isDemo"]); return Object.entries(part).filter(([key, value]) => !ignored.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")).slice(0, 5).map(([key, value]) => `${key}: ${String(value)}`).join(" · "); }
function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`surface-card mt-4 p-6 text-center text-sm ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>; }
