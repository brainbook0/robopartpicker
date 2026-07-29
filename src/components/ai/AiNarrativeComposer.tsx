import { Bot } from "lucide-react";
import type { AiFormDraft, AiFormKind } from "@/lib/assistant";
import { RichTechnicalEditor } from "@/components/common/RichTechnicalEditor";
import { ContextualAiActions } from "@/components/ai/ContextualAiActions";

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
  return (
    <section className={compact ? "" : "surface-card border-primary/30 p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold"><Bot className="h-4 w-4 text-primary" /> {title}</div>
          <p className="mt-1 max-w-3xl text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <ContextualAiActions form={form} current={{ ...current, narrative: value }} onApply={onApply} surface={`${form}-narrative`} label="Organize details" />
      </div>
      <div className="mt-3"><RichTechnicalEditor value={value} onChange={onChange} label={`${title} technical narrative`}
        maxLength={20_000} minRows={rows} autosaveKey={`ai-narrative-${form}`}
        placeholder={placeholder ?? "Describe what you are making, why, what you know, and what is still uncertain…"} /></div>
      <p className="mt-2 text-[10.5px] text-muted-foreground">AI can propose structured details, but it cannot invent measurements, parts, prices, compatibility, tests, or evidence. Applying a draft never submits it.</p>
    </section>
  );
}
