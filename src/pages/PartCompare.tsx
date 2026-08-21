import { Link, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { categoryLabel, lowestObservedPrice, type CatalogPart } from "@/shared/catalog";
import { api } from "@/lib/api/client";
import { COMPARE_CAP, removeFromCompare, clearCompare, copyText } from "@/lib/catalogWorkspace";
import { toast } from "@/hooks/use-toast";
import { Copy, Trash2, X, ExternalLink, Plus, ChevronLeft } from "lucide-react";

const CORE_FIELDS = new Set([
  "id", "slug", "category", "name", "mpn", "maker", "makerCountry", "region", "blurb", "tags",
  "openSource", "datasheetUrl", "cadAvailable", "rosSupport", "warrantyMonths", "priceHistory", "offers",
  "failures", "compatibility", "provenanceLabel", "freshnessAt", "isDemo",
]);

const SPEC_LABELS: Record<string, string> = {
  peakNm: "Peak torque (Nm)", contNm: "Continuous torque (Nm)", speedRpm: "Maximum speed (RPM)",
  voltageV: "Voltage (V)", weightKg: "Weight (kg)", torqueDensity: "Torque density (Nm/kg)",
  backlashArcmin: "Backlash (arcmin)", encoderType: "Encoder", protocol: "Protocol", protocols: "Protocols",
  thermalLimitC: "Thermal limit (°C)", dutyCyclePct: "Duty cycle (%)", dof: "Degrees of freedom",
  actuatedDof: "Actuated degrees of freedom", payloadKg: "Payload (kg)", gripForceN: "Grip force (N)",
  tactile: "Tactile sensing", interface: "Interface", sdk: "SDK", type: "Type", rangeM: "Range (m)",
  fovDeg: "Field of view (°)", hz: "Frame rate (Hz)", resolution: "Resolution", tops: "AI TOPS",
  ramGb: "Memory (GB)", storageGb: "Storage (GB)", ports: "Ports", powerW: "Power (W)",
  maxCurrentA: "Maximum current (A)", ratio: "Ratio", ratedTorqueNm: "Rated torque (Nm)",
  peakTorqueNm: "Peak torque (Nm)",
};

const titleCase = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const categoryTitle = (category: string) => categoryLabel[category] ?? titleCase(category);
const liveOffers = (part: CatalogPart) => part.offers.filter((offer) => !offer.isDemo);

const minKnownLead = (part: CatalogPart): number | null => {
  const values = liveOffers(part).filter((offer) => offer.leadKnown).map((offer) => offer.leadDays);
  return values.length ? Math.min(...values) : null;
};

const totalKnownStock = (part: CatalogPart): number | null => {
  const values = liveOffers(part).filter((offer) => offer.stockKnown).map((offer) => offer.stock);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};

type Row = {
  key: string;
  label: string;
  values: Array<string | number | null>;
  best?: "lower" | "higher";
  mono?: boolean;
  hint?: string;
};

function normalizeSpecValue(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    const entries = value.filter((entry) => typeof entry === "string" || typeof entry === "number").map(String);
    return entries.length ? entries.join(", ") : null;
  }
  return null;
}

function sourceSpecRows(parts: CatalogPart[]): Row[] {
  const keys = new Set<string>();
  parts.forEach((part) => Object.entries(part).forEach(([key, value]) => {
    if (!CORE_FIELDS.has(key) && normalizeSpecValue(value) != null) keys.add(key);
  }));
  return [...keys].sort().slice(0, 30).map((key) => ({
    key: `spec:${key}`,
    label: SPEC_LABELS[key] ?? titleCase(key),
    values: parts.map((part) => normalizeSpecValue(part[key])),
    mono: parts.every((part) => normalizeSpecValue(part[key]) == null || typeof normalizeSpecValue(part[key]) === "number"),
  }));
}

function baseRows(parts: CatalogPart[]): Row[] {
  return [
    { key: "mpn", label: "Manufacturer part number", values: parts.map((part) => part.mpn ?? null), mono: true },
    { key: "maker", label: "Manufacturer", values: parts.map((part) => part.maker || null) },
    { key: "region", label: "Primary region", values: parts.map((part) => part.region || null) },
    { key: "price", label: "Lowest observed price", values: parts.map(lowestObservedPrice), best: "lower", mono: true, hint: "Authentic, non-demo positive-priced offers only." },
    { key: "lead", label: "Shortest known lead (days)", values: parts.map(minKnownLead), best: "lower", mono: true },
    { key: "stock", label: "Known stock across offers", values: parts.map(totalKnownStock), best: "higher", mono: true },
    { key: "offers", label: "Authentic offers", values: parts.map((part) => liveOffers(part).length), best: "higher", mono: true },
    { key: "links", label: "Direct product links", values: parts.map((part) => liveOffers(part).filter((offer) => Boolean(offer.productUrl)).length), best: "higher", mono: true },
    { key: "suppliers", label: "Suppliers", values: parts.map((part) => [...new Set(liveOffers(part).map((offer) => offer.supplierName))].join(", ") || null) },
    { key: "compat", label: "Usage and integration tags", values: parts.map((part) => part.compatibility.join(", ") || null), hint: "Tags are not a drop-in compatibility guarantee." },
    { key: "provenance", label: "Provenance", values: parts.map((part) => part.provenanceLabel || null) },
  ];
}

function bestIndex(values: Array<string | number | null>, direction?: "lower" | "higher"): number | null {
  if (!direction) return null;
  const numeric = values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : null);
  if (numeric.some((value) => value == null)) return null;
  const numbers = numeric as number[];
  const target = direction === "lower" ? Math.min(...numbers) : Math.max(...numbers);
  if (numbers.filter((value) => value === target).length !== 1) return null;
  return numbers.indexOf(target);
}

function rowsToCsv(header: string[], rows: Row[]): string {
  const escape = (input: unknown) => {
    const value = input == null ? "" : String(input);
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return [header.map(escape).join(","), ...rows.map((row) => [row.label, ...row.values].map(escape).join(","))].join("\n");
}

export default function PartCompare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawIds = (searchParams.get("ids") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of rawIds) {
    if (!seen.has(id)) { seen.add(id); ids.push(id); }
    if (ids.length >= COMPARE_CAP) break;
  }

  const componentQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["catalog-component", id],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<{ item: CatalogPart }>(`/api/v1/components/${encodeURIComponent(id)}`, { signal }),
      retry: false,
      staleTime: 30_000,
    })),
  });

  const resolved = ids.map((id, index) => ({ id, part: componentQueries[index]?.data?.item }));
  const missing = resolved.filter((row, index) => componentQueries[index]?.isError && !row.part).map((row) => row.id);
  const published = resolved.map((row) => row.part).filter((part): part is CatalogPart => Boolean(part && !part.isDemo));
  const loading = componentQueries.some((query) => query.isPending);
  const primaryCategory = published[0]?.category ?? null;
  const compatible = primaryCategory ? published.filter((part) => part.category === primaryCategory) : [];
  const mixed = published.length !== compatible.length;
  const rows = compatible.length ? [...sourceSpecRows(compatible), ...baseRows(compatible)] : [];

  const removeOne = (id: string) => {
    const next = compatible.filter((part) => part.id !== id).map((part) => part.id);
    removeFromCompare(id);
    setSearchParams(next.length ? new URLSearchParams({ ids: next.join(",") }) : new URLSearchParams(), { replace: true });
  };

  const clearAll = () => {
    clearCompare();
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const share = async () => {
    const url = `${window.location.origin}/parts/compare?ids=${compatible.map((part) => part.id).join(",")}`;
    const copied = await copyText(url);
    toast({ title: copied ? "Compare URL copied" : "Copy failed", description: copied ? url : "Clipboard not available.", variant: copied ? undefined : "destructive" });
  };

  const exportCsv = () => {
    if (!compatible.length) return;
    const csv = rowsToCsv(["Metric", ...compatible.map((part) => `${part.name} (${part.maker})`)], rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `compare-${compatible.map((part) => part.slug).join("-")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="mb-1 text-[12px] text-muted-foreground">
        <Link to={primaryCategory ? `/parts/${primaryCategory}` : "/parts/actuator"} className="inline-flex items-center gap-1 hover:text-primary"><ChevronLeft className="h-3 w-3" />Catalog</Link>
        {" / "}<span className="text-foreground">Component comparison</span>
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Component comparison</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Same-category source observations · up to {COMPARE_CAP} components{primaryCategory ? ` · ${categoryTitle(primaryCategory)}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={share} disabled={!compatible.length} className="btn-ghost btn-sm inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy share URL</button>
          <button onClick={exportCsv} disabled={!compatible.length} className="btn-ghost btn-sm inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" /> Export CSV</button>
          <button onClick={clearAll} disabled={!compatible.length} className="btn-ghost btn-sm inline-flex items-center gap-1 text-negative"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
        </div>
      </div>

      <div className="surface-card mt-3 px-3 py-2 text-[11.5px] text-muted-foreground">
        <span className="font-medium text-foreground">Authentic records only.</span> Demo fixtures are excluded. Unknown specifications, prices, stock, and lead times stay blank. Comparison does not prove mechanical fit, electrical compatibility, firmware readiness, or supplier availability.
      </div>

      {mixed && <div className="surface-card mt-2 border-warning/40 bg-warning/5 px-3 py-2 text-[11.5px] text-warning">Components outside {primaryCategory ? categoryTitle(primaryCategory) : "the first selected category"} were excluded because comparison is same-category only.</div>}
      {missing.length > 0 && <div className="surface-card mt-2 border-warning/40 bg-warning/5 px-3 py-2 text-[11.5px] text-warning">Unknown or unavailable component id(s): <span className="mono">{missing.join(", ")}</span></div>}

      {loading ? (
        <div className="surface-card mt-4 p-6 text-center text-[13px] text-muted-foreground" role="status">Loading selected components from the API…</div>
      ) : !compatible.length ? (
        <div className="surface-card mt-4 p-6 text-center text-[13px] text-muted-foreground">No published components selected. Add components from the <Link to="/parts/actuator" className="text-primary hover:underline">catalog</Link>.</div>
      ) : (
        <div className="surface-card mt-3 overflow-x-auto">
          <table className="data-table min-w-[900px]">
            <thead><tr><th className="w-[220px]">Metric</th>{compatible.map((part) => <th key={part.id} className="min-w-[200px]">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/parts/${part.category}/${part.slug}`} className="font-medium leading-tight hover:text-primary">{part.name}</Link>
                <button aria-label={`Remove ${part.name} from comparison`} onClick={() => removeOne(part.id)} className="text-muted-foreground hover:text-negative"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="text-[11px] font-normal text-muted-foreground">{part.maker}{part.mpn ? ` · ${part.mpn}` : ""}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Link to={`/builder?add=${encodeURIComponent(part.id)}`} className="btn-ghost btn-sm inline-flex items-center gap-1"><Plus className="h-3 w-3" /> BOM</Link>
                <Link to={`/parts/${part.category}/${part.slug}`} className="btn-ghost btn-sm">Detail →</Link>
              </div>
            </th>)}</tr></thead>
            <tbody>{rows.map((row) => {
              const best = bestIndex(row.values, row.best);
              return <tr key={row.key}>
                <td className="align-top text-[12px] text-muted-foreground">{row.label}{row.hint && <div className="mt-0.5 text-[10.5px] italic">{row.hint}</div>}</td>
                {row.values.map((value, index) => <td key={index} className={`${row.mono ? "mono" : ""} ${best === index ? "font-semibold text-[hsl(var(--positive))]" : ""}`}>
                  {value == null ? <span className="text-muted-foreground">—</span> : String(value)}
                  {best === index && row.best && <span className="pill pill-good ml-1 text-[10px]">{row.best === "lower" ? "lowest" : "highest"}</span>}
                </td>)}
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
