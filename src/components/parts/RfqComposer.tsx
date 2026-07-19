import { useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";
import {
  validateRfqInput, saveRfqDraft, deleteRfqDraft, rfqDraftToText, copyText,
  type RfqDraft, type RfqInput,
} from "@/lib/catalogWorkspace";
import { useComponents, useSuppliers } from "@/lib/api/catalog";
import { Copy, Save, Trash2 } from "lucide-react";

type Props = {
  /** Optional existing draft to edit. */
  draftId?: string;
  /** Prefill values for a fresh draft. */
  prefill?: Partial<RfqInput>;
  /** If provided, restricts the supplier selector to a single supplier (used on Supplier Detail). */
  lockSupplierId?: string;
  /** Optional list of catalog part ids the composer should offer in a "this supplier's products" picker. */
  supplierProductPartIds?: string[];
  onSaved?: (d: RfqDraft) => void;
  onDeleted?: () => void;
  compact?: boolean;
  /** Anchor id for the outer element (for scroll-to). */
  anchorId?: string;
};

export function RfqComposer({ draftId, prefill, lockSupplierId, supplierProductPartIds, onSaved, onDeleted, compact, anchorId }: Props) {
  const suppliersQuery = useSuppliers();
  const partsQuery = useComponents({ supplier: lockSupplierId ? [lockSupplierId] : undefined, limit: 100 }, Boolean(supplierProductPartIds?.length));
  const suppliers = suppliersQuery.data?.items ?? [];
  const initial: RfqInput = useMemo(() => ({
    partId: prefill?.partId ?? null,
    manualPartName: prefill?.manualPartName ?? (prefill?.partId ? null : null),
    supplierId: lockSupplierId ?? prefill?.supplierId ?? null,
    quantity: prefill?.quantity && prefill.quantity > 0 ? prefill.quantity : 1,
    targetLeadDays: prefill?.targetLeadDays ?? null,
    requirements: prefill?.requirements ?? "",
  }), [prefill, lockSupplierId]);

  const [state, setState] = useState<RfqInput>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedDraft, setSavedDraft] = useState<RfqDraft | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(draftId);

  const supplier = state.supplierId ? suppliers.find(s => s.id === state.supplierId) : undefined;

  const partOptions = useMemo(() => {
    if (supplierProductPartIds && supplierProductPartIds.length) {
      return (partsQuery.data?.items ?? []).filter(p => supplierProductPartIds.includes(p.id));
    }
    return [];
  }, [partsQuery.data?.items, supplierProductPartIds]);

  const set = <K extends keyof RfqInput>(k: K, v: RfqInput[K]) => setState(prev => ({ ...prev, [k]: v }));

  const doSave = () => {
    const v = validateRfqInput(state);
    if (v.ok === false) { setErrors(v.errors); return; }
    setErrors([]);
    const d = saveRfqDraft(v.value, currentDraftId);
    setCurrentDraftId(d.id);
    setSavedDraft(d);
    onSaved?.(d);
    toast({ title: currentDraftId ? "Local RFQ draft updated" : "Local RFQ draft saved", description: "Draft stored in this browser only. Nothing has been sent." });
  };

  const doCopy = async () => {
    const v = validateRfqInput(state);
    if (v.ok === false) { setErrors(v.errors); return; }
    const draft = savedDraft ?? saveRfqDraft(v.value, currentDraftId);
    setCurrentDraftId(draft.id);
    setSavedDraft(draft);
    const ok = await copyText(rfqDraftToText(draft, supplier?.name));
    toast({
      title: ok ? "RFQ text copied" : "Copy failed",
      description: ok ? "Local draft text copied to clipboard. Nothing has been sent." : "Clipboard not available.",
      variant: ok ? undefined : "destructive",
    });
  };

  const doDelete = () => {
    if (!currentDraftId) return;
    deleteRfqDraft(currentDraftId);
    setCurrentDraftId(undefined);
    setSavedDraft(null);
    onDeleted?.();
    toast({ title: "Local RFQ draft removed" });
  };

  return (
    <div id={anchorId} className={compact ? "space-y-2" : "space-y-3"}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-muted-foreground">
          Part
          {partOptions.length > 0 ? (
            <select
              className="input-bare mt-1"
              value={state.partId ?? ""}
              onChange={e => {
                const id = e.target.value || null;
                setState(prev => ({ ...prev, partId: id }));
              }}
            >
              <option value="">— select from this supplier's catalog —</option>
              {partOptions.map(p => <option key={p.id} value={p.id}>{p.name} · {p.maker}</option>)}
            </select>
          ) : (
            <input className="input-bare mt-1" value={state.manualPartName ?? ""} onChange={e => set("manualPartName", e.target.value || null)} placeholder="Part name / MPN" aria-label="Part name" />
          )}
        </label>
        <label className="text-[11px] text-muted-foreground">
          Supplier
          {lockSupplierId ? (
            <input className="input-bare mt-1" value={supplier?.name ?? state.supplierId ?? ""} readOnly aria-readonly />
          ) : (
            <select className="input-bare mt-1" value={state.supplierId ?? ""} onChange={e => set("supplierId", e.target.value || null)}>
              <option value="">— any supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} · {s.region}</option>)}
            </select>
          )}
        </label>
        {partOptions.length > 0 && (
          <label className="text-[11px] text-muted-foreground sm:col-span-2">
            Or manual part name
            <input className="input-bare mt-1" value={state.manualPartName ?? ""} onChange={e => set("manualPartName", e.target.value || null)} placeholder="Fallback if not in catalog" />
          </label>
        )}
        <label className="text-[11px] text-muted-foreground">
          Quantity
          <input type="number" min={1} className="input-bare mt-1 mono" value={state.quantity}
                 onChange={e => set("quantity", Number(e.target.value) || 0)} aria-label="Quantity" />
        </label>
        <label className="text-[11px] text-muted-foreground">
          Target lead (days, optional)
          <input type="number" min={0} className="input-bare mt-1 mono" value={state.targetLeadDays ?? ""}
                 onChange={e => set("targetLeadDays", e.target.value === "" ? null : Number(e.target.value))}
                 aria-label="Target lead days" />
        </label>
      </div>
      <label className="block text-[11px] text-muted-foreground">
        Requirements / notes
        <textarea className="input-bare mt-1 h-20" value={state.requirements}
                  onChange={e => set("requirements", e.target.value)}
                  placeholder="Test report required, voltage spec, certifications, integration constraints…" />
      </label>
      {errors.length > 0 && (
        <ul role="alert" className="text-[11px] text-negative list-disc pl-4">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={doSave} className="btn-primary btn-sm inline-flex items-center gap-1"><Save className="h-3.5 w-3.5" /> {currentDraftId ? "Update draft" : "Save local draft"}</button>
        <button type="button" onClick={doCopy} className="btn-ghost btn-sm inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy RFQ text</button>
        {currentDraftId && (
          <button type="button" onClick={doDelete} className="btn-ghost btn-sm inline-flex items-center gap-1 text-negative"><Trash2 className="h-3.5 w-3.5" /> Delete draft</button>
        )}
        <span className="text-[10.5px] uppercase tracking-wide text-warning ml-auto">Not sent · local only</span>
      </div>
      {savedDraft && (
        <div className="text-[10.5px] text-muted-foreground">
          Draft <span className="mono">{savedDraft.id}</span> · updated <span className="mono">{new Date(savedDraft.updatedAt).toLocaleString()}</span>. Stored in this browser only.
        </div>
      )}
    </div>
  );
}
