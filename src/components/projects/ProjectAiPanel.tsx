import { useState } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { createThread } from "@/lib/assistant";

const ACTIONS = [
  "Explain this project using its published records.",
  "Assess build feasibility and identify unsupported assumptions.",
  "Estimate the missing work before a reproducible build is possible.",
  "Explain the BOM and identify unresolved or unavailable lines.",
  "Summarize known failures, evidence, and verified resolutions.",
  "Recommend the next build step based on current records.",
  "Compare project versions and cite the changed records.",
  "Prepare a sourcing plan and label stale or missing price evidence.",
  "Identify the most important missing information and draft a request for it.",
] as const;

export function ProjectAiPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const navigate = useNavigate(); const [busy, setBusy] = useState<string | null>(null);
  const start = async (starter: string) => {
    setBusy(starter);
    try {
      const thread = await createThread({ projectId, title: `${projectName} assistant` });
      navigate(`/assistant/${thread.id}?starter=${encodeURIComponent(starter)}`);
    } catch (error) { toast.error("Could not start project assistant", { description: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(null); }
  };
  return <section className="surface-card border-primary/30 p-3"><div className="flex items-start gap-2"><div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-primary text-primary-foreground"><Bot className="h-4 w-4" /></div><div><h2 className="text-[13px] font-semibold">Project assistant</h2><p className="mt-0.5 text-[10.5px] text-muted-foreground">Grounded in exact versions, BOMs, files, build logs, technical records, discussions, reproductions, and evidence.</p></div></div>
    <div className="mt-3 grid gap-1.5">{ACTIONS.map((action) => <button key={action} type="button" disabled={busy !== null} onClick={() => void start(action)} className="flex min-h-10 items-center gap-2 rounded border border-border px-2.5 py-2 text-left text-[11px] hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50">{busy === action ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />}<span>{action}</span></button>)}</div>
    <p className="mt-2 text-[10px] text-muted-foreground">If project evidence is insufficient, the assistant says what is missing and can prepare a structured information request. It does not silently answer from model memory.</p>
  </section>;
}
