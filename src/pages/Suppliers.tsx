import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSuppliers } from "@/lib/api/catalog";
import { rfqDrafts } from "@/lib/catalogWorkspace";
import { PageHeader } from "@/components/common/PageHeader";
import { ExpandableImage } from "@/components/common/ExpandableImage";
import { CatalogDataNotice, FIXTURE_TOOLTIP } from "@/components/parts/CatalogDataNotice";
import { gallery } from "@/lib/media";
import { ExternalLink } from "lucide-react";

const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./,""); } catch { return url; } };

type SortKey = "name" | "lead-asc" | "doc-desc" | "reviews-desc";
const ALL_SORTS: SortKey[] = ["name", "lead-asc", "doc-desc", "reviews-desc"];

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="p-2">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mono text-[13px] text-foreground">{value}</div>
  </div>
);

export default function Suppliers() {
  const supplierQuery = useSuppliers();
  const suppliers = supplierQuery.data?.items ?? [];
  const [sp, setSp] = useSearchParams();
  const cat = sp.get("cat") ?? "all";
  const region = sp.get("region") ?? "all";
  const verifiedOnly = sp.get("verified") === "true";
  const q = sp.get("q") ?? "";
  const sortRaw = (sp.get("sort") ?? "name") as SortKey;
  const sort: SortKey = ALL_SORTS.includes(sortRaw) ? sortRaw : "name";

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
    const list = suppliers.filter(s => {
      if (cat !== "all" && !s.categories.includes(cat)) return false;
      if (region !== "all" && s.region !== region) return false;
      if (verifiedOnly && !s.verified) return false;
      if (!term) return true;
      const hay = [s.name, s.region, s.categories.join(" "), s.interfaces.join(" "), s.notes ?? ""].join(" ").toLowerCase();
      return hay.includes(term);
    });
    if (sort === "name") list.sort((a,b) => a.name.localeCompare(b.name));
    if (sort === "lead-asc") list.sort((a,b) => a.leadDays - b.leadDays);
    if (sort === "doc-desc") list.sort((a,b) => b.docScore - a.docScore);
    if (sort === "reviews-desc") list.sort((a,b) => b.reviews.rating - a.reviews.rating);
    return list;
  }, [cat, region, verifiedOnly, q, sort, suppliers]);

  const overview = useMemo(() => {
    const regions = new Set(suppliers.map(s => s.region));
    const cats = new Set(suppliers.flatMap(s => s.categories));
    const avgLead = suppliers.length ? Math.round(suppliers.reduce((n, s) => n + s.leadDays, 0) / suppliers.length) : 0;
    const avgDoc = suppliers.length ? Math.round(suppliers.reduce((n, s) => n + s.docScore, 0) / suppliers.length) : 0;
    const totalOffers = suppliers.reduce((n, supplier) => n + supplier.knownOfferCount, 0);
    return { suppliers: suppliers.length, regions: regions.size, cats: cats.size, avgLead, avgDoc, totalOffers, activeDrafts: drafts.length };
  }, [drafts.length, suppliers]);

  const hasActive = cat !== "all" || region !== "all" || verifiedOnly || q !== "" || sort !== "name";
  const clearAll = () => setSp(new URLSearchParams(), { replace: true });

  return (
    <>
      <PageHeader kicker="Suppliers" title="Component supplier directory" sub="Reference data for sourcing decisions. All supplier entries, ratings, verification flags, and reviews shown are static fixtures." />
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <CatalogDataNotice className="mb-3" />

        <div className="surface-card mb-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 divide-x divide-border overflow-hidden text-[11px]">
          <Stat label="Suppliers" value={overview.suppliers} />
          <Stat label="Regions" value={overview.regions} />
          <Stat label="Categories" value={overview.cats} />
          <Stat label="Fixture offers" value={overview.totalOffers} />
          <Stat label="Avg lead (fixture)" value={`${overview.avgLead}d`} />
          <Stat label="Avg doc score (fixture)" value={`${overview.avgDoc}/100`} />
          <Stat label="Your local RFQ drafts" value={overview.activeDrafts} />
        </div>

        <div className="surface-card mb-3 flex flex-wrap items-center gap-2 px-3 py-2">
          <input className="input-bare w-56" placeholder="Search name, category, interface, notes…" value={q} onChange={e => setParam("q", e.target.value || null)} />
          <select className="input-bare w-auto" value={cat} onChange={(e) => setParam("cat", e.target.value)}>
            <option value="all">All categories</option>
            {allCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input-bare w-auto" value={region} onChange={(e) => setParam("region", e.target.value)}>
            <option value="all">All regions</option>
            {["US","EU","CN","JP","KR","Global"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[12px]" title="Static demonstration verification flag — not a live audit result.">
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setParam("verified", e.target.checked ? "true" : null)} /> demo-verified only
          </label>
          <label className="text-[12px]">Sort
            <select className="ml-1 input-bare inline-block w-auto" value={sort} onChange={e => setParam("sort", e.target.value === "name" ? null : e.target.value)}>
              <option value="name">name A–Z</option>
              <option value="lead-asc">lead ↑</option>
              <option value="doc-desc">doc score ↓</option>
              <option value="reviews-desc">fixture rating ↓</option>
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
            <span><span className="mono text-foreground">{filtered.length}</span>/<span className="mono">{suppliers.length}</span></span>
            {hasActive && <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-primary">clear</button>}
          </div>
        </div>

        {supplierQuery.isPending ? (
          <div className="surface-card p-8 text-center text-[13px]" role="status">Loading suppliers from the API…</div>
        ) : supplierQuery.isError ? (
          <div className="surface-card p-8 text-center" role="alert">
            <div className="text-[13px] font-medium text-negative">Supplier data could not be loaded.</div>
            <div className="text-[11.5px] text-muted-foreground mt-1">{supplierQuery.error.message}</div>
            <button onClick={() => void supplierQuery.refetch()} className="btn-primary btn-sm mt-2">Retry</button>
          </div>
        ) : filtered.length ? (
          <div className="surface-card overflow-x-auto">
            <table className="data-table">
              <thead><tr>
                <th></th><th>Supplier</th><th>Website</th><th>Region</th><th>Categories</th>
                <th title={FIXTURE_TOOLTIP}>MOQ</th>
                <th title={FIXTURE_TOOLTIP}>Lead (fixture)</th>
                <th title={FIXTURE_TOOLTIP}>Doc</th>
                <th>Warranty policy</th>
                <th title="Static fixture reviews — not aggregated from live sources.">Reviews (fixture)</th>
                <th title="Your locally-drafted RFQs targeting this supplier.">Drafts</th>
                <th className="text-right">Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(s => {
                  const g = gallery("supplier", s.id, 3);
                  const productCount = s.knownComponentCount;
                  const draftCount = draftsBySupplier.get(s.id) ?? 0;
                  return (
                    <tr key={s.id}>
                      <td><ExpandableImage src={g.hero} alt={s.name} thumbs={g.thumbs} caption={s.name} className="h-10 w-14" /></td>
                      <td>
                        <Link to={`/suppliers/${s.slug}`} className="font-medium hover:text-primary">{s.name}</Link>
                        {s.verified && <span className="ml-1 pill pill-good" title="Demo verification flag only.">verified (demo)</span>}
                        {s.claimed && <span className="ml-1 pill">claimed</span>}
                        <div className="text-[11px] text-muted-foreground mono">{productCount} product{productCount === 1 ? "" : "s"} in catalog</div>
                      </td>
                      <td>
                        <a href={s.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary mono">
                          {hostname(s.website)} <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td>{s.region}</td>
                      <td className="text-[12px]">{s.categories.join(", ")}</td>
                      <td className="mono">{s.moq}</td>
                      <td className="mono">{s.leadDays}d</td>
                      <td className="mono">{s.docScore}</td>
                      <td className="text-[12px]">{s.warranty}</td>
                      <td className="mono">★ {s.reviews.rating} <span className="text-muted-foreground">({s.reviews.count})</span></td>
                      <td className="mono">{draftCount || <span className="text-muted-foreground">—</span>}</td>
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
      </div>
    </>
  );
}
