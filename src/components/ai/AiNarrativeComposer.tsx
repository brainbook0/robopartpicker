import { useState } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createFormDraft, type AiFormDraft, type AiFormKind } from "@/lib/assistant";

type Props = {
  form: AiFormKind;
  value: string;
  onChange: (value: string) => void;
  current: Record<string, unknown>;
  onApply: (draft: AiFormDraft) => void;
  title?: string;
  hint: string;
  placeholder?: string;
  compact?: boolean;
  rows?: number;
};

export function AiNarrativeComposer({ form, value, onChange, current, onApply, title = "Write it your way", hint, placeholder, compact = false, rows = 7 }: Props) {
  const [busy, setBusy] = useState(false);

  const organize = async () => {
    if (value.trim().length < 8) return;
    setBusy(true);
    try {
      const draft = await createFormDraft(form, value.trim(), current);
      if (Object.keys(draft).length === 0) {
        toast.info("The assistant did not find enough supported facts to organize.");
        return;
      }
      onApply(draft);
      toast.success("Draft details organized", { description: "Review every inferred value before submission; your original narrative is unchanged." });
    } catch (error) {
      toast.error("AI organization failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={compact ? "" : "surface-card border-primary/30 p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold"><Bot className="h-4 w-4 text-primary" /> {title}</div>
          <p className="mt-1 max-w-3xl text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <button type="button" className="btn-primary btn-sm shrink-0" disabled={busy || value.trim().length < 8} onClick={() => void organize()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Organize details
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={20_000}
        rows={rows}
        className="input-bare mt-3 w-full text-[12px] leading-relaxed"
        placeholder={placeholder ?? "Describe what you are making, why, what you know, and what is still uncertain…"}
      />
      <p className="mt-2 text-[10.5px] text-muted-foreground">AI can propose structured details, but it cannot invent measurements, parts, prices, compatibility, tests, or evidence. Applying a draft never submits it.</p>
    </section>
  );
}
