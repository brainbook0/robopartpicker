import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useComponents, useSuppliers } from "@/lib/api/catalog";
import type { CatalogPart } from "@/shared/catalog";
import { ExpandableField } from "@/components/common/ExpandableField";
import { RelatedDiscussionList } from "@/components/community/RelatedDiscussionList";
import { ComingSoon } from "@/components/common/ComingSoon";
import { RfqComposer } from "@/components/parts/RfqComposer";
import { rfqDraftsForSupplier, deleteRfqDraft } from "@/lib/catalogWorkspace";
import { liveRecords } from "@/lib/catalogHonesty";
import { ExternalLink, FileText, Factory, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./,""); } catch { return url; } };

/** Cheapest authentic offer from this supplier for this part. */
function liveSupplierOffer(p: CatalogPart, supplierId: string) {
  const offers = p.offers.filter(o => !o.isDemo && o.supplierId === supplierId);
  if (offers.length === 0) return null;
  const priced = offers.filter((offer) => offer.price > 0);
  return priced.length
    ? priced.reduce((min, offer) => (offer.price < min.price ? offer : min), priced[0])
    : offers[0];
}

function formatCurrency(price: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <ExpandableField k={k} v={v} />;

export default function SupplierDetail() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const supplierQuery = useSuppliers();
  const s = supplierQuery.data?.items.find((supplier) => supplier.slug === slug);
  const componentsQuery = useComponents({ supplier: s && !s.isDemo ? [s.id] : [], limit: 100 }, Boolean(s && !s.isDemo));
  const [tick, setTick] = useState(0);
  const [prefillPartId, setPrefillPartId] = useState<string | null>(null);
  const [prefillQty, setPrefillQty] = useState<number>(1);
  const rfqRef = useRef<HTMLDivElement>(null);

  // Only real (non-demo) offered products are surfaced; demo fixtures carry
  // fabricated prices, stock, and lead times.
  const offered = useMemo(
    () => liveRecords(componentsQuery.data?.items ?? []).filter(p => Boolean(s && p.offers.some(o => !o.isDemo && o.supplierId === s.id))),
    [componentsQuery.data?.items, s],
  );

  useEffect(() => {
    if (!s || s.isDemo) return;
    const partId = sp.get("part");
    const qtyRaw = sp.get("qty");
    if (!partId && !qtyRaw) return;
    let changed = false;
    if (partId) {
      const p = offered.find((part) => part.id === partId);
      if (p) { setPrefillPartId(p.id); changed = true; }
      else toast({ title: "Part not offered by this supplier", description: "Enter it manually in the RFQ composer if needed.", variant: "destructive" });
    }
    if (qtyRaw) {
      const n = Number(qtyRaw);
      if (Number.isFinite(n) && n >= 1) { setPrefillQty(Math.floor(n)); changed = true; }
    }
    const next = new URLSearchParams(sp); next.delete("part"); next.delete("qty");
    setSp(next, { replace: true });
    if (changed) setTimeout(() => rfqRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get("part"), sp.get("qty"), s?.id]);

  if (supplierQuery.isPending) return <div className="p-8" role="status">Loading supplier from the API…</div>;
  if (supplierQuery.isError) {
    return <div className="p-8" role="alert"><div className="font-medium text-negative">Supplier data could not be loaded.</div><div className="text-[12px] text-muted-foreground mt-1">{supplierQuery.error.message}</div></div>;
  }
  if (!s) return <div className="p-8">Supplier not found.</div>;

  if (s.isDemo) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="text-[12px] text-muted-foreground mb-1"><Link to="/suppliers" className="hover:text-primary">Suppliers</Link> / {s.name}</div>
        <ComingSoon
          icon={Factory}
          kicker="Coming soon"
          title={`${s.name} profile not yet available`}
          body="This supplier record is a demonstration fixture and is withheld from the public directory. No verified profile, catalog, pricing, stock, or imagery is available for it yet."
          actionLabel="Back to supplier directory"
          actionTo="/suppliers"
        />
      </div>
    );
  }

  void tick;
  const supplierProductPartIds = offered.map(p => p.id);
  const drafts = rfqDraftsForSupplier(s.id);
  const scrollToRfq = () => rfqRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const prefillFrom = (partId: string) => { setPrefillPartId(partId); scrollToRfq(); };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-1"><Link to="/suppliers" className="hover:text-primary">Suppliers</Link> / {s.name}</div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{s.name}</h1>
          <div className="text-[13px] text-muted-foreground">{s.region} · {s.categories.join(", ")}</div>
          <a href={s.website} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[12px] text-primary hover:underline mono">
            {hostname(s.website)} <ExternalLink className="h-3 w-3" />
          </a>
          <div className="mt-2 flex gap-1 items-center flex-wrap">
            <span className="pill">{offered.length} catalogued product{offered.length === 1 ? "" : "s"}</span>
            {drafts.length > 0 && <span className="pill pill-yellow">{drafts.length} local RFQ draft{drafts.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <a href={s.website} target="_blank" rel="noopener noreferrer" className="btn-ghost"><ExternalLink className="h-3.5 w-3.5" /> Official site</a>
          <button onClick={scrollToRfq} className="btn-primary"><FileText className="h-3.5 w-3.5" /> Draft RFQ</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="surface-card overflow-x-auto">
            <div className="px-4 pt-3 flex items-center justify-between gap-2">
              <div className="section-title">Products in catalog ({offered.length})</div>
              <span className="text-[11px] text-muted-foreground">Prices are from verified, non-demo offers. Request a quote for anything not priced.</span>
            </div>
            <table className="data-table mt-2">
              <thead><tr><th>Part</th><th>Category</th><th>Supplier SKU</th><th className="text-right">Observed price</th><th>Source</th><th></th></tr></thead>
              <tbody>
                {offered.map(p => {
                  const offer = liveSupplierOffer(p, s.id);
                  return <tr key={p.id}>
                    <td><Link to={`/parts/${p.category}/${p.slug}`} className="hover:text-primary">{p.name}</Link></td>
                    <td>{p.category}</td>
                    <td className="mono text-[11px]">{offer?.supplierSku || <span className="text-muted-foreground">Unknown</span>}</td>
                    <td className="mono text-right">{offer && offer.price > 0 ? formatCurrency(offer.price, offer.currency ?? "USD") : <span className="text-muted-foreground">Quote on request</span>}</td>
                    <td>{offer?.productUrl ? <a href={offer.productUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Product page</a> : <span className="text-muted-foreground">Unavailable</span>}</td>
                    <td><button onClick={() => prefillFrom(p.id)} className="btn-ghost btn-sm" title="Prefill the RFQ composer with this part">Draft RFQ</button></td>
                  </tr>;
                })}
                {!offered.length && <tr><td colSpan={6} className="p-3 text-[12px] text-muted-foreground text-center">No catalogued products with authentic offers are available for this supplier yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div id="rfq" ref={rfqRef} className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Draft RFQ for {s.name}</div>
              <span className="text-[10.5px] font-medium uppercase tracking-wide text-foreground">Local only · not sent</span>
            </div>
            <RfqComposer
              key={`${s.id}:${prefillPartId ?? "none"}:${prefillQty}`}
              lockSupplierId={s.id}
              supplierProductPartIds={supplierProductPartIds}
              prefill={{ partId: prefillPartId, quantity: prefillQty }}
              onSaved={() => setTick(t => t + 1)}
              onDeleted={() => setTick(t => t + 1)}
            />
          </div>

          {drafts.length > 0 && (
            <div className="surface-card p-4">
              <div className="section-title mb-2">Existing local RFQ drafts ({drafts.length})</div>
              <ul className="space-y-1 text-[12.5px]">
                {drafts.map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1">
                    <div>
                      <span className="font-medium">{d.manualPartName || d.partId || "(unnamed part)"}</span>
                      <span className="text-muted-foreground ml-2 mono">qty {d.quantity}{d.targetLeadDays != null ? ` · ≤${d.targetLeadDays}d` : ""}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-foreground mono">updated {new Date(d.updatedAt).toLocaleDateString()}</span>
                      <button onClick={() => { deleteRfqDraft(d.id); setTick(t => t + 1); toast({ title: "Local RFQ draft removed" }); }} className="btn-ghost btn-sm text-negative" aria-label="Delete local draft"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <RelatedDiscussionList relatedType="supplier" relatedId={s.id} title="Community discussions about this supplier" />
        </section>

        <aside className="space-y-4">
          <div className="surface-card p-4">
            <div className="section-title mb-2">Profile</div>
            <Row k="Website" v={<a href={s.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{hostname(s.website)} <ExternalLink className="h-3 w-3" /></a>} />
            <Row k="Region" v={s.region} />
            <Row k="Categories" v={s.categories.join(", ") || "—"} />
            {s.interfaces.length > 0 && <Row k="Interfaces" v={s.interfaces.join(", ")} />}
            <Row k="Products in catalog" v={offered.length} />
          </div>
          {s.notes && <div className="surface-card p-4 text-[12px] text-muted-foreground">{s.notes}</div>}
        </aside>
      </div>
    </div>
  );
}
