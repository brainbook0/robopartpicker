import { Link } from "react-router-dom";
import {
  lowestObservedPrice,
  priceDelta30,
  type CatalogPart,
  type Actuator,
  type Hand,
  type Sensor,
  type Compute,
  type Driver,
  type Reducer,
} from "@/shared/catalog";
import { PriceDeltaPill } from "@/components/common/PriceDeltaPill";
import { Star, StarOff, GitCompareArrows, Check } from "lucide-react";
import { isPartSaved, toggleSavedPart, toggleCompare, readCompare } from "@/lib/catalogWorkspace";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { FIXTURE_TOOLTIP } from "@/components/parts/CatalogDataNotice";
import { fmtNumber, fmtText, fmtList } from "@/lib/partsFormat";

type Props = { parts: CatalogPart[]; onWorkspaceChange?: () => void };

const yn = (value: unknown) => (typeof value === "boolean" ? (value ? "yes" : "no") : "—");

export const PartsTable = ({ parts, onWorkspaceChange }: Props) => {
  const [, bump] = useState(0);
  const refresh = () => { bump(x => x + 1); onWorkspaceChange?.(); };
  if (!parts.length) return null;
  const cat = parts[0].category;
  const compare = readCompare();

  const doSave = (id: string, name: string) => {
    const now = toggleSavedPart(id);
    toast({ title: now ? "Component saved" : "Component unsaved", description: `${name} — local workspace only.` });
    refresh();
  };
  const doCompare = (id: string, name: string, cat: CatalogPart["category"]) => {
    // First attempt without replace so we can announce the reset explicitly.
    let r = toggleCompare(id, cat);
    if (r.kind === "category-mismatch") {
      r = toggleCompare(id, cat, { allowReplace: true });
      toast({ title: "Compare set reset", description: `Switched to ${cat}. Comparison is limited to one category at a time.` });
    } else if (r.kind === "limit-reached") {
      toast({ title: "Compare limit reached", description: "Compare holds up to 4 components. Remove one from the tray first.", variant: "destructive" });
      return;
    } else if (r.kind === "invalid-part") {
      return;
    } else {
      toast({ title: r.kind === "added" ? "Added to compare" : "Removed from compare", description: name });
    }
    refresh();
  };
  return (
    <div className="surface-card overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            <th>Part</th>
            <th>Maker</th>
            {cat === "actuator" && <>
              <th>Peak Nm</th><th>Cont Nm</th><th>RPM</th><th>V</th><th>kg</th><th>Protocol</th><th>ROS</th>
            </>}
            {cat === "hand" && <>
              <th>DoF</th><th>Act DoF</th><th>Payload kg</th><th>Grip N</th><th>Tactile</th><th>kg</th><th>Iface</th>
            </>}
            {cat === "sensor" && <>
              <th>Type</th><th>Range m</th><th>FoV°</th><th>Hz</th><th>Res</th><th>kg</th><th>Iface</th>
            </>}
            {cat === "compute" && <>
              <th>TOPS</th><th>RAM</th><th>Storage</th><th>Power W</th><th>kg</th>
            </>}
            {cat === "driver" && <>
              <th>Max A</th><th>V</th><th>Protocols</th><th>kg</th>
            </>}
            {cat === "reducer" && <>
              <th>Type</th><th>Ratio</th><th>Rated Nm</th><th>Peak Nm</th><th>Backlash'</th><th>kg</th>
            </>}
            <th title={FIXTURE_TOOLTIP}>Lowest observed</th>
            <th title={FIXTURE_TOOLTIP}>30d change</th>
            <th title={FIXTURE_TOOLTIP}>Lead</th>
            <th title="Number of non-demo supplier offers.">Offers</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {parts.map(p => {
            const liveOffers = p.offers.filter((offer) => !offer.isDemo);
            const low = lowestObservedPrice(p);
            const knownLeads = liveOffers.filter((offer) => offer.leadKnown).map((offer) => offer.leadDays);
            const minLead = knownLeads.length ? Math.min(...knownLeads) : null;
            const saved = isPartSaved(p.id);
            const inCompare = compare.ids.includes(p.id);
            return (
              <tr key={p.id}>
                <td><div className="h-10 w-14 rounded border border-border bg-muted/40 flex items-center justify-center text-[10px] leading-tight text-muted-foreground text-center" title="No curated, source-backed photograph for this component.">no photo</div></td>
                <td>
                  <Link to={`/parts/${p.category}/${p.slug}`} className="font-medium hover:text-primary">{p.name}</Link>
                  {p.openSource && <span className="ml-1 pill pill-good">OS</span>}
                  {p.mpn && <div className="mono text-[10px] text-muted-foreground">MPN {p.mpn}</div>}
                </td>
                <td className="text-muted-foreground">{p.maker}</td>
                {cat === "actuator" && (() => { const a = p as Actuator; return <>
                  <td className="mono">{fmtNumber(a.peakNm)}</td><td className="mono">{fmtNumber(a.contNm)}</td><td className="mono">{fmtNumber(a.speedRpm)}</td>
                  <td className="mono">{fmtNumber(a.voltageV)}</td><td className="mono">{fmtNumber(a.weightKg, { digits: 2 })}</td>
                  <td>{fmtText(a.protocol)}</td><td className="text-[12px]">{fmtText(a.rosSupport)}</td>
                </>; })()}
                {cat === "hand" && (() => { const h = p as Hand; return <>
                  <td className="mono">{fmtNumber(h.dof)}</td><td className="mono">{fmtNumber(h.actuatedDof)}</td>
                  <td className="mono">{fmtNumber(h.payloadKg)}</td><td className="mono">{fmtNumber(h.gripForceN)}</td>
                  <td>{yn(h.tactile)}</td><td className="mono">{fmtNumber(h.weightKg, { digits: 2 })}</td>
                  <td className="text-[12px]">{fmtText(h.interface)}</td>
                </>; })()}
                {cat === "sensor" && (() => { const s = p as Sensor; return <>
                  <td>{fmtText(s.type)}</td><td className="mono">{fmtNumber(s.rangeM)}</td><td className="mono">{fmtNumber(s.fovDeg)}</td>
                  <td className="mono">{fmtNumber(s.hz)}</td><td className="text-[12px]">{fmtText(s.resolution)}</td>
                  <td className="mono">{fmtNumber(s.weightKg, { digits: 2 })}</td><td className="text-[12px]">{fmtText(s.interface)}</td>
                </>; })()}
                {cat === "compute" && (() => { const c = p as Compute; return <>
                  <td className="mono">{fmtNumber(c.tops)}</td><td className="mono">{fmtNumber(c.ramGb, { suffix: "GB" })}</td>
                  <td className="mono">{fmtNumber(c.storageGb, { suffix: "GB" })}</td><td className="mono">{fmtNumber(c.powerW)}</td>
                  <td className="mono">{fmtNumber(c.weightKg, { digits: 2 })}</td>
                </>; })()}
                {cat === "driver" && (() => { const d = p as Driver; return <>
                  <td className="mono">{fmtNumber(d.maxCurrentA)}</td><td className="mono">{fmtNumber(d.voltageV)}</td>
                  <td className="text-[12px]">{fmtList(d.protocols, "/")}</td><td className="mono">{fmtNumber(d.weightKg, { digits: 2 })}</td>
                </>; })()}
                {cat === "reducer" && (() => { const r = p as Reducer; return <>
                  <td>{fmtText(r.type)}</td><td className="mono">{fmtNumber(r.ratio, { suffix: ":1" })}</td>
                  <td className="mono">{fmtNumber(r.ratedTorqueNm)}</td><td className="mono">{fmtNumber(r.peakTorqueNm)}</td>
                  <td className="mono">{fmtNumber(r.backlashArcmin)}</td><td className="mono">{fmtNumber(r.weightKg, { digits: 2 })}</td>
                </>; })()}
                <td className="mono font-semibold">{low == null ? <span className="text-muted-foreground">Unpriced</span> : new Intl.NumberFormat(undefined, { style: "currency", currency: liveOffers.find((offer) => offer.price === low)?.currency ?? "USD" }).format(low)}</td>
                <td>{p.priceHistory.length >= 2 ? <PriceDeltaPill pct={priceDelta30(p)} /> : <span className="text-muted-foreground">—</span>}</td>
                <td className="mono">{minLead == null ? <span className="text-muted-foreground">—</span> : `${minLead}d`}</td>
                <td className="mono">{liveOffers.length}</td>
                <td>
                  <div className="flex justify-end items-center gap-1 whitespace-nowrap">
                    <button onClick={() => doSave(p.id, p.name)} className="btn-ghost btn-sm inline-flex items-center gap-1" aria-label={saved ? `Unsave ${p.name}` : `Save ${p.name}`} title={saved ? "Saved locally" : "Save to local workspace"}>
                      {saved ? <Star className="h-3.5 w-3.5 text-primary fill-primary" aria-hidden /> : <StarOff className="h-3.5 w-3.5" aria-hidden />}
                    </button>
                    <button onClick={() => doCompare(p.id, p.name, p.category)} className={`btn-ghost btn-sm inline-flex items-center gap-1 ${inCompare ? "text-primary" : ""}`} aria-label={inCompare ? `Remove ${p.name} from compare` : `Add ${p.name} to compare`} title={inCompare ? "In compare tray" : "Add to comparison"}>
                      {inCompare ? <Check className="h-3.5 w-3.5" aria-hidden /> : <GitCompareArrows className="h-3.5 w-3.5" aria-hidden />}
                    </button>
                    <Link to={`/parts/${p.category}/${p.slug}`} className="btn-ghost btn-sm">View</Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
