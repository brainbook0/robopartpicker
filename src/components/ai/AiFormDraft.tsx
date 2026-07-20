import { useMemo, useState } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createFormDraft, type AiFormDraft as Draft, type AiFormKind } from "@/lib/assistant";

type Props = {
  form: AiFormKind;
  current: Record<string, unknown>;
  onApply: (draft: Draft) => void;
  label?: string;
  hint?: string;
};

export function AiFormDraft({ form, current, onApply, label = "AI fill", hint }: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => Object.entries(draft ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== ""), [draft]);

  const generate = async () => {
    if (prompt.trim().length < 8) return;
    setBusy(true);
    try {
      const result = await createFormDraft(form, prompt.trim(), current);
      setDraft(result);
      if (Object.keys(result).length === 0) toast.info("The assistant did not find enough supported information to draft fields.");
    } catch (error) {
      toast.error("AI draft failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="btn-ghost btn-sm"><Sparkles className="h-3.5 w-3.5" /> {label}</button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Draft this form</DialogTitle>
          <DialogDescription>{hint ?? "Describe what you know. The assistant will propose supported fields without submitting the form."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="input-bare min-h-32 w-full text-[12px]"
            maxLength={5_000}
            placeholder="Paste rough notes, requirements, measurements, or a technical description…"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10.5px] text-muted-foreground">AI-inferred fields are a draft. Review facts, units, URLs, evidence, and prices before applying.</p>
            <button type="button" className="btn-primary btn-sm shrink-0" disabled={busy || prompt.trim().length < 8} onClick={() => void generate()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate
            </button>
          </div>
          {draft && (
            <div className="rounded border border-border/70 bg-muted/20">
              <div className="border-b border-border/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proposed fields · {entries.length}</div>
              {entries.length === 0 ? <p className="p-3 text-xs text-muted-foreground">No supported fields were inferred.</p> : (
                <dl className="divide-y divide-border/60">
                  {entries.map(([key, value]) => (
                    <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[150px_1fr]">
                      <dt className="font-mono text-[10.5px] text-muted-foreground">{key}</dt>
                      <dd className="whitespace-pre-wrap break-words text-[11.5px]">{formatValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!draft || entries.length === 0 || busy} onClick={() => {
            if (!draft) return;
            onApply(draft);
            setOpen(false);
            toast.success("AI draft applied to the form", { description: "Review the highlighted values before saving or publishing." });
          }}>Apply draft</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return String(value);
}
