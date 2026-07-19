import { Link } from "react-router-dom";
import {
  lowestPrice,
  priceDelta30,
  type Part,
  type Actuator,
  type Hand,
  type Sensor,
  type Compute,
  type Driver,
  type Reducer,
} from "@/shared/catalog";
import { PriceDeltaPill } from "@/components/common/PriceDeltaPill";
import { ExpandableImage } from "@/components/common/ExpandableImage";
import { gallery } from "@/lib/media";
import { Star, StarOff, GitCompareArrows, Check } from "lucide-react";
import { isPartSaved, toggleSavedPart, toggleCompare, readCompare } from "@/lib/catalogWorkspace";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { FIXTURE_TOOLTIP } from "@/components/parts/CatalogDataNotice";

type Props = { parts: Part[]; onWorkspaceChange?: () => void };

const fmt = (n: number) => n.toLocaleString();

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
  const doCompare = (id: string, name: string, cat: Part["category"]) => {
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
            <th title={FIXTURE_TOOLTIP}>Low $ (fixture)</th>
            <th title={FIXTURE_TOOLTIP}>Fixture 30d Δ</th>
            <th title="Shortest fixture lead across known offers.">Lead (fixture)</th>
            <th title="Number of known fixture offers.">Offers</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {parts.map(p => {
            const low = lowestPrice(p);
            const minLead = p.offers.reduce((m, o) => Math.min(m, o.leadDays), 999);
            const g = gallery("part-" + p.category, p.id, 3);
            const saved = isPartSaved(p.id);
            const inCompare = compare.ids.includes(p.id);
            return (
              <tr key={p.id}>
                <td><ExpandableImage src={g.hero} alt={p.name} thumbs={g.thumbs} caption={`${p.name} — ${p.maker}`} className="h-10 w-14" /></td>
                <td>
                  <Link to={`/parts/${p.category}/${p.slug}`} className="font-medium hover:text-primary">{p.name}</Link>
                  {p.openSource && <span className="ml-1 pill pill-good">OS</span>}
                </td>
                <td className="text-muted-foreground">{p.maker}</td>
                {cat === "actuator" && (() => { const a = p as Actuator; return <>
                  <td className="mono">{a.peakNm}</td><td className="mono">{a.contNm}</td><td className="mono">{a.speedRpm}</td>
                  <td className="mono">{a.voltageV}</td><td className="mono">{a.weightKg.toFixed(2)}</td>
                  <td>{a.protocol}</td><td className="text-[12px]">{a.rosSupport}</td>
                </>; })()}
                {cat === "hand" && (() => { const h = p as Hand; return <>
                  <td className="mono">{h.dof}</td><td className="mono">{h.actuatedDof}</td>
                  <td className="mono">{h.payloadKg}</td><td className="mono">{h.gripForceN}</td>
                  <td>{h.tactile ? "yes" : "no"}</td><td className="mono">{h.weightKg.toFixed(2)}</td>
                  <td className="text-[12px]">{h.interface}</td>
                </>; })()}
                {cat === "sensor" && (() => { const s = p as Sensor; return <>
                  <td>{s.type}</td><td className="mono">{s.rangeM}</td><td className="mono">{s.fovDeg}</td>
                  <td className="mono">{s.hz}</td><td className="text-[12px]">{s.resolution}</td>
                  <td className="mono">{s.weightKg.toFixed(2)}</td><td className="text-[12px]">{s.interface}</td>
                </>; })()}
                {cat === "compute" && (() => { const c = p as Compute; return <>
                  <td className="mono">{c.tops}</td><td className="mono">{c.ramGb}GB</td>
                  <td className="mono">{c.storageGb}GB</td><td className="mono">{c.powerW}</td>
                  <td className="mono">{c.weightKg.toFixed(2)}</td>
                </>; })()}
                {cat === "driver" && (() => { const d = p as Driver; return <>
                  <td className="mono">{d.maxCurrentA}</td><td className="mono">{d.voltageV}</td>
                  <td className="text-[12px]">{d.protocols.join("/")}</td><td className="mono">{d.weightKg.toFixed(2)}</td>
                </>; })()}
                {cat === "reducer" && (() => { const r = p as Reducer; return <>
                  <td>{r.type}</td><td className="mono">{r.ratio}:1</td>
                  <td className="mono">{r.ratedTorqueNm}</td><td className="mono">{r.peakTorqueNm}</td>
                  <td className="mono">{r.backlashArcmin}</td><td className="mono">{r.weightKg.toFixed(2)}</td>
                </>; })()}
                <td className="mono font-semibold">${fmt(low)}</td>
                <td><PriceDeltaPill pct={priceDelta30(p)} /></td>
                <td className="mono">{minLead}d</td>
                <td className="mono">{p.offers.length}</td>
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
