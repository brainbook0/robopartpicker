import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { lowestPrice, priceDelta30, categoryLabel, type Part, type Actuator, type Hand, type Sensor, type Compute, type Driver, type Reducer, type PartCategory, type CatalogPart } from "@/shared/catalog";
import { api } from "@/lib/api/client";
import { COMPARE_CAP, removeFromCompare, clearCompare, copyText } from "@/lib/catalogWorkspace";
import { CatalogDataNotice } from "@/components/parts/CatalogDataNotice";
import { toast } from "@/hooks/use-toast";
import { Copy, Trash2, X, ExternalLink, Plus, ChevronLeft } from "lucide-react";

const minLead = (p: Part) => p.offers.length ? Math.min(...p.offers.map(o => o.leadDays)) : null;
const totalStock = (p: Part) => p.offers.reduce((s, o) => s + o.stock, 0);

type Row = {
  key: string;
  label: string;
  values: (string | number | null)[];
  best?: "lower" | "higher"; // when direction is unambiguous
  mono?: boolean;
  hint?: string;
};

function baseRows(parts: Part[]): Row[] {
  const rows: Row[] = [
    { key: "maker", label: "Maker", values: parts.map(p => p.maker) },
    { key: "region", label: "Manufacturer region", values: parts.map(p => p.region) },
    { key: "openSource", label: "Open source", values: parts.map(p => p.openSource ? "yes" : "no") },
    { key: "ros", label: "ROS support", values: parts.map(p => p.rosSupport) },
    { key: "cad", label: "CAD available", values: parts.map(p => p.cadAvailable ? "yes" : "no") },
    { key: "warranty", label: "Warranty (mo)", values: parts.map(p => p.warrantyMonths), best: "higher", mono: true },
    { key: "price", label: "Fixture lowest price ($)", values: parts.map(p => p.offers.length ? lowestPrice(p) : null), best: "lower", mono: true, hint: "Fixture only — not a live quote." },
    { key: "delta", label: "Fixture price Δ (last 30d %)", values: parts.map(p => p.offers.length ? +priceDelta30(p).toFixed(1) : null), mono: true, hint: "Change against previous fixture point." },
    { key: "lead", label: "Shortest fixture lead (d)", values: parts.map(p => minLead(p)), best: "lower", mono: true },
    { key: "stock", label: "Fixture stock (all offers)", values: parts.map(p => totalStock(p)), mono: true, hint: "Sum of static fixture stock counts — not current inventory." },
    { key: "offers", label: "Known offers", values: parts.map(p => p.offers.length), mono: true },
    { key: "incidents", label: "Reported incidents (fixture)", values: parts.map(p => p.failures), best: "lower", mono: true, hint: "Count of fixture incident records — not a validated failure rate." },
    { key: "compat", label: "Usage/integration tags", values: parts.map(p => p.compatibility.join(", ") || "—"), hint: "Not a compatibility guarantee." },
    { key: "supplierNames", label: "Fixture suppliers", values: parts.map(p =>
        p.offers.map(o => o.supplierName).join(", ") || "—") },
  ];
  return rows;
}

function catRows(parts: Part[]): Row[] {
  const c = parts[0].category;
  if (c === "actuator") {
    const A = parts as Actuator[];
    return [
      { key: "peakNm", label: "Peak torque (Nm)", values: A.map(p => p.peakNm), best: "higher", mono: true },
      { key: "contNm", label: "Continuous torque (Nm)", values: A.map(p => p.contNm), best: "higher", mono: true },
      { key: "rpm", label: "Max speed (RPM)", values: A.map(p => p.speedRpm), best: "higher", mono: true },
      { key: "volt", label: "Voltage (V)", values: A.map(p => p.voltageV), mono: true },
      { key: "kg", label: "Weight (kg)", values: A.map(p => p.weightKg), best: "lower", mono: true },
      { key: "density", label: "Torque density (Nm/kg)", values: A.map(p => +p.torqueDensity.toFixed(1)), best: "higher", mono: true },
      { key: "backlash", label: "Backlash (arcmin)", values: A.map(p => p.backlashArcmin), best: "lower", mono: true },
      { key: "protocol", label: "Protocol", values: A.map(p => p.protocol) },
      { key: "encoder", label: "Encoder", values: A.map(p => p.encoderType) },
      { key: "thermal", label: "Thermal limit (°C)", values: A.map(p => p.thermalLimitC), best: "higher", mono: true },
    ];
  }
  if (c === "hand") {
    const H = parts as Hand[];
    return [
      { key: "dof", label: "Total DoF", values: H.map(p => p.dof), best: "higher", mono: true },
      { key: "adof", label: "Actuated DoF", values: H.map(p => p.actuatedDof), best: "higher", mono: true },
      { key: "payload", label: "Payload (kg)", values: H.map(p => p.payloadKg), best: "higher", mono: true },
      { key: "grip", label: "Grip force (N)", values: H.map(p => p.gripForceN), best: "higher", mono: true },
      { key: "tactile", label: "Tactile", values: H.map(p => p.tactile ? "yes" : "no") },
      { key: "kg", label: "Weight (kg)", values: H.map(p => p.weightKg), best: "lower", mono: true },
      { key: "iface", label: "Interface", values: H.map(p => p.interface) },
      { key: "sdk", label: "SDK", values: H.map(p => p.sdk) },
    ];
  }
  if (c === "sensor") {
    const S = parts as Sensor[];
    return [
      { key: "type", label: "Type", values: S.map(p => p.type) },
      { key: "range", label: "Range (m)", values: S.map(p => p.rangeM), best: "higher", mono: true },
      { key: "fov", label: "FoV (°)", values: S.map(p => p.fovDeg), best: "higher", mono: true },
      { key: "hz", label: "Frame rate (Hz)", values: S.map(p => p.hz), best: "higher", mono: true },
      { key: "res", label: "Resolution", values: S.map(p => p.resolution) },
      { key: "iface", label: "Interface", values: S.map(p => p.interface) },
      { key: "kg", label: "Weight (kg)", values: S.map(p => p.weightKg), best: "lower", mono: true },
    ];
  }
  if (c === "compute") {
    const C = parts as Compute[];
    return [
      { key: "tops", label: "AI TOPS", values: C.map(p => p.tops), best: "higher", mono: true },
      { key: "ram", label: "RAM (GB)", values: C.map(p => p.ramGb), best: "higher", mono: true },
      { key: "storage", label: "Storage (GB)", values: C.map(p => p.storageGb), best: "higher", mono: true },
      { key: "power", label: "Power (W)", values: C.map(p => p.powerW), best: "lower", mono: true },
      { key: "ports", label: "Ports", values: C.map(p => p.ports) },
      { key: "kg", label: "Weight (kg)", values: C.map(p => p.weightKg), best: "lower", mono: true },
    ];
  }
  if (c === "driver") {
    const D = parts as Driver[];
    return [
      { key: "amps", label: "Max current (A)", values: D.map(p => p.maxCurrentA), best: "higher", mono: true },
      { key: "volt", label: "Voltage (V)", values: D.map(p => p.voltageV), mono: true },
      { key: "proto", label: "Protocols", values: D.map(p => p.protocols.join(", ")) },
      { key: "kg", label: "Weight (kg)", values: D.map(p => p.weightKg), best: "lower", mono: true },
    ];
  }
  const R = parts as Reducer[];
  return [
    { key: "type", label: "Type", values: R.map(p => p.type) },
    { key: "ratio", label: "Ratio", values: R.map(p => `${p.ratio}:1`) },
    { key: "rated", label: "Rated torque (Nm)", values: R.map(p => p.ratedTorqueNm), best: "higher", mono: true },
    { key: "peak", label: "Peak torque (Nm)", values: R.map(p => p.peakTorqueNm), best: "higher", mono: true },
    { key: "backlash", label: "Backlash (arcmin)", values: R.map(p => p.backlashArcmin), best: "lower", mono: true },
    { key: "kg", label: "Weight (kg)", values: R.map(p => p.weightKg), best: "lower", mono: true },
  ];
}

function bestIndex(vals: (string | number | null)[], dir?: "lower" | "higher"): number | null {
  if (!dir) return null;
  const numeric = vals.map(v => (typeof v === "number" && Number.isFinite(v)) ? v : null);
  if (numeric.some(v => v == null)) return null;
  const nums = numeric as number[];
  const target = dir === "lower" ? Math.min(...nums) : Math.max(...nums);
  // Only highlight if there's a unique best
  if (nums.filter(v => v === target).length !== 1) return null;
  return nums.indexOf(target);
}

function rowsToCsv(header: string[], rows: Row[]): string {
  const esc = (s: unknown) => {
    const v = s == null ? "" : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const out: string[] = [header.map(esc).join(",")];
  rows.forEach(r => out.push([r.label, ...r.values.map(v => v ?? "")].map(esc).join(",")));
  return out.join("\n");
}

export default function PartCompare() {
  const [sp, setSp] = useSearchParams();
  const rawIds = (sp.get("ids") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const idList: string[] = [];
  for (const id of rawIds) { if (!seen.has(id)) { seen.add(id); idList.push(id); } if (idList.length >= COMPARE_CAP) break; }

  const componentQueries = useQueries({
    queries: idList.map((id) => ({
      queryKey: ["catalog-component", id],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<{ item: CatalogPart }>(`/api/v1/components/${encodeURIComponent(id)}`, { signal }),
      retry: false,
      staleTime: 30_000,
    })),
  });
  const resolved = idList.map((id, index) => ({ id, part: componentQueries[index]?.data?.item as Part | undefined }));
  const missing = resolved.filter((row, index) => componentQueries[index]?.isError && !row.part).map(row => row.id);
  const foundParts = resolved.map(r => r.part).filter((p): p is Part => Boolean(p));
  const loading = componentQueries.some((query) => query.isPending);

  // Determine dominant category from first valid part; drop other-category picks.
  const primaryCat: PartCategory | null = foundParts[0]?.category ?? null;
  const compatible = primaryCat ? foundParts.filter(p => p.category === primaryCat) : [];
  const mixed = foundParts.length !== compatible.length;

  const rows = useMemo(() => compatible.length ? [...catRows(compatible), ...baseRows(compatible)] : [], [compatible]);

  const removeOne = (id: string) => {
    const next = compatible.filter(p => p.id !== id).map(p => p.id);
    removeFromCompare(id);
    if (next.length) setSp(new URLSearchParams({ ids: next.join(",") }), { replace: true });
    else setSp(new URLSearchParams(), { replace: true });
  };
  const clearAll = () => { clearCompare(); setSp(new URLSearchParams(), { replace: true }); };
  const share = async () => {
    const url = `${window.location.origin}/parts/compare?ids=${compatible.map(p => p.id).join(",")}`;
    const ok = await copyText(url);
    toast({ title: ok ? "Compare URL copied" : "Copy failed", description: ok ? url : "Clipboard not available.", variant: ok ? undefined : "destructive" });
  };
  const exportCsv = () => {
    if (!compatible.length) return;
    const csv = rowsToCsv(["Metric", ...compatible.map(p => `${p.name} (${p.maker})`)], rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `compare-${compatible.map(p => p.slug).join("-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-1">
        <Link to="/parts/actuator" className="hover:text-primary inline-flex items-center gap-1"><ChevronLeft className="h-3 w-3" />Catalog</Link>
        {" / "}<span className="text-foreground">Component comparison</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Component comparison</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Same-category side-by-side · up to {COMPARE_CAP} components{primaryCat ? ` · ${categoryLabel[primaryCat]}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={share} className="btn-ghost btn-sm inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy share URL</button>
          <button onClick={exportCsv} disabled={!compatible.length} className="btn-ghost btn-sm inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" /> Export CSV</button>
          <button onClick={clearAll} disabled={!compatible.length} className="btn-ghost btn-sm inline-flex items-center gap-1 text-negative"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
        </div>
      </div>

      <CatalogDataNotice />

      <div className="mt-3 surface-card px-3 py-2 text-[11.5px] text-muted-foreground">
        <span className="font-medium text-foreground">Same-category comparison only.</span> This view does <em>not</em> prove drop-in compatibility, mechanical fit, thermal integration, firmware/SDK readiness, or supply reliability. Best-value markers are shown only for metrics with an unambiguous direction (e.g. lower weight, higher torque). Subjective specs are shown without a winner.
      </div>

      {mixed && (
        <div className="mt-2 surface-card px-3 py-2 text-[11.5px] border-warning/40 bg-warning/5 text-warning">
          Some selected components were in a different category than {primaryCat ? categoryLabel[primaryCat].toLowerCase() : "the first pick"} and were dropped from this comparison. Comparison is restricted to one category at a time.
        </div>
      )}
      {missing.length > 0 && (
        <div className="mt-2 surface-card px-3 py-2 text-[11.5px] border-warning/40 bg-warning/5 text-warning">
          Unknown component id(s): <span className="mono">{missing.join(", ")}</span>
        </div>
      )}

      {loading ? (
        <div className="mt-4 surface-card p-6 text-center text-[13px] text-muted-foreground" role="status">
          Loading selected components from the API…
        </div>
      ) : !compatible.length ? (
        <div className="mt-4 surface-card p-6 text-center text-[13px] text-muted-foreground">
          No components selected. Add components from the <Link to="/parts/actuator" className="text-primary hover:underline">catalog</Link>.
        </div>
      ) : (
        <div className="mt-3 surface-card overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-[220px]">Metric</th>
                {compatible.map(p => (
                  <th key={p.id} className="min-w-[200px]">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/parts/${p.category}/${p.slug}`} className="font-medium hover:text-primary leading-tight">{p.name}</Link>
                      <button aria-label={`Remove ${p.name} from comparison`} onClick={() => removeOne(p.id)} className="text-muted-foreground hover:text-negative">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-normal">{p.maker}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Link to={`/builder?add=${encodeURIComponent(p.id)}`} className="btn-ghost btn-sm inline-flex items-center gap-1"><Plus className="h-3 w-3" /> BOM</Link>
                      <Link to={`/parts/${p.category}/${p.slug}`} className="btn-ghost btn-sm">Detail →</Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const best = bestIndex(r.values, r.best);
                return (
                  <tr key={r.key}>
                    <td className="text-[12px] text-muted-foreground align-top">
                      {r.label}
                      {r.hint && <div className="text-[10.5px] italic mt-0.5">{r.hint}</div>}
                    </td>
                    {r.values.map((v, i) => (
                      <td key={i} className={`${r.mono ? "mono" : ""} ${best === i ? "text-[hsl(var(--positive))] font-semibold" : ""}`}>
                        {v == null ? <span className="text-muted-foreground">—</span> : String(v)}
                        {best === i && r.best && <span className="ml-1 pill pill-good text-[10px]">{r.best === "lower" ? "lowest" : "highest"}</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
