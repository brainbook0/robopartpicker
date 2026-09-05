import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileSearch, ListChecks, ShieldCheck, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api/client";

type Teardown = { id: string; sourceUrl: string | null; confidence: number; parsedData: { title?: string; summary?: string; robotName?: string; findings?: unknown[] }; updatedAt: string };

export default function Teardowns() {
  const query = useQuery({ queryKey: ["teardowns"], queryFn: ({ signal }) => api.get<{ items: Teardown[] }>("/api/v1/teardowns", { signal }) });
  const items = query.data?.items ?? [];
  return <main className="mx-auto max-w-[1200px] px-4 py-6"><div className="flex items-center gap-2"><div className="section-title">Evidence · teardowns</div><span className="pill pill-yellow">beta</span></div><h1 className="text-[22px] font-bold">Reviewed robot teardowns</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Teardowns explain what is actually inside a robot, but they become technical evidence only when the source, revision, observed part, and confidence are explicit.</p>
    {query.isLoading && <State>Loading reviewed records from D1…</State>}{query.error && <State error>{query.error.message}</State>}{items.length === 0 && <TeardownGuide />}
    <div className="mt-4 grid gap-3 md:grid-cols-2">{items.map((item) => <article key={item.id} className="surface-card p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-positive" /><span className="pill pill-good">reviewed</span><span className="mono text-[10px] text-muted-foreground">confidence {Math.round(item.confidence * 100)}%</span></div><h2 className="mt-3 font-semibold">{item.parsedData.title ?? item.parsedData.robotName ?? "Untitled teardown"}</h2><p className="mt-1 text-xs text-muted-foreground">{item.parsedData.summary ?? "No reviewed summary supplied."}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3 inline-flex items-center gap-1">Source <ExternalLink className="h-3 w-3" /></a>}</article>)}</div>
  </main>;
}

function TeardownGuide() {
  const cards = [
    { icon: FileSearch, title: "Identify the exact system", text: "Record model, hardware revision, source URL, publication date, and whether the unit was modified." },
    { icon: ListChecks, title: "Capture source-backed findings", text: "Name visible components and fabricated assemblies, but leave obscured or uncertain identities unresolved." },
    { icon: Wrench, title: "Link BOM corrections", text: "Connect each finding to a project and BOM line so the teardown can improve a generated build without replacing primary documentation." },
  ];
  return <section className="surface-card mt-4 p-5"><h2 className="font-semibold">No reviewed teardowns are published yet</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Staged imports and automated guesses never appear here as canonical evidence. A useful teardown submission should follow this structure:</p><div className="mt-4 grid gap-2 md:grid-cols-3">{cards.map(({ icon: Icon, title, text }) => <div key={title} className="rounded border border-border p-3"><Icon className="h-4 w-4 text-primary" /><div className="mt-2 text-xs font-semibold">{title}</div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p></div>)}</div><div className="mt-4 flex gap-2"><Link to="/community/new" className="btn-primary">Submit teardown evidence</Link><Link to="/projects" className="btn-ghost">Browse projects</Link></div></section>;
}
function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`surface-card mt-4 p-6 text-center text-sm ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>; }
