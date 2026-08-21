import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  categoryLabel,
  lowestObservedPrice,
  type CatalogOffer,
  type CatalogPart,
} from "@/shared/catalog";
import { useComponent, useComponents, useSuppliers, COMPONENTS_PAGE_SIZE } from "@/lib/api/catalog";
import { ExpandableField } from "@/components/common/ExpandableField";
import { RelatedDiscussionList } from "@/components/community/RelatedDiscussionList";
import { ComingSoon } from "@/components/common/ComingSoon";
import { CatalogDataNotice } from "@/components/parts/CatalogDataNotice";
import { RfqComposer } from "@/components/parts/RfqComposer";
import {
  isPartSaved,
  toggleSavedPart,
  toggleCompare,
  readCompare,
  priceAlertForPart,
  upsertPriceAlert,
  removePriceAlert,
} from "@/lib/catalogWorkspace";
import { fmtList, fmtNumber, fmtText, MISSING } from "@/lib/partsFormat";
import {
  Boxes,
  Check,
  ChevronDown,
  ExternalLink,
  GitCompareArrows,
  ImageOff,
  Plus,
  Star,
  StarOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

const CORE_FIELDS = new Set([
  "id", "slug", "category", "name", "mpn", "maker", "makerCountry", "region", "blurb", "tags",
  "openSource", "datasheetUrl", "cadAvailable", "rosSupport", "warrantyMonths", "priceHistory", "offers",
  "failures", "compatibility", "provenanceLabel", "freshnessAt", "isDemo",
]);

const SPEC_LABELS: Record<string, string> = {
  peakNm: "Peak torque",
  contNm: "Continuous torque",
  speedRpm: "Maximum speed",
  voltageV: "Voltage",
  weightKg: "Weight",
  torqueDensity: "Torque density",
  backlashArcmin: "Backlash",
  encoderType: "Encoder",
  protocol: "Protocol",
  protocols: "Protocols",
  thermalLimitC: "Thermal limit",
  dutyCyclePct: "Duty cycle",
  dof: "Degrees of freedom",
  actuatedDof: "Actuated degrees of freedom",
  payloadKg: "Payload",
  gripForceN: "Grip force",
  tactile: "Tactile sensing",
  interface: "Interface",
  sdk: "SDK",
  fingerReplaceCostUsd: "Finger replacement cost",
  type: "Type",
  rangeM: "Range",
  fovDeg: "Field of view",
  hz: "Frame rate",
  resolution: "Resolution",
  tops: "AI performance",
  ramGb: "Memory",
  storageGb: "Storage",
  ports: "Ports",
  powerW: "Power",
  maxCurrentA: "Maximum current",
  ratio: "Ratio",
  ratedTorqueNm: "Rated torque",
  peakTorqueNm: "Peak torque",
};

const SPEC_UNITS: Record<string, string> = {
  peakNm: " Nm", contNm: " Nm", speedRpm: " RPM", voltageV: " V", weightKg: " kg",
  torqueDensity: " Nm/kg", backlashArcmin: " arcmin", thermalLimitC: " °C", dutyCyclePct: "%",
  payloadKg: " kg", gripForceN: " N", fingerReplaceCostUsd: " USD", rangeM: " m", fovDeg: "°",
  hz: " Hz", ramGb: " GB", storageGb: " GB", powerW: " W", maxCurrentA: " A",
  ratedTorqueNm: " Nm", peakTorqueNm: " Nm",
};

const titleCase = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const categoryTitle = (category: string) => categoryLabel[category] ?? titleCase(category);

const hostname = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
};

const currency = (amount: number, code = "USD") => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
};

function Panel({ title, count, defaultOpen = true, right, id, children }: {
  title: string;
  count?: number | string;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="surface-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 hover:bg-muted/40">
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

function renderSpecValue(key: string, value: unknown): string {
  if (typeof value === "number") {
    const text = fmtNumber(value, { digits: Number.isInteger(value) ? undefined : 2 });
    return text === MISSING ? text : `${text}${SPEC_UNITS[key] ?? ""}`;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return fmtList(value);
  return fmtText(value);
}

function SourceSpecifications({ part }: { part: CatalogPart }) {
  const rows = Object.entries(part)
    .filter(([key, value]) => !CORE_FIELDS.has(key) && value != null && renderSpecValue(key, value) !== MISSING)
    .slice(0, 30);

  if (!rows.length) {
    return <div className="p-4 text-[12px] text-muted-foreground">No structured source specifications have been published for this component yet.</div>;
  }

  return <div className="p-3">{rows.map(([key, value]) => (
    <Row key={key} k={SPEC_LABELS[key] ?? titleCase(key)} v={renderSpecValue(key, value)} />
  ))}</div>;
}

function liveOffers(part: CatalogPart): CatalogOffer[] {
  return part.offers.filter((offer) => !offer.isDemo);
}

export default function PartDetail() {
  const { category, slug } = useParams();
  const componentQuery = useComponent(slug);
  const part = componentQuery.data?.item;
  const alternativesQuery = useComponents(
    { category: part?.category ?? category, limit: COMPONENTS_PAGE_SIZE },
    Boolean(part && !part.isDemo),
  );
  const suppliersQuery = useSuppliers();
  const suppliers = (suppliersQuery.data?.items ?? []).filter((supplier) => !supplier.isDemo);
  const [tick, setTick] = useState(0);
  const [alertPrice, setAlertPrice] = useState("");

  useEffect(() => {
    if (!part) return;
    const alert = priceAlertForPart(part.id);
    setAlertPrice(alert?.targetPrice != null ? String(alert.targetPrice) : "");
  }, [part]);

  const alternatives = useMemo(() => (
    (alternativesQuery.data?.items ?? [])
      .filter((candidate) => !candidate.isDemo && candidate.id !== part?.id && candidate.category === part?.category)
      .slice(0, 5)
  ), [alternativesQuery.data?.items, part?.category, part?.id]);

  if (componentQuery.isPending) {
    return <div className="p-8 text-[13px]" role="status">Loading component from the API…</div>;
  }
  if (componentQuery.isError) {
    return <div className="p-8" role="alert"><div className="font-medium text-negative">Component data could not be loaded.</div><div className="mt-1 text-[12px] text-muted-foreground">{componentQuery.error.message}</div></div>;
  }
  if (!part || (category && part.category !== category)) return <div className="p-8">Part not found.</div>;

  if (part.isDemo) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <ComingSoon
          icon={Boxes}
          kicker="Unavailable"
          title={`${part.name} is not a published catalog record`}
          body="This component is a demonstration fixture and is withheld from production. No fixture pricing, stock, lead times, specifications, imagery, or supplier claims are shown."
          actionLabel="Back to component catalog"
          actionTo={`/parts/${part.category}`}
        />
      </div>
    );
  }

  void tick;
  const compare = readCompare();
  const inCompare = compare.ids.includes(part.id);
  const saved = isPartSaved(part.id);
  const existingAlert = priceAlertForPart(part.id);
  const offers = liveOffers(part);
  const pricedOffers = offers.filter((offer) => offer.price > 0);
  const low = lowestObservedPrice(part);
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

  const doSave = () => {
    const nowSaved = toggleSavedPart(part.id);
    setTick((value) => value + 1);
    toast({ title: nowSaved ? "Component saved" : "Component unsaved", description: "Stored in this browser only." });
  };

  const doCompare = () => {
    let result = toggleCompare(part.id, part.category);
    if (result.kind === "category-mismatch") {
      result = toggleCompare(part.id, part.category, { allowReplace: true });
      toast({ title: "Compare set reset", description: `Now comparing ${categoryTitle(part.category).toLowerCase()} only.` });
    } else if (result.kind === "limit-reached") {
      toast({ title: "Compare limit reached", description: "Comparison holds up to 4 components. Remove one first.", variant: "destructive" });
      return;
    } else if (result.kind === "invalid-part") {
      return;
    } else {
      toast({ title: result.kind === "added" ? "Added to compare" : "Removed from compare" });
    }
    setTick((value) => value + 1);
  };

  const savePriceAlert = () => {
    const value = alertPrice === "" ? null : Number(alertPrice);
    if (value != null && (!Number.isFinite(value) || value <= 0)) {
      toast({ title: "Enter a valid target price greater than 0", variant: "destructive" });
      return;
    }
    upsertPriceAlert(part.id, value);
    setTick((current) => current + 1);
    toast({ title: "Local price alert draft saved", description: "Stored in this browser only. Supplier prices are not actively monitored." });
  };

  const clearAlert = () => {
    removePriceAlert(part.id);
    setAlertPrice("");
    setTick((value) => value + 1);
    toast({ title: "Local price alert removed" });
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="mb-2 text-[12px] text-muted-foreground">
        <Link to={`/parts/${part.category}`} className="hover:text-primary">{categoryTitle(part.category)}</Link> / <span className="text-foreground">{part.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{part.name}</h1>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {part.maker || "Unknown manufacturer"}
            {part.mpn ? <> · MPN <span className="mono text-foreground">{part.mpn}</span></> : null}
            {part.region ? ` · ${part.region}` : ""}
          </div>
          {part.blurb ? <p className="mt-2 max-w-3xl text-[14px]">{part.blurb}</p> : <p className="mt-2 text-[13px] text-muted-foreground">No source summary has been published for this component yet.</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {part.tags.map((tag) => <span key={tag} className="pill">{tag}</span>)}
            {part.openSource && <span className="pill pill-good">open source</span>}
            <span className="pill">{categoryTitle(part.category)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/builder?add=${encodeURIComponent(part.id)}`} className="btn-primary"><Plus className="h-3.5 w-3.5" /> Add to BOM</Link>
          <button onClick={doSave} className="btn-ghost inline-flex items-center gap-1" aria-pressed={saved}>
            {saved ? <Star className="h-3.5 w-3.5 fill-primary text-primary" /> : <StarOff className="h-3.5 w-3.5" />} {saved ? "Saved" : "Save"}
          </button>
          <button onClick={doCompare} className={`btn-ghost inline-flex items-center gap-1 ${inCompare ? "text-primary" : ""}`} aria-pressed={inCompare}>
            {inCompare ? <Check className="h-3.5 w-3.5" /> : <GitCompareArrows className="h-3.5 w-3.5" />} {inCompare ? "In compare" : "Compare"}
          </button>
        </div>
      </div>

      <CatalogDataNotice className="mt-4" />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <Panel title="Source image">
            <div className="grid place-items-center gap-2 px-4 py-10 text-center text-muted-foreground">
              <ImageOff className="h-8 w-8 opacity-60" />
              <div className="text-[12px]">No curated, source-backed component photo is available for this record.</div>
            </div>
          </Panel>

          <Panel title="Specifications"><SourceSpecifications part={part} /></Panel>

          <Panel title="Supplier offers" count={offers.length} right={low != null ? <span className="text-[12px]">From <span className="mono font-semibold">{currency(low, pricedOffers[0]?.currency ?? "USD")}</span></span> : undefined}>
            <div className="overflow-x-auto"><table className="data-table">
              <thead><tr><th>Supplier</th><th>Supplier SKU</th><th>Region</th><th>Stock</th><th>Lead</th><th>MOQ</th><th>Observed price</th><th>Source</th></tr></thead>
              <tbody>
                {offers.map((offer) => {
                  const supplier = supplierById.get(offer.supplierId);
                  return <tr key={offer.id}>
                    <td>{supplier ? <Link to={`/suppliers/${supplier.slug}`} className="font-medium hover:text-primary">{supplier.name}</Link> : <span className="font-medium">{offer.supplierName}</span>}</td>
                    <td className="mono text-[11px]">{offer.supplierSku || <span className="text-muted-foreground">Unknown</span>}</td>
                    <td>{offer.supplierRegion || supplier?.region || <span className="text-muted-foreground">Unknown</span>}</td>
                    <td className="mono">{offer.stockKnown ? offer.stock.toLocaleString() : <span className="text-muted-foreground">Unknown</span>}</td>
                    <td className="mono">{offer.leadKnown ? `${offer.leadDays}d` : <span className="text-muted-foreground">Unknown</span>}</td>
                    <td className="mono">{offer.moq > 0 ? offer.moq : <span className="text-muted-foreground">Unknown</span>}</td>
                    <td className="mono font-semibold">{offer.price > 0 ? currency(offer.price, offer.currency ?? "USD") : <span className="text-muted-foreground">Quote required</span>}</td>
                    <td>{offer.productUrl ? <a href={offer.productUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Buy / verify</a> : supplier?.website ? <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary">{hostname(supplier.website)} <ExternalLink className="h-3 w-3" /></a> : <span className="text-muted-foreground">Unavailable</span>}</td>
                  </tr>;
                })}
                {!offers.length && <tr><td colSpan={8} className="p-4 text-center text-[12px] text-muted-foreground">No authentic supplier offers have been linked to this component yet.</td></tr>}
              </tbody>
            </table></div>
          </Panel>

          <Panel id="price-alert" title="Price alert draft" defaultOpen={false} right={<span className="text-[10.5px] uppercase tracking-wide text-warning">Local only · not monitored</span>}>
            <div className="space-y-2 p-3">
              <div className="text-[11.5px] text-muted-foreground">Remember a target price in this browser. Nothing is monitored or emailed.</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] text-muted-foreground">Target price (USD)
                  <input type="number" min={0.01} step="0.01" className="input-bare mt-1 w-40 mono" value={alertPrice} onChange={(event) => setAlertPrice(event.target.value)} placeholder={low != null ? String(low) : "e.g. 25.00"} />
                </label>
                <button onClick={savePriceAlert} className="btn-primary btn-sm">Save draft</button>
                {existingAlert && <button onClick={clearAlert} className="btn-ghost btn-sm text-negative">Remove</button>}
              </div>
            </div>
          </Panel>

          <Panel id="rfq" title="Draft RFQ" defaultOpen={false} right={<span className="text-[10.5px] uppercase tracking-wide text-warning">Local only · not sent</span>}>
            <div className="p-3"><RfqComposer key={part.id} prefill={{ partId: part.id, manualPartName: part.mpn ?? part.name, quantity: 1 }} /></div>
          </Panel>

          <Panel title="Same-category candidates" count={alternatives.length} defaultOpen={false} right={<span className="text-[10.5px] uppercase tracking-wide text-warning">Verify actual fit</span>}>
            {alternativesQuery.isPending ? <div className="p-4 text-[12px] text-muted-foreground">Loading candidates…</div> : alternativesQuery.isError ? <div className="p-4 text-[12px] text-muted-foreground">Candidate data is temporarily unavailable.</div> : (
              <div className="overflow-x-auto"><table className="data-table">
                <thead><tr><th>Candidate</th><th>Maker</th><th>MPN</th><th>Observed price</th><th>Offers</th><th></th></tr></thead>
                <tbody>
                  {alternatives.map((candidate) => {
                    const candidatePrice = lowestObservedPrice(candidate);
                    const candidateOffers = liveOffers(candidate);
                    return <tr key={candidate.id}>
                      <td><Link to={`/parts/${candidate.category}/${candidate.slug}`} className="hover:text-primary">{candidate.name}</Link></td>
                      <td>{candidate.maker}</td>
                      <td className="mono text-[11px]">{candidate.mpn || <span className="text-muted-foreground">Unknown</span>}</td>
                      <td className="mono">{candidatePrice != null ? currency(candidatePrice, candidateOffers[0]?.currency ?? "USD") : <span className="text-muted-foreground">Unpriced</span>}</td>
                      <td className="mono">{candidateOffers.length}</td>
                      <td><Link to={`/parts/compare?ids=${part.id},${candidate.id}`} className="btn-ghost btn-sm">Compare</Link></td>
                    </tr>;
                  })}
                  {!alternatives.length && <tr><td colSpan={6} className="p-4 text-center text-[12px] text-muted-foreground">No other published components in this category are available on this page.</td></tr>}
                </tbody>
              </table></div>
            )}
          </Panel>

          <RelatedDiscussionList relatedType="component" relatedId={part.id} title="Community discussions about this component" />
        </section>

        <aside className="space-y-4">
          <div className="surface-card p-4">
            <div className="section-title mb-2">Record</div>
            <Row k="Manufacturer" v={part.maker || "Unknown"} />
            <Row k="MPN" v={part.mpn || "Unknown"} />
            <Row k="Category" v={categoryTitle(part.category)} />
            <Row k="Primary region" v={part.region || "Unknown"} />
            <Row k="Provenance" v={part.provenanceLabel || "Unknown"} />
            <Row k="Last source refresh" v={part.freshnessAt ? new Date(part.freshnessAt).toLocaleDateString() : "Unknown"} />
            {part.datasheetUrl && <Row k="Datasheet" v={<a href={part.datasheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Open source document <ExternalLink className="h-3 w-3" /></a>} />}
          </div>

          <div className="surface-card p-4">
            <div className="section-title mb-2">Observed sourcing</div>
            <Row k="Authentic offers" v={offers.length} />
            <Row k="Priced offers" v={pricedOffers.length} />
            <Row k="Lowest observed" v={low != null ? currency(low, pricedOffers[0]?.currency ?? "USD") : "Unpriced"} />
            <Row k="Direct product links" v={offers.filter((offer) => Boolean(offer.productUrl)).length} />
          </div>
        </aside>
      </div>
    </div>
  );
}
