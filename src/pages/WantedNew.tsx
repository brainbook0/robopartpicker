import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Save, FileJson } from "lucide-react";
import {
  copyToClipboard,
  getWantedDraft,
  saveWantedDraft,
  updateWantedDraft,
  type WantedDraft,
} from "@/lib/marketplaceDrafts";

type Category = WantedDraft["partCategory"];
type Region = WantedDraft["region"];

const categories: Category[] = ["actuator", "hand", "sensor", "compute", "driver", "reducer"];
const regions: Region[] = ["Any", "US", "EU", "CN", "JP", "KR"];

export default function WantedNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draftId = params.get("draft");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [missingDraftNote, setMissingDraftNote] = useState(false);
  const [partName, setPartName] = useState("");
  const [category, setCategory] = useState<Category>("actuator");
  const [qty, setQty] = useState(1);
  const [maxBudget, setMaxBudget] = useState(1000);
  const [region, setRegion] = useState<Region>("Any");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!draftId) { setEditingId(null); setMissingDraftNote(false); return; }
    const existing = getWantedDraft(draftId);
    if (!existing) {
      setEditingId(null);
      setMissingDraftNote(true);
      toast.error("Local draft not found", {
        description: "Starting a new blank draft instead.",
      });
      return;
    }
    setEditingId(existing.id);
    setMissingDraftNote(false);
    setPartName(existing.partName);
    setCategory(existing.partCategory);
    setQty(existing.qty);
    setMaxBudget(existing.maxBudget);
    setRegion(existing.region);
    setNotes(existing.notes);
  }, [draftId]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!partName.trim()) e.partName = "Required";
    if (!Number.isInteger(qty) || qty < 1) e.qty = "Positive integer";
    if (!Number.isFinite(maxBudget) || maxBudget <= 0) e.maxBudget = "Must be > 0";
    return e;
  }, [partName, qty, maxBudget]);
  const valid = Object.keys(errors).length === 0;
  const perUnit = qty > 0 ? maxBudget / qty : 0;

  const draft = (): Omit<WantedDraft, "id" | "createdAt"> => ({
    partCategory: category,
    partName: partName.trim(),
    qty,
    maxBudget,
    region,
    notes: notes.trim(),
  });

  const saveLocal = () => {
    if (!valid) { toast.error("Fix the highlighted fields first"); return; }
    if (editingId) {
      const updated = updateWantedDraft(editingId, draft());
      if (!updated) {
        saveWantedDraft(draft());
        toast.success("Draft saved locally as a new entry", {
          description: "Original draft was no longer present.",
        });
      } else {
        toast.success("Local wanted draft updated", {
          description: "Saved only in this browser. Not published to other users.",
        });
      }
    } else {
      saveWantedDraft(draft());
      toast.success("Wanted draft saved locally", {
        description: "Saved only in this browser. Not published to other users.",
      });
    }
    navigate("/marketplace?tab=wanted");
  };

  const brief = () =>
`Wanted — ${partName || "<part name>"}
Category: ${category} · Region: ${region}
Quantity: ${qty} · Max total budget: $${maxBudget.toLocaleString()} (~$${perUnit.toFixed(0)} / unit)

Requirements:
${notes.trim() || "<add condition, test evidence, lead-time, and shipping requirements here>"}

Contact: <your email or handle>
`;

  const copyJson = async () => {
    const ok = await copyToClipboard(JSON.stringify(draft(), null, 2));
    toast[ok ? "success" : "error"](ok ? "Draft JSON copied" : "Copy failed");
  };
  const copyBrief = async () => {
    const ok = await copyToClipboard(brief());
    toast[ok ? "success" : "error"](ok ? "Outreach brief copied" : "Copy failed", {
      description: ok ? "Nothing was sent. Paste it into your own outreach channels." : undefined,
    });
  };

  return (
    <div className="mx-auto max-w-[860px] px-4 py-8">
      <div className="text-[12px] text-muted-foreground">
        <Link to="/marketplace" className="hover:text-primary">Marketplace</Link> / Wanted / New
      </div>
      <h1 className="text-[22px] font-bold tracking-tight">
        {editingId ? "Edit local wanted draft" : "Draft a wanted request"}
      </h1>
      <p className="text-[13px] text-muted-foreground mt-1">
        {editingId
          ? "Editing an existing wanted draft stored only in this browser. Save will update the same draft — nothing is published."
          : "Describe the part, quantity, budget, and region. Drafts are saved only in this browser — nothing is published to other users yet."}
      </p>
      {missingDraftNote && (
        <div className="mt-3 surface-card p-2 text-[12px] text-muted-foreground border-[hsl(var(--warning)/0.4)]">
          The requested draft was not found in this browser. You are starting a new blank draft.
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
        <form className="surface-card p-4 space-y-3 text-[13px]" onSubmit={(e) => { e.preventDefault(); saveLocal(); }}>
          <Field label="Part name" error={errors.partName}>
            <input className="input-bare" value={partName} onChange={(e) => setPartName(e.target.value)} placeholder="e.g. RMD-X8 Pro or equivalent" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select className="input-bare" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Region">
              <select className="input-bare" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" error={errors.qty}>
              <input className="input-bare mono" type="number" min={1} step={1} value={qty}
                onChange={(e) => setQty(parseInt(e.target.value || "0", 10))} />
            </Field>
            <Field label="Max total budget (USD)" error={errors.maxBudget}>
              <input className="input-bare mono" type="number" min={0} value={maxBudget}
                onChange={(e) => setMaxBudget(parseFloat(e.target.value || "0"))} />
            </Field>
          </div>
          <Field label="Notes / requirements">
            <textarea className="input-bare h-28 py-1" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Test report required, lead-time tolerance, acceptable condition grades, shipping constraints…" />
          </Field>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" className="btn-primary" disabled={!valid}>
              <Save className="h-3.5 w-3.5" /> {editingId ? "Update local draft" : "Save locally"}
            </button>
            <button type="button" onClick={copyBrief} className="btn-ghost">
              <Copy className="h-3.5 w-3.5" /> Copy outreach brief
            </button>
            <button type="button" onClick={copyJson} className="btn-ghost">
              <FileJson className="h-3.5 w-3.5" /> Copy JSON
            </button>
            <Link to="/marketplace" className="btn-ghost ml-auto">Cancel</Link>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Saving stores this draft in your browser only. It is not visible to other users or sellers.
          </div>
        </form>

        <aside className="surface-card p-3 text-[12px] space-y-2 h-fit lg:sticky lg:top-4">
          <div className="section-title">Draft summary</div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Category</span><span className="mono">{category}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Region</span><span className="mono">{region}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Quantity</span><span className="mono">{qty}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Total budget</span><span className="mono font-semibold">${(maxBudget || 0).toLocaleString()}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Per unit</span><span className="mono">${perUnit.toFixed(0)}</span>
          </div>
          <div className="rounded border border-border bg-surface p-2 text-[11px] text-muted-foreground">
            Local draft only. Nothing is published or sent.
          </div>
        </aside>
      </div>
    </div>
  );
}

const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <label className="block">
    <div className="flex items-baseline justify-between mb-1">
      <span className="section-title">{label}</span>
      {error && <span className="text-[10px] text-negative">{error}</span>}
    </div>
    {children}
  </label>
);
