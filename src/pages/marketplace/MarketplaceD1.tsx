import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Star, Wrench, Plus, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketplace } from "@/lib/api/marketplace";
import type { MarketplaceListing } from "@/shared/marketplace";

const TYPES: Array<{ value: MarketplaceListing["listingType"]; label: string }> = [
  { value: "sell", label: "For sale" }, { value: "wanted", label: "Wanted" }, { value: "service", label: "Services" },
];

export default function MarketplaceD1() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const type = (params.get("type") as MarketplaceListing["listingType"] | null) ?? "sell";
  const q = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const region = params.get("region") ?? "";
  const condition = (params.get("condition") as NonNullable<MarketplaceListing["conditionGrade"]> | null) ?? undefined;
  const sort = (params.get("sort") as "newest" | "price_asc" | "price_desc" | "parts_cost_asc" | null) ?? "newest";
  const minPrice = params.get("minPrice") ?? "";
  const maxPrice = params.get("maxPrice") ?? "";
  const query = useMarketplace({ type, q, category, region, condition, sort, minPrice: minPrice ? Number(minPrice) : null, maxPrice: maxPrice ? Number(maxPrice) : null });
  const drafts = useMarketplace({ mine: true, status: "draft" });
  const categories = useMemo(() => [...new Set((query.data?.items ?? []).map((item) => item.category))].sort(), [query.data?.items]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  return <>
    <PageHeader kicker="Marketplace" title="Robots, parts, kits, fabrication, and services"
      sub="Persistent technical listings and wanted requests. RoboPartPicker provides internal messaging and evidence fields; no payment, escrow, shipping, or inspection provider is configured."
      actions={<div className="flex gap-2"><Link to="/marketplace/new" className="btn-primary"><Plus className="h-3.5 w-3.5" /> New listing</Link><Link to="/marketplace/wanted/new" className="btn-ghost">Post wanted</Link></div>} />
    <main className="mx-auto max-w-[1400px] px-4 py-5">
      <div className="surface-card mb-3 border-warning/30 bg-warning/5 px-3 py-2 text-[11.5px] text-muted-foreground flex gap-2" role="note">
        <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
        <span>Commercial terms are user-provided. “Offers” are negotiation records only; the application does not process money or guarantee a transaction.</span>
      </div>

      {user && (drafts.data?.items.length ?? 0) > 0 && <section className="surface-card mb-3 p-3">
        <div className="section-title mb-2">Your server-backed drafts</div>
        <div className="flex flex-wrap gap-2">{drafts.data!.items.map((draft) => <Link key={draft.id} to={`/marketplace/new?draft=${draft.id}`} className="pill pill-yellow">{draft.title}</Link>)}</div>
      </section>}

      <div className="surface-card mb-3 flex flex-wrap gap-2 p-2 items-center">
        <div className="flex gap-1">{TYPES.map((entry) => <button key={entry.value} className={`pill ${type === entry.value ? "pill-yellow" : ""}`} onClick={() => setParam("type", entry.value === "sell" ? null : entry.value)}>{entry.label}</button>)}</div>
        <label className="flex items-center gap-1.5 rounded border border-input bg-background px-2 flex-1 min-w-[220px]"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input className="h-7 flex-1 bg-transparent text-[12px] outline-none" value={q} onChange={(event) => setParam("q", event.target.value || null)} placeholder="Search persisted listings…" /></label>
        <select className="input-bare w-auto" value={category} onChange={(event) => setParam("category", event.target.value || null)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
        <select className="input-bare w-auto" value={region} onChange={(event) => setParam("region", event.target.value || null)}><option value="">All regions</option>{["US", "EU", "CN", "JP", "KR", "Global"].map((value) => <option key={value}>{value}</option>)}</select>
        <select className="input-bare w-auto" value={condition ?? ""} onChange={(event) => setParam("condition", event.target.value || null)}><option value="">All conditions</option><option value="A">A · like new</option><option value="B">B · functional</option><option value="C">C · worn</option><option value="untested">Untested</option><option value="for_parts">For parts</option><option value="not_applicable">Not applicable</option></select>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">USD <input type="number" min="0" step="1" value={minPrice} onChange={(event) => setParam("minPrice", event.target.value || null)} className="input-bare w-20" placeholder="min" aria-label="Minimum price" />–<input type="number" min="0" step="1" value={maxPrice} onChange={(event) => setParam("maxPrice", event.target.value || null)} className="input-bare w-20" placeholder="max" aria-label="Maximum price" /></label>
        <select className="input-bare w-auto" value={sort} onChange={(event) => setParam("sort", event.target.value === "newest" ? null : event.target.value)} aria-label="Sort listings"><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="parts_cost_asc">Known parts cost</option></select>
        {(q || category || region || condition || minPrice || maxPrice || sort !== "newest") && <button type="button" className="btn-ghost btn-sm" onClick={() => setParams(type === "sell" ? {} : { type })}>Clear filters</button>}
      </div>

      {query.isPending ? <State>Loading Marketplace records from D1…</State> : query.isError ? <State error>{query.error.message}</State> : query.data!.items.length === 0 ? <State>No published records match these filters.</State> :
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{query.data!.items.map((item) => <ListingCard key={item.id} item={item} />)}</div>}
    </main>
  </>;
}

function ListingCard({ item }: { item: MarketplaceListing }) {
  const seller = item.seller?.displayName || item.seller?.username || (item.isDemo ? "demo fixture" : "seller unavailable");
  return <Link to={`/marketplace/${item.slug}`} className="surface-card p-3 hover:border-primary/50 transition-colors flex flex-col gap-2">
    {item.images[0] && <img src={item.images[0].contentUrl} alt={item.images[0].altText ?? `${item.title} cover`} className="aspect-[16/9] w-full rounded border border-border bg-muted object-cover" loading="lazy" />}
    <div className="flex items-start justify-between gap-2"><div><div className="section-title">{item.listingType}</div><h2 className="font-semibold text-[14px] leading-tight mt-1">{item.title}</h2></div><span className="pill">{item.conditionGrade ?? "n/a"}</span></div>
    <p className="text-[12px] text-muted-foreground line-clamp-3">{item.description}</p>
    <div className="flex flex-wrap gap-1">{item.component && <span className="pill">{item.component.name}</span>}<span className="pill">{item.category}</span>{item.isDemo && <span className="pill pill-yellow">demo</span>}</div>
    <div className="mt-auto border-t border-border/60 pt-2 flex items-end justify-between text-[11px]"><div className="text-muted-foreground">{seller} · {item.region ?? "region n/a"}<br />qty <span className="mono">{item.quantity}</span>{item.partsCost != null && <><br />parts <span className="mono">{item.partsCostCurrency ?? "USD"} {item.partsCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>}</div><div className="text-right"><div className="text-[9px] uppercase text-muted-foreground">asking</div><div className="mono font-semibold text-[15px]">{item.price == null ? "Quote" : `${item.currency ?? "USD"} ${item.price.toLocaleString()}`}</div></div></div>
    <div className="flex gap-2 text-[10.5px] text-muted-foreground">{item.details.sellerDeclaresTestReport && <span className="inline-flex gap-1"><Wrench className="h-3 w-3" />seller says test available</span>}{item.saved && <span className="inline-flex gap-1"><Star className="h-3 w-3" />saved</span>}</div>
  </Link>;
}

function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className={`surface-card p-8 text-center text-[13px] ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>;
}
