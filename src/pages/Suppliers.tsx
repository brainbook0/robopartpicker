import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSuppliers } from "@/lib/api/catalog";
import { rfqDrafts } from "@/lib/catalogWorkspace";
import { PageHeader } from "@/components/common/PageHeader";
import { ComingSoon } from "@/components/common/ComingSoon";
import { liveRecords } from "@/lib/catalogHonesty";
import { ExternalLink, Factory } from "lucide-react";

const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./,""); } catch { return url; } };

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="p-2">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mono text-[13px] text-foreground">{value}</div>
  </div>
);

export default function Suppliers() {
  const supplierQuery = useSuppliers();
  // Only real (non-demo) supplier records are shown. Seeded demo fixtures carry
  // fabricated ratings, lead times, documentation scores, and imagery.
  const suppliers = useMemo(() => liveRecords(supplierQuery.data?.items ?? []), [supplierQuery.data?.items]);
  const [sp, setSp] = useSearchParams();
  const cat = sp.get("cat") ?? "all";
  const region = sp.get("region") ?? "all";
  const q = sp.get("q") ?? "";

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v && v !== "all" && v !== "") next.set(k, v); else next.delete(k);
    setSp(next, { replace: true });
  };

  const allCats = useMemo(() => Array.from(new Set(suppliers.flatMap(s => s.categories))).sort(), [suppliers]);
  const drafts = rfqDrafts();
  const draftsBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    drafts.forEach(d => { if (d.supplierId) map.set(d.supplierId, (map.get(d.supplierId) ?? 0) + 1); });
    return map;
  }, [drafts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return suppliers.filter(s => {
      if (cat !== "all" && !s.categories.includes(cat)) return false;
      if (region !== "all" && s.region !== region) return false;
      if (!term) return true;
      const hay = [s.name, s.region, s.categories.join(" "), s.interfaces.join(" "), s.notes ?? ""].join(" ").toLowerCase();
      return hay.includes(term);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [cat, region, q, suppliers]);

  const overview = useMemo(() => {
    const regions = new Set(suppliers.map(s => s.region));
    const cats = new Set(suppliers.flatMap(s => s.categories));
    return { suppliers: suppliers.length, regions: regions.size, cats: cats.size, activeDrafts: drafts.length };
  }, [drafts.length, suppliers]);

  const hasActive = cat !== "all" || region !== "all" || q !== "";
  const clearAll = () => setSp(new URLSearchParams(), { replace: true });

  return (
    <>
      <PageHeader kicker="Suppliers" title="Component supplier directory" sub="Reference data for sourcing decisions. Only verified, real supplier records are shown; no placeholder imagery, ratings, lead times, or pricing are rendered." />
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        {supplierQuery.isPending ? (
          <div className="surface-card p-8 text-center text-[13px]" role="status">Loading suppliers from the API…</div>
        ) : supplierQuery.isError ? (
          <div className="surface-card p-8 text-center" role="alert">
            <div className="text-[13px] font-medium text-negative">Supplier data could not be loaded.</div>
            <div className="text-[11.5px] text-muted-foreground mt-1">{supplierQuery.error.message}</div>
            <button onClick={() => void supplierQuery.refetch()} className="btn-primary btn-sm mt-2">Retry</button>
          </div>
        ) : suppliers.length === 0 ? (
          <ComingSoon
            icon={Factory}
            kicker="Coming soon"
            title="Supplier directory not yet available"
            body="No real, verified supplier records have been published yet. Demonstration fixtures with fabricated ratings, lead times, and imagery are intentionally withheld from this public view."
          />
        ) : (
          <>
            <div className="surface-card mb-3 grid grid-cols-2 sm:grid-cols-4 divide-x divide-border overflow-hidden text-[11px]">
              <Stat label="Suppliers" value={overview.suppliers} />
              <Stat label="Regions" value={overview.regions} />
              <Stat label="Categories" value={overview.cats} />
              <Stat label="Your local RFQ drafts" value={overview.activeDrafts} />
            </div>

            <div className="surface-card mb-3 flex flex-wrap items-center gap-2 px-3 py-2">
              <input className="input-bare w-56" placeholder="Search name, category, interface…" value={q} onChange={e => setParam("q", e.target.value || null)} />
              <select className="input-bare w-auto" value={cat} onChange={(e) => setParam("cat", e.target.value)}>
                <option value="all">All categories</option>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input-bare w-auto" value={region} onChange={(e) => setParam("region", e.target.value)}>
                <option value="all">All regions</option>
                {["US","EU","CN","JP","KR","Global"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
                <span><span className="mono text-foreground">{filtered.length}</span>/<span className="mono">{suppliers.length}</span></span>
                {hasActive && <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-primary">clear</button>}
              </div>
            </div>

            {filtered.length ? (
              <div className="surface-card overflow-x-auto">
                <table className="data-table">
                  <thead><tr>
                    <th>Supplier</th><th>Website</th><th>Region</th><th>Categories</th>
                    <th className="text-right">Actions</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(s => {
                      const draftCount = draftsBySupplier.get(s.id) ?? 0;
                      return (
                        <tr key={s.id}>
                          <td>
                            <Link to={`/suppliers/${s.slug}`} className="font-medium hover:text-primary">{s.name}</Link>
                            <div className="text-[11px] text-muted-foreground">
                              {s.notes ?? "No supplier notes available."}
                              {draftCount > 0 && <span className="ml-1 pill pill-yellow">{draftCount} local draft{draftCount === 1 ? "" : "s"}</span>}
                            </div>
                          </td>
                          <td>
                            <a href={s.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary mono">
                              {hostname(s.website)} <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                          <td>{s.region}</td>
                          <td className="text-[12px]">{s.categories.join(", ") || "—"}</td>
                          <td>
                            <div className="flex justify-end gap-1 whitespace-nowrap">
                              <a href={s.website} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" title="Open supplier's official website in a new tab"><ExternalLink className="h-3 w-3" /> Site</a>
                              <Link to={`/suppliers/${s.slug}`} className="btn-ghost btn-sm">Evaluate</Link>
                              <Link to={`/suppliers/${s.slug}#rfq`} className="btn-primary btn-sm">Draft RFQ</Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="surface-card p-8 text-center">
                <div className="text-[13px] font-medium">No suppliers match these filters.</div>
                <div className="text-[11.5px] text-muted-foreground mt-1">Try changing category, region, or clearing the search.</div>
                <button onClick={clearAll} className="btn-primary btn-sm mt-2">Clear filters</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
