import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useComponents, useSuppliers } from "@/lib/api/catalog";
import { ExpandableImage } from "@/components/common/ExpandableImage";
import { ExpandableField } from "@/components/common/ExpandableField";
import { RelatedDiscussionList } from "@/components/community/RelatedDiscussionList";
import { CatalogDataNotice, FIXTURE_TOOLTIP } from "@/components/parts/CatalogDataNotice";
import { RfqComposer } from "@/components/parts/RfqComposer";
import { rfqDraftsForSupplier, deleteRfqDraft } from "@/lib/catalogWorkspace";
import { gallery, thumb } from "@/lib/media";
import { ExternalLink, FileText, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./,""); } catch { return url; } };

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <ExpandableField k={k} v={v} />;

export default function SupplierDetail() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const supplierQuery = useSuppliers();
  const s = supplierQuery.data?.items.find((supplier) => supplier.slug === slug);
  const componentsQuery = useComponents({ supplier: s ? [s.id] : [], limit: 100 }, Boolean(s));
  const [tick, setTick] = useState(0);
  const [prefillPartId, setPrefillPartId] = useState<string | null>(null);
  const [prefillQty, setPrefillQty] = useState<number>(1);
  const rfqRef = useRef<HTMLDivElement>(null);

  const offered = useMemo(() => componentsQuery.data?.items ?? [], [componentsQuery.data?.items]);

  useEffect(() => {
    if (!s) return;
    const partId = sp.get("part");
    const qtyRaw = sp.get("qty");
    if (!partId && !qtyRaw) return;
    let changed = false;
    if (partId) {
      const p = offered.find((part) => part.id === partId);
      if (p && offered.some(x => x.id === p.id)) { setPrefillPartId(p.id); changed = true; }
      else if (p) toast({ title: "Part not offered by this supplier", description: `${p.name} isn't in ${s.name}'s fixture catalog. Enter it manually if needed.`, variant: "destructive" });
      else toast({ title: "Unknown part id", description: `"${partId}" was not found.`, variant: "destructive" });
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

  if (supplierQuery.isPending || (s && componentsQuery.isPending)) return <div className="p-8" role="status">Loading supplier from the API…</div>;
  if (supplierQuery.isError || componentsQuery.isError) {
    const error = supplierQuery.error ?? componentsQuery.error;
    return <div className="p-8" role="alert"><div className="font-medium text-negative">Supplier data could not be loaded.</div><div className="text-[12px] text-muted-foreground mt-1">{error?.message}</div></div>;
  }
  if (!s) return <div className="p-8">Supplier not found.</div>;

  void tick;
  const supplierProductPartIds = offered.map(p => p.id);
  const drafts = rfqDraftsForSupplier(s.id);
  const scrollToRfq = () => rfqRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const prefillFrom = (partId: string) => { setPrefillPartId(partId); scrollToRfq(); };
  const g = gallery("supplier", s.id, 4);

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
            {s.verified && <span className="pill pill-good" title="Demo verification flag only.">verified (demo)</span>}
            {s.claimed && <span className="pill">claimed</span>}
            <span className="pill" title={FIXTURE_TOOLTIP}>{offered.length} products in fixture catalog</span>
            {drafts.length > 0 && <span className="pill pill-yellow">{drafts.length} local RFQ draft{drafts.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <a href={s.website} target="_blank" rel="noopener noreferrer" className="btn-ghost"><ExternalLink className="h-3.5 w-3.5" /> Official site</a>
          <button onClick={scrollToRfq} className="btn-primary"><FileText className="h-3.5 w-3.5" /> Draft RFQ</button>
        </div>
      </div>

      <CatalogDataNotice className="mt-3" />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="surface-card p-3">
            <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
              <ExpandableImage src={g.hero} alt={`${s.name} facility`} thumbs={g.thumbs} caption={`${s.name} — ${s.region}`} className="aspect-[3/2]" />
              <div className="grid grid-cols-2 gap-2">
                {g.thumbs.slice(0, 4).map((t, i) => (
                  <ExpandableImage key={i} src={t} alt={`${s.name} ${i + 1}`} thumbs={[g.hero, ...g.thumbs.filter((_, j) => j !== i)]} className="aspect-[3/2]" />
                ))}
              </div>
            </div>
          </div>

          <div className="surface-card overflow-x-auto">
            <div className="px-4 pt-3 flex items-center justify-between gap-2">
              <div className="section-title">Products in fixture catalog ({offered.length})</div>
              <span className="text-[11px] text-muted-foreground" title={FIXTURE_TOOLTIP}>Prices, stock, and lead times are demo fixtures.</span>
            </div>
            <table className="data-table mt-2">
              <thead><tr><th></th><th>Part</th><th>Category</th><th>Price</th><th>Stock</th><th>Lead</th><th>MOQ</th><th></th></tr></thead>
              <tbody>
                {offered.map(p => {
                  const o = p.offers.find(x => x.supplierId === s.id)!;
                  return <tr key={p.id}>
                    <td><img src={thumb("part-" + p.category, p.id, 64, 48)} alt="" className="h-8 w-12 rounded object-cover border border-border" loading="lazy" /></td>
                    <td><Link to={`/parts/${p.category}/${p.slug}`} className="hover:text-primary">{p.name}</Link></td>
                    <td>{p.category}</td>
                    <td className="mono">${o.price.toLocaleString()}</td>
                    <td className="mono">{o.stock}</td>
                    <td className="mono">{o.leadDays}d</td>
                    <td className="mono">{o.moq}</td>
                    <td><button onClick={() => prefillFrom(p.id)} className="btn-ghost btn-sm" title="Prefill the RFQ composer with this part">Draft RFQ</button></td>
                  </tr>;
                })}
                {!offered.length && <tr><td colSpan={8} className="p-3 text-[12px] text-muted-foreground text-center">No products from this supplier appear in the fixture catalog.</td></tr>}
              </tbody>
            </table>
          </div>

          <div id="rfq" ref={rfqRef} className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="section-title">Draft RFQ for {s.name}</div>
              <span className="text-[10.5px] uppercase tracking-wide text-warning">Local only · not sent</span>
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
            <div className="section-title mb-2">Profile (fixture)</div>
            <Row k="Website" v={<a href={s.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">{hostname(s.website)} <ExternalLink className="h-3 w-3" /></a>} />
            <Row k="Region" v={s.region} />
            <Row k="MOQ" v={s.moq} />
            <Row k="Avg lead" v={`${s.leadDays}d`} />
            <Row k="Warranty policy" v={s.warranty} />
            <Row k="Doc score" v={`${s.docScore}/100`} />
            <Row k="Interfaces" v={s.interfaces.join(", ") || "—"} />
            <Row k="Reviews (fixture)" v={`★ ${s.reviews.rating} (${s.reviews.count})`} />
            <Row k="Products in catalog" v={offered.length} />
          </div>
          {s.notes && <div className="surface-card p-4 text-[12px] text-warning">⚠ {s.notes}</div>}
          <CatalogDataNotice variant="inline" />
        </aside>
      </div>
    </div>
  );
}
