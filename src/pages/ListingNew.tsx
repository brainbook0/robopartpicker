import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Copy, Save, FileJson } from "lucide-react";
import { parts, partById } from "@/data/parts";
import type { ConditionGrade } from "@/data/listings";
import {
  copyToClipboard,
  getListingDraft,
  saveListingDraft,
  updateListingDraft,
  type ListingDraft,
} from "@/lib/marketplaceDrafts";

type Region = ListingDraft["region"];
const grades: ConditionGrade[] = ["A", "B", "C", "Untested", "ForParts"];
const regions: Region[] = ["US", "EU", "CN", "JP", "KR"];

export default function ListingNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draftId = params.get("draft");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [missingDraftNote, setMissingDraftNote] = useState(false);
  const [partId, setPartId] = useState<string>(parts[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState<ConditionGrade>("B");
  const [runtimeStr, setRuntimeStr] = useState<string>("");
  const [price, setPrice] = useState(500);
  const [region, setRegion] = useState<Region>("US");
  const [hasTestReport, setHasTestReport] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [returnsAccepted, setReturnsAccepted] = useState(false);
  const [escrowEligible, setEscrowEligible] = useState(false);
  const [serialVerified, setSerialVerified] = useState(false);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [notes, setNotes] = useState("");

  // Hydrate from an existing local draft when ?draft=<id> is present.
  useEffect(() => {
    if (!draftId) { setEditingId(null); setMissingDraftNote(false); return; }
    const existing = getListingDraft(draftId);
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
    setPartId(existing.partId);
    setTitle(existing.title);
    setGrade(existing.grade);
    setRuntimeStr(existing.runtimeHours === null ? "" : String(existing.runtimeHours));
    setPrice(existing.price);
    setRegion(existing.region);
    setHasTestReport(existing.hasTestReport);
    setHasVideo(existing.hasVideo);
    setReturnsAccepted(existing.returnsAccepted);
    setEscrowEligible(existing.escrowEligible);
    setSerialVerified(existing.serialVerified);
    setIdentityVerified(existing.identityVerified);
    setNotes(existing.notes);
  }, [draftId]);

  const runtimeHours = runtimeStr.trim() === "" ? null : Number(runtimeStr);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!partId) e.partId = "Pick a part";
    if (!title.trim()) e.title = "Required";
    if (!Number.isFinite(price) || price <= 0) e.price = "Must be > 0";
    if (runtimeStr.trim() !== "") {
      if (!/^\d+$/.test(runtimeStr.trim())) e.runtime = "Nonnegative integer or blank";
    }
    if (grade === "Untested" && hasTestReport) e.report = "Untested cannot have a test report";
    return e;
  }, [partId, title, price, runtimeStr, grade, hasTestReport]);
  const valid = Object.keys(errors).length === 0;

  const part = partById(partId);

  const evidenceCount =
    Number(hasTestReport) + Number(hasVideo) + Number(returnsAccepted) +
    Number(escrowEligible) + Number(serialVerified) + Number(identityVerified);

  const draft = (): Omit<ListingDraft, "id" | "createdAt"> => ({
    partId, title: title.trim(), grade, runtimeHours, price, region,
    hasTestReport, hasVideo, returnsAccepted, escrowEligible,
    serialVerified, identityVerified, notes: notes.trim(),
  });

  const saveLocal = () => {
    if (!valid) { toast.error("Fix the highlighted fields first"); return; }
    if (editingId) {
      const updated = updateListingDraft(editingId, draft());
      if (!updated) {
        saveListingDraft(draft());
        toast.success("Draft saved locally as a new entry", {
          description: "Original draft was no longer present.",
        });
      } else {
        toast.success("Local draft updated", {
          description: "Saved only in this browser. Not published to other users.",
        });
      }
    } else {
      saveListingDraft(draft());
      toast.success("Listing draft saved locally", {
        description: "Saved only in this browser. Not published to other users.",
      });
    }
    navigate("/marketplace");
  };

  const brief = () =>
`Listing draft — ${title || "<title>"}
Part: ${part ? `${part.name} (${part.maker})` : partId}
Grade: ${grade} · Region: ${region} · Runtime: ${runtimeHours ?? "unknown"}h
Asking: $${price.toLocaleString()}

Seller-provided evidence (${evidenceCount}/6):
  ${hasTestReport ? "[x]" : "[ ]"} Bench test report attached
  ${hasVideo ? "[x]" : "[ ]"} Video proof available
  ${returnsAccepted ? "[x]" : "[ ]"} Returns accepted
  ${escrowEligible ? "[x]" : "[ ]"} Willing to use escrow
  ${serialVerified ? "[x]" : "[ ]"} Serial number ready to verify
  ${identityVerified ? "[x]" : "[ ]"} Seller identity verifiable

Notes:
${notes.trim() || "<add provenance, cosmetic notes, packaging details>"}

Contact: <your email or handle>
`;

  const copyJson = async () => {
    const ok = await copyToClipboard(JSON.stringify(draft(), null, 2));
    toast[ok ? "success" : "error"](ok ? "Draft JSON copied" : "Copy failed");
  };
  const copyBrief = async () => {
    const ok = await copyToClipboard(brief());
    toast[ok ? "success" : "error"](ok ? "Outreach brief copied" : "Copy failed", {
      description: ok ? "Nothing was sent. Paste it into your own channels." : undefined,
    });
  };

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8">
      <div className="text-[12px] text-muted-foreground">
        <Link to="/marketplace" className="hover:text-primary">Marketplace</Link> / Listings / New
      </div>
      <h1 className="text-[22px] font-bold tracking-tight">
        {editingId ? "Edit local listing draft" : "Draft a listing"}
      </h1>
      <p className="text-[13px] text-muted-foreground mt-1">
        {editingId
          ? "Editing an existing draft stored only in this browser. Save will update the same draft — nothing is published."
          : "Prepare a listing draft mapped to the same fields the marketplace surfaces. Drafts are saved only in this browser — nothing is published to other users yet."}
      </p>
      {missingDraftNote && (
        <div className="mt-3 surface-card p-2 text-[12px] text-muted-foreground border-[hsl(var(--warning)/0.4)]">
          The requested draft was not found in this browser. You are starting a new blank draft.
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_300px]">
        <form className="surface-card p-4 space-y-3 text-[13px]" onSubmit={(e) => { e.preventDefault(); saveLocal(); }}>
          <fieldset className="space-y-3">
            <legend className="section-title">Identity</legend>
            <Field label="Catalog part" error={errors.partId}>
              <select className="input-bare" value={partId} onChange={(e) => setPartId(e.target.value)}>
                {parts.map(p => <option key={p.id} value={p.id}>{p.name} — {p.maker} ({p.category})</option>)}
              </select>
            </Field>
            <Field label="Listing title" error={errors.title}>
              <input className="input-bare" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. RMD-X8 Pro — 110h lab use, includes cables" />
            </Field>
          </fieldset>

          <fieldset className="space-y-3 pt-2 border-t border-border/60">
            <legend className="section-title">Condition &amp; commercial</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Condition grade">
                <select className="input-bare" value={grade} onChange={(e) => setGrade(e.target.value as ConditionGrade)}>
                  {grades.map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
              </Field>
              <Field label="Runtime hours (blank if unknown)" error={errors.runtime}>
                <input className="input-bare mono" inputMode="numeric" value={runtimeStr}
                  onChange={(e) => setRuntimeStr(e.target.value)} placeholder="e.g. 120" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Asking price (USD)" error={errors.price}>
                <input className="input-bare mono" type="number" min={0} value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value || "0"))} />
              </Field>
              <Field label="Region">
                <select className="input-bare" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
                  {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-2 pt-2 border-t border-border/60">
            <legend className="section-title">Evidence checklist ({evidenceCount}/6)</legend>
            <div className="grid gap-1 sm:grid-cols-2 text-[12.5px]">
              <Check label="Bench test report attached" checked={hasTestReport} onChange={setHasTestReport} />
              <Check label="Video proof available" checked={hasVideo} onChange={setHasVideo} />
              <Check label="Returns accepted" checked={returnsAccepted} onChange={setReturnsAccepted} />
              <Check label="Willing to use escrow" checked={escrowEligible} onChange={setEscrowEligible} />
              <Check label="Serial number ready to verify" checked={serialVerified} onChange={setSerialVerified} />
              <Check label="Seller identity verifiable" checked={identityVerified} onChange={setIdentityVerified} />
            </div>
            {errors.report && <div className="text-[11px] text-negative">{errors.report}</div>}
            <div className="text-[11px] text-muted-foreground">
              These flags describe the evidence a real buyer would ask for. They are seller-declared —
              nothing is verified by RoboPartPicker.
            </div>
          </fieldset>

          <fieldset className="space-y-2 pt-2 border-t border-border/60">
            <legend className="section-title">Notes</legend>
            <textarea className="input-bare h-24 py-1" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Cosmetic condition, cables/accessories included, known issues, packaging, pickup vs ship, etc." />
          </fieldset>

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
            Saving stores this draft in your browser only. It is not visible to other users.
          </div>
        </form>

        <aside className="surface-card p-3 text-[12px] space-y-2 h-fit lg:sticky lg:top-4">
          <div className="section-title">Draft summary</div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Part</span>
            <span className="mono truncate max-w-[180px]" title={part?.name ?? partId}>{part?.name ?? partId}</span>
          </div>
          <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Grade</span><span className="mono">{grade}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Region</span><span className="mono">{region}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Runtime</span><span className="mono">{runtimeHours !== null ? `${runtimeHours}h` : "—"}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Price</span><span className="mono font-semibold">${(price || 0).toLocaleString()}</span></div>
          <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Evidence</span><span className="mono">{evidenceCount}/6</span></div>
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

const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-1.5">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);