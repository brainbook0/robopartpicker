import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api/client";

type Teardown = { id: string; sourceUrl: string | null; confidence: number; parsedData: { title?: string; summary?: string; robotName?: string; findings?: unknown[] }; updatedAt: string };

export default function Teardowns() {
  const query = useQuery({ queryKey: ["teardowns"], queryFn: ({ signal }) => api.get<{ items: Teardown[] }>("/api/v1/teardowns", { signal }) });
  return <main className="mx-auto max-w-[1200px] px-4 py-6"><div className="section-title">Evidence · teardowns</div><h1 className="text-[22px] font-bold">Reviewed robot teardowns</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">External agents can submit teardown references through the versioned ingestion contract. Records appear here only after platform review; source content is always treated as untrusted data.</p>
    {query.isLoading && <State>Loading reviewed records from D1…</State>}{query.error && <State error>{query.error.message}</State>}{query.data?.items.length === 0 && <State>No teardown records have been reviewed and published yet. Staged imports never appear as canonical data.</State>}
    <div className="mt-4 grid gap-3 md:grid-cols-2">{query.data?.items.map((item) => <article key={item.id} className="surface-card p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-positive" /><span className="pill pill-good">admin reviewed</span><span className="mono text-[10px] text-muted-foreground">confidence {Math.round(item.confidence * 100)}%</span></div><h2 className="mt-3 font-semibold">{item.parsedData.title ?? item.parsedData.robotName ?? "Untitled teardown"}</h2><p className="mt-1 text-xs text-muted-foreground">{item.parsedData.summary ?? "No reviewed summary supplied."}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 inline-flex items-center gap-1">Source <ExternalLink className="h-3 w-3" /></a>}</article>)}</div>
  </main>;
}
function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`surface-card mt-4 p-6 text-center text-sm ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>; }
