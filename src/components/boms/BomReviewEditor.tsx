import { useState } from "react";
import { ExternalLink, Save, X } from "lucide-react";
import { Link } from "react-router-dom";
import { bomsApi } from "@/lib/api/builds";
import type { BomDetail, BomItem } from "@/shared/builds";
import { toast } from "@/hooks/use-toast";

type DraftLine = {
  sourceId: string;
  slotKey: string;
  description: string;
  quantity: string;
  unit: string;
  componentId: string;
  classification: BomItem["lineClassification"];
  included: boolean;
  optional: boolean;
  evidenceLocator: string;
  extractionMethod: string;
  notes: string;
  targetUnitPriceMinor: number | null;
  rawFields: Record<string, unknown>;
  aggregatedLocators: string[];
};

export function BomReviewEditor({ bom, onSaved, onCancel }: { bom: BomDetail; onSaved: () => Promise<unknown>; onCancel: () => void }) {
  const [lines, setLines] = useState<DraftLine[]>(() => bom.items.map(toDraft));
  const [notes, setNotes] = useState("User-reviewed generated BOM");
  const [saving, setSaving] = useState(false);
  const update = (index: number, changes: Partial<DraftLine>) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...changes } : line));
  const save = async () => {
    if (!bom.version) return;
    const invalid = lines.find((line) => line.included && (!(Number(line.quantity) > 0) || !line.description.trim() || !line.unit.trim()));
    if (invalid) { toast({ title: "Fix invalid BOM line", description: `${invalid.description || invalid.slotKey} needs a description, positive quantity, and unit.`, variant: "destructive" }); return; }
    setSaving(true);
    try {
      await bomsApi.createVersion(bom.id, {
        expectedVersionId: bom.version.id,
        notes,
        currency: bom.version.currency,
        items: lines.map((line) => ({
          componentId: line.componentId.trim() || null,
          slotKey: line.slotKey,
          description: line.description.trim(),
          quantity: Number(line.quantity),
          unit: line.unit.trim(),
          targetUnitPriceMinor: line.targetUnitPriceMinor,
          notes: line.notes || null,
          extractionMethod: line.extractionMethod || "explicit-bom",
          completeness: completeness(line),
          evidenceLocator: line.evidenceLocator.trim() || null,
          confidence: completeness(line) === "complete" ? 1 : null,
          lineClassification: line.classification,
          included: line.included,
          optional: line.optional,
          rawFields: line.rawFields,
          aggregatedLocators: line.aggregatedLocators,
        })),
      });
      await onSaved();
      toast({ title: "New BOM version saved", description: "Confirm this version after reviewing its validation blockers." });
    } catch (error) {
      toast({ title: "Could not save BOM version", description: error instanceof Error ? error.message : "Unexpected error.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return <section className="surface-card mt-4 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">Review generated BOM</div><p className="mt-1 text-xs text-muted-foreground">Confirm source-backed quantities and classifications. Commercial lines require an exact catalog component ID. CAD-only lines stay fabricated and are never guessed into catalog parts.</p></div><button className="btn-ghost btn-sm" onClick={onCancel}><X className="h-3.5 w-3.5" /> Close</button></div>
    <label className="mt-3 block text-xs"><span className="section-title">Version note</span><input aria-label="BOM version note" className="input-bare mt-1 w-full" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    <div className="mt-3 space-y-2">{lines.map((line, index) => <div key={line.sourceId} className="grid gap-2 rounded border border-border p-3 lg:grid-cols-[32px_minmax(180px,1.5fr)_100px_90px_150px_minmax(180px,1fr)] lg:items-end">
      <label className="flex h-9 items-center justify-center" title="Include in completed quote"><input aria-label={`Include ${line.description}`} type="checkbox" checked={line.included} onChange={(event) => update(index, { included: event.target.checked })} /></label>
      <label className="text-xs"><span className="section-title">Description</span><input aria-label={`Description for line ${index + 1}`} className="input-bare mt-1 w-full" value={line.description} onChange={(event) => update(index, { description: event.target.value })} /></label>
      <label className="text-xs"><span className="section-title">Quantity</span><input aria-label={`Quantity for ${line.description}`} type="number" min="0.000001" step="any" className="input-bare mt-1 w-full mono" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} /></label>
      <label className="text-xs"><span className="section-title">Unit</span><input aria-label={`Unit for ${line.description}`} className="input-bare mt-1 w-full" value={line.unit} onChange={(event) => update(index, { unit: event.target.value })} /></label>
      <label className="text-xs"><span className="section-title">Classification</span><select aria-label={`Classification for ${line.description}`} className="input-bare mt-1 w-full" value={line.classification} onChange={(event) => update(index, { classification: event.target.value as DraftLine["classification"], optional: event.target.value === "optional" })}>{["purchased", "fabricated", "optional", "non-procurement", "unresolved"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-xs"><span className="flex items-center justify-between gap-2"><span className="section-title">Exact component ID</span><Link target="_blank" to={`/search?q=${encodeURIComponent(line.description)}`} className="text-primary"><ExternalLink className="h-3 w-3" /></Link></span><input aria-label={`Exact component ID for ${line.description}`} className="input-bare mt-1 w-full mono" placeholder={line.classification === "purchased" ? "required" : "not applicable"} value={line.componentId} onChange={(event) => update(index, { componentId: event.target.value })} /></label>
      <label className="text-xs lg:col-start-2 lg:col-span-5"><span className="section-title">Source evidence</span><input aria-label={`Source evidence for ${line.description}`} className="input-bare mt-1 w-full mono" value={line.evidenceLocator} onChange={(event) => update(index, { evidenceLocator: event.target.value })} /></label>
    </div>)}</div>
    <div className="mt-3 flex justify-end"><button onClick={() => void save()} disabled={saving} className="btn-primary inline-flex items-center gap-1"><Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save reviewed version"}</button></div>
  </section>;
}

function toDraft(item: BomItem): DraftLine {
  return {
    sourceId: item.id, slotKey: item.slotKey, description: item.description, quantity: String(item.quantity), unit: item.unit,
    componentId: item.componentId ?? "", classification: item.lineClassification ?? "unresolved", included: item.included !== 0,
    optional: item.optional === 1, evidenceLocator: item.evidenceLocator ?? "", extractionMethod: item.extractionMethod,
    notes: item.notes ?? "", targetUnitPriceMinor: item.targetUnitPriceMinor, rawFields: parseObject(item.rawFields),
    aggregatedLocators: parseArray(item.aggregatedLocators),
  };
}
function completeness(line: DraftLine): string {
  if (line.classification === "non-procurement") return "non-procurement";
  if (line.classification === "fabricated") return line.evidenceLocator ? "custom-fabricated" : "unresolved";
  return line.componentId.trim() && line.evidenceLocator.trim() ? "complete" : "unresolved";
}
function parseObject(value: string): Record<string, unknown> { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function parseArray(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
