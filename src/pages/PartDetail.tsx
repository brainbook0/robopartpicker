import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { lowestPrice, priceDelta30, type Part, type Actuator, type Hand, type Sensor, type Compute, type Driver, type Reducer } from "@/shared/catalog";
import { useComponent, useComponents, useSuppliers } from "@/lib/api/catalog";
import { PriceChart } from "@/components/robots/PriceChart";
import { PriceDeltaPill } from "@/components/common/PriceDeltaPill";
import { ExpandableImage } from "@/components/common/ExpandableImage";
import { ExpandableField } from "@/components/common/ExpandableField";
import { RelatedDiscussionList } from "@/components/community/RelatedDiscussionList";
import { CatalogDataNotice, FIXTURE_TOOLTIP } from "@/components/parts/CatalogDataNotice";
import { RfqComposer } from "@/components/parts/RfqComposer";
import { isPartSaved, toggleSavedPart, toggleCompare, readCompare, priceAlertForPart, upsertPriceAlert, removePriceAlert } from "@/lib/catalogWorkspace";
import { gallery } from "@/lib/media";
import { Plus, ChevronDown, ExternalLink, Star, StarOff, GitCompareArrows, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const hostname = (url: string) => { try { return new URL(url).hostname.replace(/^www\./,""); } catch { return url; } };

const median = (nums: number[]): number | null => {
  if (!nums.length) return null;
  const s = [...nums].sort((a,b) => a-b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m-1] + s[m]) / 2);
};

function Panel({ title, count, defaultOpen = true, right, id, children }: { title: string; count?: number | string; defaultOpen?: boolean; right?: React.ReactNode; id?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="surface-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 px-3 py-2 border-b border-border/60 hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
          <span className="section-title">{title}</span>
          {count !== undefined && <span className="pill mono text-[10px]">{count}</span>}
        </div>
        {right}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

const Row = ({ k, v, source }: { k: string; v: React.ReactNode; source?: string }) => (
  <ExpandableField k={k} v={v} source={source} />
);

function Specs({ p }: { p: Part }) {
  if (p.category === "actuator") {
    const a = p as Actuator;
    return <div>
      <Row k="Peak torque" v={`${a.peakNm} Nm`} />
      <Row k="Continuous torque" v={`${a.contNm} Nm`} />
      <Row k="Max speed" v={`${a.speedRpm} RPM`} />
      <Row k="Voltage" v={`${a.voltageV} V`} />
      <Row k="Weight" v={`${a.weightKg} kg`} />
      <Row k="Torque density" v={`${a.torqueDensity.toFixed(1)} Nm/kg`} />
      <Row k="Backlash" v={`${a.backlashArcmin} arcmin`} />
      <Row k="Encoder" v={a.encoderType} />
      <Row k="Protocol" v={a.protocol} />
      <Row k="Thermal limit" v={`${a.thermalLimitC} °C`} />
      <Row k="Duty cycle" v={`${a.dutyCyclePct}%`} />
      <Row k="ROS support" v={a.rosSupport} />
      <Row k="CAD" v={a.cadAvailable ? "available" : "—"} />
      <Row k="Warranty" v={`${a.warrantyMonths} mo`} />
    </div>;
  }
  if (p.category === "hand") {
    const h = p as Hand;
    return <div>
      <Row k="Total DoF" v={h.dof} />
      <Row k="Actuated DoF" v={h.actuatedDof} />
      <Row k="Payload" v={`${h.payloadKg} kg`} />
      <Row k="Grip force" v={`${h.gripForceN} N`} />
      <Row k="Tactile" v={h.tactile ? "yes" : "no"} />
      <Row k="Weight" v={`${h.weightKg} kg`} />
      <Row k="Interface" v={h.interface} />
      <Row k="SDK" v={h.sdk} />
      <Row k="Finger replacement" v={`$${h.fingerReplaceCostUsd}`} />
      <Row k="Warranty" v={`${h.warrantyMonths} mo`} />
    </div>;
  }
  if (p.category === "sensor") {
    const s = p as Sensor;
    return <div>
      <Row k="Type" v={s.type} />
      <Row k="Range" v={`${s.rangeM} m`} />
      <Row k="Field of view" v={`${s.fovDeg}°`} />
      <Row k="Frame rate" v={`${s.hz} Hz`} />
      <Row k="Resolution" v={s.resolution} />
      <Row k="Weight" v={`${s.weightKg} kg`} />
      <Row k="Interface" v={s.interface} />
      <Row k="ROS" v={s.rosSupport} />
    </div>;
  }
  if (p.category === "compute") {
    const c = p as Compute;
    return <div>
      <Row k="AI TOPS" v={c.tops} />
      <Row k="RAM" v={`${c.ramGb} GB`} />
      <Row k="Storage" v={`${c.storageGb} GB`} />
      <Row k="Ports" v={c.ports} />
      <Row k="Power" v={`${c.powerW} W`} />
      <Row k="Weight" v={`${c.weightKg} kg`} />
    </div>;
  }
  if (p.category === "driver") {
    const d = p as Driver;
    return <div>
      <Row k="Max current" v={`${d.maxCurrentA} A`} />
      <Row k="Voltage" v={`${d.voltageV} V`} />
      <Row k="Protocols" v={d.protocols.join(", ")} />
      <Row k="Weight" v={`${d.weightKg} kg`} />
    </div>;
  }
  const r = p as Reducer;
  return <div>
    <Row k="Type" v={r.type} />
    <Row k="Ratio" v={`${r.ratio}:1`} />
    <Row k="Rated torque" v={`${r.ratedTorqueNm} Nm`} />
    <Row k="Peak torque" v={`${r.peakTorqueNm} Nm`} />
    <Row k="Backlash" v={`${r.backlashArcmin} arcmin`} />
    <Row k="Weight" v={`${r.weightKg} kg`} />
  </div>;
}

export default function PartDetail() {
  const { category, slug } = useParams();
  const componentQuery = useComponent(slug);
  const alternativesQuery = useComponents({ category: category as Part["category"], limit: 100 });
  const suppliersQuery = useSuppliers();
  const p = componentQuery.data?.item as Part | undefined;
  const suppliers = suppliersQuery.data?.items ?? [];
  const [tick, setTick] = useState(0);
  const [alertPrice, setAlertPrice] = useState("");

  useEffect(() => {
    if (!p) return;
    const a = priceAlertForPart(p.id);
    setAlertPrice(a?.targetPrice != null ? String(a.targetPrice) : "");
  }, [p?.id]);

  if (componentQuery.isPending || alternativesQuery.isPending || suppliersQuery.isPending) {
    return <div className="p-8 text-[13px]" role="status">Loading component from the API…</div>;
  }
  if (componentQuery.isError || alternativesQuery.isError || suppliersQuery.isError) {
    const error = componentQuery.error ?? alternativesQuery.error ?? suppliersQuery.error;
    return <div className="p-8" role="alert"><div className="font-medium text-negative">Component data could not be loaded.</div><div className="text-muted-foreground text-[12px] mt-1">{error?.message}</div></div>;
  }
  if (!p || p.category !== category) return <div className="p-8">Part not found.</div>;
  void tick; // force re-read of local workspace values below on tick changes

  const compare = readCompare();
  const inCompare = compare.ids.includes(p.id);
  const saved = isPartSaved(p.id);
  const existingAlert = priceAlertForPart(p.id);

  const low = lowestPrice(p);
  const delta = priceDelta30(p);
  const hist = p.priceHistory.map(h => h.price);
  const hLow = hist.length ? Math.min(...hist) : low;
  const goodPrice = hLow > 0 && low <= hLow * 1.05;
  const medPrice = median(p.offers.map(o => o.price));
  const minLead = p.offers.length ? p.offers.reduce((m, o) => Math.min(m, o.leadDays), Infinity) : null;
  const totalStock = p.offers.reduce((n, o) => n + o.stock, 0);
  const inStockOffers = p.offers.filter(o => o.stock > 0).length;
  const alts = (alternativesQuery.data?.items ?? []).filter(a => a.id !== p.id).slice(0, 5) as Part[];
  const g = gallery("part-" + p.category, p.id, 5);

  const doSave = () => {
    const nowSaved = toggleSavedPart(p.id);
    setTick(t => t + 1);
    toast({ title: nowSaved ? "Component saved" : "Component unsaved", description: "Stored in this browser only." });
  };
  const doCompare = () => {
    let r = toggleCompare(p.id, p.category);
    if (r.kind === "category-mismatch") {
      r = toggleCompare(p.id, p.category, { allowReplace: true });
      toast({ title: "Compare set reset", description: `Now comparing ${p.category}s only.` });
    } else if (r.kind === "limit-reached") {
      toast({ title: "Compare limit reached", description: "Comparison holds up to 4 components. Remove one first.", variant: "destructive" });
      return;
    } else if (r.kind === "invalid-part") {
      return;
    } else {
      toast({ title: r.kind === "added" ? "Added to compare" : "Removed from compare" });
    }
    setTick(t => t + 1);
  };
  const savePriceAlert = () => {
    const n = alertPrice === "" ? null : Number(alertPrice);
    if (n != null && (!Number.isFinite(n) || n <= 0)) { toast({ title: "Enter a valid target price (> 0)", variant: "destructive" }); return; }
    upsertPriceAlert(p.id, n);
    setTick(t => t + 1);
    toast({ title: "Local price alert draft saved", description: "Stored in this browser only. This preview does not actively monitor supplier prices." });
  };
  const clearAlert = () => { removePriceAlert(p.id); setAlertPrice(""); setTick(t => t + 1); toast({ title: "Local price alert removed" }); };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-2">
        <Link to={`/parts/${p.category}`} className="hover:text-primary">{p.category}</Link> / <span className="text-foreground">{p.name}</span>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{p.name}</h1>
          <div className="mt-1 text-[13px] text-muted-foreground">{p.maker} · {p.makerCountry} · region {p.region}</div>
          <p className="mt-2 max-w-2xl text-[14px]">{p.blurb}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {p.tags.map(t => <span key={t} className="pill">{t}</span>)}
            {p.openSource && <span className="pill pill-good">open source</span>}
            {goodPrice && <span className="pill pill-good" title="Current fixture lowest offer is within 5% of the fixture 12-month low.">good price (fixture)</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/builder?add=${p.id}`} className="btn-primary"><Plus className="h-3.5 w-3.5" /> Add to BOM</Link>
          <button onClick={doSave} className="btn-ghost inline-flex items-center gap-1" aria-pressed={saved}>
            {saved ? <Star className="h-3.5 w-3.5 text-primary fill-primary" /> : <StarOff className="h-3.5 w-3.5" />} {saved ? "Saved" : "Save"}
          </button>
          <button onClick={doCompare} className={`btn-ghost inline-flex items-center gap-1 ${inCompare ? "text-primary" : ""}`} aria-pressed={inCompare}>
            {inCompare ? <Check className="h-3.5 w-3.5" /> : <GitCompareArrows className="h-3.5 w-3.5" />} {inCompare ? "In compare" : "Compare"}
          </button>
        </div>
      </div>

      <CatalogDataNotice className="mt-4" />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <Panel title="Photos" count={1 + g.thumbs.length}>
            <div className="grid gap-2 md:grid-cols-[2fr_1fr] p-3">
              <ExpandableImage src={g.hero} alt={`${p.name} hero photo`} thumbs={g.thumbs} caption={`${p.name} — ${p.maker}`} className="aspect-[3/2]" />
              <div className="grid grid-cols-2 gap-2">
                {g.thumbs.slice(0, 4).map((t, i) => (
                  <ExpandableImage key={i} src={t} alt={`${p.name} photo ${i + 1}`} thumbs={[g.hero, ...g.thumbs.filter((_, j) => j !== i)]} className="aspect-[3/2]" />
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Fixture price history" right={
            <div className="flex items-center gap-3 text-[12px]">
              <div title={FIXTURE_TOOLTIP}>Low <span className="mono font-semibold">${low.toLocaleString()}</span></div>
              <PriceDeltaPill pct={delta} />
              <div className="text-muted-foreground" title={FIXTURE_TOOLTIP}>12mo low <span className="mono">${hLow.toLocaleString()}</span></div>
            </div>
          }>
            <div className="p-3"><PriceChart data={p.priceHistory} height={200} /></div>
          </Panel>

          <Panel title="Specifications"><div className="p-3"><Specs p={p} /></div></Panel>

          <Panel title="Supplier offers (fixture)" count={p.offers.length}>
            <div className="overflow-x-auto"><table className="data-table">
              <thead><tr><th>Supplier</th><th>Website</th><th>Region</th><th title={FIXTURE_TOOLTIP}>Stock</th><th title={FIXTURE_TOOLTIP}>Lead</th><th>MOQ</th><th>Price</th><th></th></tr></thead>
              <tbody>
                {p.offers.map((o, i) => {
                  const s = suppliers.find(x => x.id === o.supplierId);
                  return <tr key={i}>
                    <td>
                      {s ? <Link to={`/suppliers/${s.slug}`} className="hover:text-primary font-medium">{s.name}</Link> : o.supplierId}
                      {s?.verified && <span className="ml-1 pill pill-good" title="Demo verification flag only — not a live audit.">verified (demo)</span>}
                    </td>
                    <td>{s ? <a href={s.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary mono">{hostname(s.website)} <ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">—</span>}</td>
                    <td>{s?.region}</td>
                    <td className="mono">{o.stock}</td>
                    <td className="mono">{o.leadDays}d</td>
                    <td className="mono">{o.moq}</td>
                    <td className="mono font-semibold">${o.price.toLocaleString()}</td>
                    <td className="flex gap-1">
                      {s && <a href={s.website} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" title="Open supplier's official website in a new tab"><ExternalLink className="h-3 w-3" /> Supplier site</a>}
                      {s && <Link to={`/suppliers/${s.slug}?part=${p.id}&qty=1#rfq`} className="btn-ghost btn-sm" title="Prefill this supplier's RFQ composer with this part">Draft RFQ</Link>}
                    </td>
                  </tr>;
                })}
                {!p.offers.length && <tr><td colSpan={8} className="p-3 text-[12px] text-muted-foreground text-center">No fixture offers recorded.</td></tr>}
              </tbody>
            </table></div>
          </Panel>

          <Panel id="price-alert" title="Price alert (local draft)" defaultOpen={false} right={<span className="text-[10.5px] uppercase tracking-wide text-warning">Not monitored</span>}>
            <div className="p-3 space-y-2">
              <div className="text-[11.5px] text-muted-foreground">
                Enter a target price to remember locally. This preview does not actively watch supplier feeds; nothing is emailed.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-muted-foreground">
                  Target price (USD)
                  <input type="number" min={1} className="input-bare mt-1 mono w-40" value={alertPrice} onChange={e => setAlertPrice(e.target.value)} placeholder={medPrice != null ? String(medPrice) : "e.g. 900"} />
                </label>
                <button onClick={savePriceAlert} className="btn-primary btn-sm">Save draft</button>
                {existingAlert && <button onClick={clearAlert} className="btn-ghost btn-sm text-negative">Remove</button>}
                {existingAlert?.targetPrice != null && <span className="text-[11px] text-muted-foreground">Current draft target <span className="mono text-foreground">${existingAlert.targetPrice.toLocaleString()}</span></span>}
              </div>
            </div>
          </Panel>

          <Panel id="rfq" title="Draft RFQ (local only)" defaultOpen={false} right={<span className="text-[10.5px] uppercase tracking-wide text-warning">Not sent</span>}>
            <div className="p-3">
              <RfqComposer key={p.id} prefill={{ partId: p.id, manualPartName: null, quantity: 1 }} />
            </div>
          </Panel>

          <Panel title="Same-category candidates" count={alts.length} defaultOpen={false} right={<span className="text-[10.5px] uppercase tracking-wide text-warning">Verify actual fit</span>}>
            <div className="overflow-x-auto"><table className="data-table">
              <thead><tr><th>Candidate</th><th>Maker</th><th>Fixture $ Δ</th><th>Offers</th><th>Fixture reports</th><th>ROS</th><th></th></tr></thead>
              <tbody>
                {alts.map(a => {
                  const aLow = lowestPrice(a);
                  const diff = low > 0 ? ((aLow - low) / low) * 100 : 0;
                  return <tr key={a.id}>
                    <td><Link to={`/parts/${a.category}/${a.slug}`} className="hover:text-primary">{a.name}</Link></td>
                    <td>{a.maker}</td>
                    <td className={`mono ${diff < 0 ? "text-positive" : diff > 0 ? "text-negative" : ""}`}>{diff > 0 ? "+" : ""}{diff.toFixed(0)}%</td>
                    <td className="mono">{a.offers.length}</td>
                    <td className="mono">{a.failures}</td>
                    <td className="text-[12px]">{a.rosSupport}</td>
                    <td className="flex gap-1"><Link to={`/parts/compare?ids=${p.id},${a.id}`} className="btn-ghost btn-sm">Compare</Link><Link to={`/builder?add=${a.id}`} className="btn-ghost btn-sm">Add</Link></td>
                  </tr>;
                })}
                {!alts.length && <tr><td colSpan={7} className="p-3 text-[12px] text-muted-foreground text-center">No other {p.category} components in fixture catalog.</td></tr>}
              </tbody>
            </table></div>
          </Panel>

        </section>

        <aside className="space-y-4">
          <Panel title="Decision brief (fixture)">
            <div className="p-3">
              <Row k="Fixture lowest offer" v={`$${low.toLocaleString()}`} />
              <Row k="Fixture median offer" v={medPrice != null ? `$${medPrice.toLocaleString()}` : "—"} />
              <Row k="Fixture 30d change" v={<PriceDeltaPill pct={delta} />} />
              <Row k="Offers (fixture)" v={p.offers.length} />
              <Row k="In-stock offers" v={inStockOffers} />
              <Row k="Total fixture stock" v={totalStock} />
              <Row k="Min lead (fixture)" v={minLead != null && Number.isFinite(minLead) ? `${minLead}d` : "—"} />
              <Row k="Warranty" v={`${p.warrantyMonths} mo`} />
              <Row k="ROS support" v={p.rosSupport} />
              <Row k="CAD available" v={p.cadAvailable ? "yes" : "no"} />
              <Row k="Open source" v={p.openSource ? "yes" : "no"} />
              <Row k="Fixture incident reports" v={p.failures} />
            </div>
          </Panel>
          <Panel title="Documented compatibility (self-reported)" count={p.compatibility.length}>
            <div className="p-3 flex flex-wrap gap-1">
              {p.compatibility.map(c => <span key={c} className="pill pill-yellow">{c}</span>)}
              {!p.compatibility.length && <span className="text-[12px] text-muted-foreground">No compatibility tags recorded.</span>}
            </div>
            <div className="px-3 pb-3 text-[11px] text-muted-foreground">Tags are self-reported by makers; verify mechanical and electrical fit before committing.</div>
          </Panel>
          <RelatedDiscussionList relatedType="component" relatedId={p.id} title="Community discussions" />
          <CatalogDataNotice variant="inline" />
        </aside>
      </div>
    </div>
  );
}
