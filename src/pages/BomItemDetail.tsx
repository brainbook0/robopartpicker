import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileCheck2, Fingerprint, PackageSearch, PenLine, Wrench } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageMeta } from "@/components/PageMeta";
import { bomsApi } from "@/lib/api/builds";

export default function BomItemDetail() {
  const { bomId = "", itemId = "" } = useParams();
  const query = useQuery({
    queryKey: ["bom", bomId],
    queryFn: ({ signal }) => bomsApi.get(bomId, signal),
    enabled: Boolean(bomId),
  });
  const bom = query.data?.item;
  const item = bom?.items.find((candidate) => candidate.id === itemId);

  if (query.isLoading) return <div className="mx-auto max-w-[1000px] p-8 text-sm text-muted-foreground">Loading BOM line…</div>;
  if (query.error || !bom) return <div className="mx-auto max-w-[1000px] p-8 text-negative">{query.error?.message ?? "BOM not found."}</div>;
  if (!item) return <div className="mx-auto max-w-[1000px] p-8"><h1 className="text-xl font-bold">BOM line not found</h1><Link to={`/boms/${encodeURIComponent(bom.slug ?? bom.id)}`} className="mt-3 inline-flex text-sm text-primary hover:underline">Return to {bom.name}</Link></div>;

  const unitMinor = item.targetUnitPriceMinor ?? item.selectedUnitPriceMinor ?? item.lowestUnitPriceMinor;
  const rawFields = prettyJson(item.rawFields);
  const locators = parseStringArray(item.aggregatedLocators);
  const exactIdentity = Boolean(item.componentId && item.componentCategory && item.componentSlug);
  const matchingState = exactIdentity
    ? "Matched to an exact catalog component."
    : item.lineClassification === "fabricated"
      ? "Fabricated artifact. A commercial catalog identity is neither expected nor inferred."
      : "Commercial identity unresolved. No manufacturer or part number was guessed from the name or source file.";

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-6">
      <PageMeta title={`${item.componentName ?? item.description}: BOM line | RoboPartPicker`} description={`Inspect source evidence, identity state and estimate status for ${item.componentName ?? item.description}.`} path={`/boms/${bom.id}/items/${item.id}`} />
      <Link to={`/boms/${encodeURIComponent(bom.slug ?? bom.id)}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> {bom.name}</Link>

      <header className="surface-card mt-3 overflow-hidden">
        <div className="grid gap-4 p-4 sm:grid-cols-[72px_minmax(0,1fr)]">
          <div className="grid h-16 w-16 place-items-center border border-primary/30 bg-primary/5 text-primary" aria-hidden="true"><PackageSearch className="h-7 w-7" /></div>
          <div className="min-w-0"><div className="section-title">BOM line · {item.slotKey}</div><h1 className="mt-1 break-words text-xl font-bold">{item.componentName ?? item.description}</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">{matchingState}</p></div>
        </div>
        <dl className="grid border-t border-border sm:grid-cols-2 lg:grid-cols-4">
          <Data label="Classification" value={humanize(item.lineClassification)} />
          <Data label="Quantity" value={`${item.quantity} ${item.unit}`} mono />
          <Data label="Unit estimate" value={money(unitMinor, bom.version?.currency ?? "USD")} mono />
          <Data label="Confidence" value={item.confidence == null ? "Review required" : `${Math.round(item.confidence * 100)}% source confidence`} />
        </dl>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4 min-w-0">
          <section className="surface-card p-4"><h2 className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-4 w-4 text-primary" /> Source trace</h2><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><DataRow label="Primary locator" value={item.evidenceLocator ?? "Source locator review queued"} /><DataRow label="Extraction method" value={humanize(item.extractionMethod)} /><DataRow label="Manufacturer" value={item.manufacturerName ?? "Manufacturer unresolved"} /><DataRow label="Manufacturer part number" value={item.manufacturerPartNumber ?? "MPN unresolved"} /></dl>{locators.length > 0 && <div className="mt-3"><div className="section-title">Contributing locators</div><ul className="mt-1 space-y-1 font-mono text-[11px] text-muted-foreground">{locators.map((locator) => <li key={locator} className="break-all">{locator}</li>)}</ul></div>}</section>

          <section className="surface-card p-4"><h2 className="flex items-center gap-2 font-semibold"><Fingerprint className="h-4 w-4 text-primary" /> Raw imported fields</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Immutable source fields are shown for provenance. Corrections create reviewed overlays rather than deleting the import trace.</p><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all border border-border bg-muted/25 p-3 text-[11px] leading-5">{rawFields}</pre></section>
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="surface-card p-4"><h2 className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-primary" /> Matching status</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{matchingState}</p>{exactIdentity && <Link to={`/parts/${encodeURIComponent(item.componentCategory!)}/${encodeURIComponent(item.componentSlug!)}`} className="btn-primary mt-3 inline-flex w-full justify-center">Open exact component</Link>}</section>
          <section className="border border-primary/35 bg-primary/5 p-4"><h2 className="flex items-center gap-2 font-semibold"><PenLine className="h-4 w-4 text-primary" /> Help identify or correct this line</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Submit the manufacturer, exact part number, fabrication specification, or a better source locator. Community proposals require review before they change the BOM.</p><Link to={`/community?compose=bom-correction&bom=${encodeURIComponent(bom.id)}&item=${encodeURIComponent(item.id)}`} className="btn-primary mt-3 inline-flex w-full justify-center">Propose a correction</Link></section>
        </aside>
      </div>
    </main>
  );
}

function Data({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 border-t border-border px-4 py-3 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"><dt className="section-title">{label}</dt><dd className={`mt-1 break-words text-sm font-semibold ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 border-b border-border/60 pb-2"><dt className="section-title">{label}</dt><dd className="mt-1 break-words text-xs leading-5">{value}</dd></div>;
}

function prettyJson(value: string): string {
  try { return JSON.stringify(JSON.parse(value), null, 2); }
  catch { return value.trim() || "No raw fields were retained."; }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
  } catch { return []; }
}

function money(minor: number | null, currency: string): string {
  return minor == null ? "Estimate pending" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
