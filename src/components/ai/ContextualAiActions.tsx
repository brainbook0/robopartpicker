import { useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, CircleAlert, FileSearch, History, Loader2, Pencil, Sparkles, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { RichTechnicalEditor } from "@/components/common/RichTechnicalEditor";
import {
  applyContextualAction, editContextualAction, previewContextualAction, recordAiFriction, rejectContextualAction,
  undoContextualAction, type AiFormKind, type ContextualAiAction, type ContextualAiActionType,
} from "@/lib/assistant";

type Props = {
  form: AiFormKind;
  current: Record<string, unknown>;
  onApply: (values: Record<string, unknown>) => void;
  surface?: string;
  projectId?: string;
  buildId?: string;
  fileIds?: string[];
  label?: string;
};

const ACTION_LABELS: Record<ContextualAiActionType, string> = {
  generate_draft: "Generate draft", fill_from_files: "Fill from uploaded files", extract_structured_information: "Extract structured information",
  explain_field: "Explain this field", recommend_missing_information: "Recommend missing information", improve_writing: "Improve writing",
  check_consistency: "Check consistency", compare_options: "Compare options", suggest_substitutions: "Suggest substitutions",
  refine_search: "Refine search", summarize_evidence: "Summarize evidence", structure_record: "Convert notes to a record",
  replace_bom: "Replace BOM", canonical_publication: "Prepare canonical publication", marketplace_pricing: "Estimate marketplace pricing",
  compatibility_claim: "Draft a compatibility claim",
};

const FORM_ACTIONS: Record<AiFormKind, ContextualAiActionType[]> = {
  project: ["generate_draft", "fill_from_files", "extract_structured_information", "recommend_missing_information", "improve_writing", "check_consistency", "summarize_evidence", "canonical_publication"],
  build: ["generate_draft", "fill_from_files", "recommend_missing_information", "check_consistency", "suggest_substitutions", "replace_bom", "summarize_evidence"],
  community_thread: ["generate_draft", "improve_writing", "summarize_evidence", "recommend_missing_information"],
  marketplace_listing: ["generate_draft", "fill_from_files", "extract_structured_information", "improve_writing", "marketplace_pricing"],
  marketplace_wanted: ["generate_draft", "improve_writing", "refine_search", "compare_options"],
  build_record: ["extract_structured_information", "structure_record", "summarize_evidence", "check_consistency"],
  release_proposal: ["generate_draft", "compare_options", "check_consistency", "compatibility_claim", "canonical_publication"],
};

export function ContextualAiActions({ form, current, onApply, surface = form, projectId, buildId, fileIds = [], label = "AI actions" }: Props) {
  const actions = FORM_ACTIONS[form];
  const [open, setOpen] = useState(false);
  const [actionType, setActionType] = useState<ContextualAiActionType>(actions[0]);
  const [instruction, setInstruction] = useState("");
  const [action, setAction] = useState<ContextualAiAction | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const abandonedRef = useRef(new Set<string>());
  const facts = useMemo(() => action?.factInference.filter((item) => item.kind === "fact") ?? [], [action]);
  const inferences = useMemo(() => action?.factInference.filter((item) => item.kind === "inference") ?? [], [action]);

  const handleOpen = (next: boolean) => {
    if (!next && action && ["preview", "edited"].includes(action.status) && !abandonedRef.current.has(action.id)) {
      abandonedRef.current.add(action.id);
      void recordAiFriction({ category: "abandoned_form", feature: surface, actionId: action.id, projectId, buildId,
        context: { actionType: action.actionType, fieldsChanged: action.fieldsChanged }, resultDisposition: "abandoned" });
    }
    setOpen(next);
  };

  const generate = async () => {
    if (instruction.trim().length < 2) return;
    setBusy("generate");
    try {
      const next = await previewContextualAction({ actionType, form, surface, instruction: instruction.trim(), current, projectId, buildId, fileIds,
        targetEntityType: form, targetEntityId: projectId ?? buildId });
      setAction(next); setEditJson(JSON.stringify(next.proposedValues, null, 2)); setEditing(false); setConfirmed(false);
      if (!next.fieldsChanged.length) toast.info("No supported changes were proposed", { description: "Review the missing-information section for what would resolve the gap." });
    } catch (error) {
      toast.error("AI action failed", { description: message(error) });
      void recordAiFriction({ category: "action_failed", feature: surface, projectId, buildId, context: { actionType }, privacyState: "private" });
    } finally { setBusy(null); }
  };

  const saveEdit = async () => {
    if (!action) return;
    let values: unknown;
    try { values = JSON.parse(editJson); } catch { toast.error("The edited proposal is not valid JSON."); return; }
    if (!values || typeof values !== "object" || Array.isArray(values)) { toast.error("The edited proposal must be a JSON object."); return; }
    setBusy("edit");
    try {
      const next = await editContextualAction(action.id, values as Record<string, unknown>, "User edited the generated proposal before applying it.");
      setAction(next); setEditing(false); toast.success("Proposal updated");
    } catch (error) { toast.error("Could not update proposal", { description: message(error) }); }
    finally { setBusy(null); }
  };

  const apply = async () => {
    if (!action) return;
    setBusy("apply");
    try {
      const result = await applyContextualAction(action.id, confirmed);
      onApply(result.proposedValues);
      setAction({ ...action, status: "applied" });
      abandonedRef.current.add(action.id);
      toast.success("AI changes applied to this draft", { description: "Saving or publishing is still a separate action." });
    } catch (error) { toast.error("Could not apply proposal", { description: message(error) }); }
    finally { setBusy(null); }
  };

  const reject = async () => {
    if (!action) return;
    setBusy("reject");
    try {
      await rejectContextualAction(action.id, "Rejected from contextual action preview.");
      abandonedRef.current.add(action.id); setAction({ ...action, status: "rejected" });
      await recordAiFriction({ category: "other", feature: surface, actionId: action.id, projectId, buildId,
        context: { actionType: action.actionType, fieldsChanged: action.fieldsChanged }, resultDisposition: "rejected" });
    } catch (error) { toast.error("Could not reject proposal", { description: message(error) }); }
    finally { setBusy(null); }
  };

  const undo = async () => {
    if (!action) return;
    setBusy("undo");
    try {
      const result = await undoContextualAction(action.id); onApply(result.restoreValues); setAction({ ...action, status: "undone" });
      toast.success("AI changes undone in this draft");
    } catch (error) { toast.error("Could not undo proposal", { description: message(error) }); }
    finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild><button type="button" className="btn-ghost btn-sm"><Sparkles className="h-3.5 w-3.5" /> {label}<ChevronDown className="h-3 w-3" /></button></DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Contextual AI assistance</DialogTitle>
          <DialogDescription>Choose a task. Every change stays in preview until you apply it, and saving remains separate.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block text-[11px] font-medium">Task
            <select className="input-bare mt-1 w-full" value={actionType} onChange={(event) => { setActionType(event.target.value as ContextualAiActionType); setAction(null); }}>
              {actions.map((item) => <option key={item} value={item}>{ACTION_LABELS[item]}</option>)}
            </select>
          </label>
          <RichTechnicalEditor value={instruction} onChange={setInstruction} label={`${ACTION_LABELS[actionType]} instruction`} minRows={5} maxLength={12_000}
            autosaveKey={`contextual-ai-${surface}-${actionType}`} placeholder="Describe the outcome, constraints, evidence, and anything that must remain unchanged…" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10.5px] text-muted-foreground">{fileIds.length ? `${fileIds.length} selected file(s) will be available as sources.` : "Attach or import files first when the task depends on source material."}</p>
            <button type="button" className="btn-primary btn-sm" disabled={Boolean(busy) || instruction.trim().length < 2} onClick={() => void generate()}>
              {busy === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />} Preview {ACTION_LABELS[actionType].toLowerCase()}
            </button>
          </div>

          {action && <div className="space-y-3 rounded border border-border bg-muted/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="text-[12px] font-semibold">Preview · {action.fieldsChanged.length} field{action.fieldsChanged.length === 1 ? "" : "s"} changed</div>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">{action.summary || ACTION_LABELS[action.actionType]}</p></div>
              <div className="min-w-36"><div className="flex justify-between text-[10px]"><span>Confidence</span><span>{Math.round(action.confidence * 100)}%</span></div><Progress value={action.confidence * 100} className="mt-1 h-1.5" /></div>
            </div>

            {action.highImpact && <div className="rounded border border-warning/50 bg-warning/10 p-2 text-[11px]"><CircleAlert className="mr-1 inline h-3.5 w-3.5" /> This is a high-impact recommendation. It cannot be applied without explicit confirmation.</div>}

            {editing ? <div className="space-y-2"><RichTechnicalEditor value={editJson} onChange={setEditJson} label="Edit proposed field values" mono minRows={10} maxLength={100_000} />
              <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => void saveEdit()}><Check className="h-3.5 w-3.5" /> Save edit</button><button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button></div></div>
              : <dl className="divide-y divide-border/60 rounded border border-border/60 bg-background">{action.fieldsChanged.map((field) => <div key={field} className="grid gap-1 px-3 py-2 sm:grid-cols-[150px_1fr]"><dt className="font-mono text-[10px] text-muted-foreground">{field}</dt><dd className="whitespace-pre-wrap break-words text-[11px]">{display(action.proposedValues[field])}</dd></div>)}</dl>}

            <div className="grid gap-3 md:grid-cols-2">
              <Evidence title={`Facts (${facts.length})`} items={facts.map((item) => `${item.field}: ${item.rationale} (${Math.round(item.confidence * 100)}%)`)} empty="No field was classified as a sourced fact." />
              <Evidence title={`Inferences (${inferences.length})`} items={inferences.map((item) => `${item.field}: ${item.rationale} (${Math.round(item.confidence * 100)}%)`)} empty="No field was classified as an inference." />
              <Evidence title={`Sources (${action.sources.length})`} items={action.sources.map((item) => `${item.label}${item.revision ? ` · ${item.revision}` : ""}`)} empty="No supporting source was available." />
              <Evidence title={`Missing information (${action.missingInformation.length})`} items={action.missingInformation.map((item) => `${item.field}: ${item.reason}${item.suggestedSources.length ? ` Try: ${item.suggestedSources.join(", ")}` : ""}`)} empty="No missing information was reported." />
            </div>

            <details className="rounded border border-border/60 bg-background px-3 py-2 text-[10.5px]"><summary className="cursor-pointer font-medium">Context and audit record</summary>
              <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2"><span>Model: {action.execution?.model ?? "not reported"}</span><span>Provider: {action.execution?.provider ?? "not reported"}</span><span>Prompt: {action.execution?.promptVersionId ?? "environment default"}</span><span>Latency: {action.execution?.latencyMs ?? 0} ms</span><span>Cost: {formatCost(action.execution?.costMicrounits)}</span><span>Cache: {action.execution?.cacheHit ? "hit" : "miss"}</span><span>Tool calls: {action.execution?.toolCalls?.length ?? 0}</span><span>Context records: {action.contextUsed.length}</span></div>
            </details>

            {action.explicitConfirmationRequired && ["preview", "edited"].includes(action.status) && <label className="flex items-start gap-2 rounded border border-border p-2 text-[11px]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed the fields, evidence, assumptions, and missing information and explicitly confirm this high-impact change.</label>}
          </div>}
        </div>
        <DialogFooter className="flex-wrap sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {action && ["preview", "edited"].includes(action.status) && <><button type="button" className="btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</button><button type="button" className="btn-ghost btn-sm text-negative" disabled={Boolean(busy)} onClick={() => void reject()}><X className="h-3.5 w-3.5" /> Reject</button></>}
            {action?.status === "applied" && <button type="button" className="btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void undo()}><Undo2 className="h-3.5 w-3.5" /> Undo</button>}
          </div>
          {action && ["preview", "edited"].includes(action.status) && <button type="button" className="btn-primary" disabled={Boolean(busy) || !action.fieldsChanged.length || (action.explicitConfirmationRequired && !confirmed)} onClick={() => void apply()}>
            {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Apply to draft
          </button>}
          {action && ["applied", "rejected", "undone"].includes(action.status) && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><History className="h-3.5 w-3.5" /> Action {action.status}; audit record retained.</span>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Evidence({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div className="rounded border border-border/60 bg-background p-2"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>{items.length
    ? <ul className="mt-1 space-y-1 text-[10.5px]">{items.map((item, index) => <li key={`${index}-${item}`} className="break-words">• {item}</li>)}</ul>
    : <p className="mt-1 text-[10.5px] text-muted-foreground">{empty}</p>}</div>;
}
function display(value: unknown): string { return typeof value === "string" ? value : JSON.stringify(value, null, 2); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function formatCost(value = 0): string { return value ? `$${(value / 1_000_000).toFixed(6)}` : "$0.000000 or unreported"; }
