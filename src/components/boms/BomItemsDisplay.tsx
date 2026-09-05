import { ArrowUpRight, FileCheck2, PackageSearch } from "lucide-react";
import { Link } from "react-router-dom";
import type { BomDetail, BomItem } from "@/shared/builds";
import { bomItemDestination } from "@/lib/bom-item-destination";
import { PartVisual } from "@/components/parts/PartVisual";

export function BomItemsDisplay({ bom, framed = true }: { bom: BomDetail; framed?: boolean }) {
  const currency = bom.version?.currency ?? "USD";
  return (
    <>
      <div className="grid gap-3 md:hidden" role="list" aria-label="BOM parts">
        {bom.items.map((item) => <BomPartCard key={item.id} item={item} bomId={bom.id} currency={currency} />)}
      </div>
      <div className={`hidden overflow-x-auto md:block ${framed ? "surface-card" : ""}`}>
        <table className="data-table min-w-[940px]" aria-label="Bill of materials">
          <thead><tr><th>Part</th><th>Source and identity</th><th>Status</th><th className="text-right">Quantity</th><th className="text-right">Known unit price</th><th className="text-right">Line total</th></tr></thead>
          <tbody>{bom.items.map((item) => {
            const unitMinor = item.targetUnitPriceMinor ?? item.selectedUnitPriceMinor ?? item.lowestUnitPriceMinor;
            return (
              <tr key={item.id} className="group align-top">
                <td className="!px-3 !py-3 md:w-[34%]">
                  <div className="flex items-start gap-2.5"><PartThumbnail item={item} /><div className="min-w-0"><PartLink item={item} bomId={bom.id} /><div className="mt-1 font-mono text-[10px] text-muted-foreground">{item.slotKey}</div>{item.notes && <div className="mt-1 max-w-[460px] text-[11px] leading-4 text-muted-foreground">{item.notes}</div>}</div></div>
                </td>
                <td className="!px-3 !py-3 md:w-[26%]">
                  <div className="font-medium">{item.manufacturerName ?? "Manufacturer unresolved"}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{item.manufacturerPartNumber ?? "MPN unresolved"}</div>
                  <div className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-4 text-muted-foreground"><FileCheck2 className="mt-0.5 h-3 w-3 shrink-0" /><span className="break-words">{item.evidenceLocator ?? "Source evidence missing"}</span></div>
                </td>
                <td className="!px-3 !py-3"><Status item={item} /></td>
                <td className="!px-3 !py-3 text-right font-mono whitespace-nowrap">{item.quantity} {item.unit}</td>
                <td className="!px-3 !py-3 text-right font-mono whitespace-nowrap">{money(unitMinor, currency)}</td>
                <td className="!px-3 !py-3 text-right font-mono font-semibold whitespace-nowrap">{money(unitMinor == null ? null : unitMinor * item.quantity, currency)}</td>
              </tr>
            );
          })}</tbody>
          <tfoot><tr><td colSpan={3} className="px-3 py-3 text-[11px] text-muted-foreground">Known totals only. Unpriced and unresolved lines remain visible.</td><td className="px-3 py-3 text-right font-mono">{bom.totals.units}</td><td /><td className="px-3 py-3 text-right font-mono font-semibold">{money(bom.totals.knownCostMinor, currency)}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}

function BomPartCard({ item, bomId, currency }: { item: BomItem; bomId: string; currency: string }) {
  const unitMinor = item.targetUnitPriceMinor ?? item.selectedUnitPriceMinor ?? item.lowestUnitPriceMinor;
  return (
    <article className="surface-card overflow-hidden" role="listitem">
      <div className="flex items-start gap-3 p-3.5"><PartThumbnail item={item} /><div className="min-w-0"><PartLink item={item} bomId={bomId} /><div className="mt-1 font-mono text-[10px] text-muted-foreground">{item.slotKey}</div></div></div>
      <dl className="grid grid-cols-2 border-t border-border/70 text-[11px]">
        <DataCell label="Manufacturer" value={item.manufacturerName ?? "Unresolved"} />
        <DataCell label="MPN" value={item.manufacturerPartNumber ?? "Unresolved"} mono />
        <DataCell label="Quantity" value={`${item.quantity} ${item.unit}`} mono />
        <DataCell label="Known unit price" value={money(unitMinor, currency)} mono />
      </dl>
      <div className="flex items-start justify-between gap-3 border-t border-border/70 bg-muted/20 px-3.5 py-3">
        <div className="min-w-0"><Status item={item} /><div className="mt-1.5 flex items-start gap-1 text-[10px] leading-4 text-muted-foreground"><FileCheck2 className="mt-0.5 h-3 w-3 shrink-0" /><span className="break-words">{item.evidenceLocator ?? "Source evidence missing"}</span></div></div>
        <div className="shrink-0 text-right"><div className="section-title">Line total</div><div className="mt-0.5 font-mono text-sm font-semibold">{money(unitMinor == null ? null : unitMinor * item.quantity, currency)}</div></div>
      </div>
    </article>
  );
}

function DataCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 border-r border-border/70 px-3.5 py-2.5 odd:last:border-r-0"><dt className="section-title">{label}</dt><dd className={`mt-1 truncate ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}

function PartLink({ item, bomId }: { item: BomItem; bomId: string }) {
  const href = bomItemDestination(bomId, item);
  return (
    <Link to={href} className="inline-flex max-w-full items-start gap-1.5 font-semibold leading-5 text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <PackageSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{item.componentName ?? item.description}</span>
      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

function PartThumbnail({ item }: { item: BomItem }) {
  return <PartVisual compact className="h-12 w-16" part={{
    name: item.componentName ?? item.description,
    category: item.componentCategory ?? "component",
    maker: item.manufacturerName ?? "",
    mpn: item.manufacturerPartNumber,
    files: item.componentImageUrl ? [{
      id: `${item.id}:image`,
      originalName: `${item.componentName ?? item.description}.webp`,
      mediaType: "image/webp",
      sizeBytes: 0,
      purpose: "image",
      contentUrl: item.componentImageUrl,
    }] : [],
  }} />;
}

function Status({ item }: { item: BomItem }) {
  const verified = ["complete", "verified"].includes(item.completeness);
  return <div className="flex max-w-[210px] flex-wrap gap-1"><span className={`pill ${verified ? "pill-good" : "pill-yellow"}`}>{classificationLabel(item.lineClassification)}</span><span className={`pill ${verified ? "pill-good" : "pill-yellow"}`}>{completenessLabel(item.completeness)}</span></div>;
}

function classificationLabel(value: BomItem["lineClassification"]): string {
  if (value === "purchased") return "Commercial component";
  if (value === "fabricated") return "Custom-fabricated part";
  if (value === "optional") return "Optional component";
  if (value === "non-procurement") return "Reference only";
  return "Identity unresolved";
}

function completenessLabel(value: string): string {
  if (value === "complete" || value === "verified") return "Identity verified";
  if (value === "probable") return "Candidate identity";
  if (value === "custom-fabricated") return "Fabrication data available";
  if (value === "non-procurement") return "No purchase required";
  return "Needs identification";
}

function money(minor: number | null, currency: string): string {
  return minor == null ? "Estimate pending" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);
}
