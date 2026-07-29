import { ContextualAiActions } from "@/components/ai/ContextualAiActions";
import type { AiFormDraft as Draft, AiFormKind } from "@/lib/assistant";

type Props = {
  form: AiFormKind;
  current: Record<string, unknown>;
  onApply: (draft: Draft) => void;
  label?: string;
  hint?: string;
};

/** Compatibility wrapper used by existing forms; the implementation is the shared contextual action system. */
export function AiFormDraft({ form, current, onApply, label = "AI actions" }: Props) {
  return <ContextualAiActions form={form} current={current} onApply={onApply} surface={`${form}-form`} label={label} />;
}
