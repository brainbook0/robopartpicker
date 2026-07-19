import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api/client";

const categoryOptions = ["component", "project", "manufacturer", "supplier", "offer", "build", "marketplace", "community"];
type SearchItem = { category: string; id: string; title: string; snippet: string; score: number; path: string };

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categories = params.get("categories") ?? "";
  const query = useQuery({
    queryKey: ["global-search", q, categories],
    queryFn: ({ signal }) => api.get<{ items: SearchItem[]; hasMore: boolean }>(`/api/v1/search?q=${encodeURIComponent(q)}${categories ? `&categories=${encodeURIComponent(categories)}` : ""}`, { signal }),
    enabled: q.trim().length >= 2,
  });
  const selected = new Set(categories.split(",").filter(Boolean));
  const toggle = (category: string) => {
    const nextSelected = new Set(selected); if (nextSelected.has(category)) nextSelected.delete(category); else nextSelected.add(category);
    const next = new URLSearchParams(params); if (nextSelected.size) next.set("categories", [...nextSelected].join(",")); else next.delete("categories"); setParams(next);
  };
  return <main className="mx-auto max-w-[1100px] px-4 py-6">
    <div className="section-title">Database search</div><h1 className="text-[22px] font-bold">Search RoboPartPicker</h1>
    <form className="surface-card mt-3 flex items-center gap-2 p-2" onSubmit={(event) => event.preventDefault()}><SearchIcon className="h-4 w-4 text-muted-foreground" /><input autoFocus value={q} onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value) next.set("q", event.target.value); else next.delete("q"); setParams(next, { replace: true }); }} className="h-9 flex-1 bg-transparent text-sm outline-none" placeholder="Components, projects, suppliers, builds, listings, discussions…" /></form>
    <div className="my-3 flex flex-wrap gap-1">{categoryOptions.map((category) => <button key={category} onClick={() => toggle(category)} className={`pill capitalize ${selected.has(category) ? "pill-yellow" : ""}`}>{category}</button>)}</div>
    {q.trim().length < 2 && <State>Enter at least two characters. Search is performed in D1, not by downloading records into the browser.</State>}
    {query.isLoading && <State>Searching the D1 full-text index…</State>}
    {query.error && <State error>{query.error.message}</State>}
    {query.data?.items.length === 0 && <State>No results. Try fewer words, remove category filters, or search for a manufacturer or model number.</State>}
    <div className="space-y-2">{query.data?.items.map((item) => <Link key={`${item.category}:${item.id}`} to={item.path} className="surface-card surface-card-hover block p-3"><div className="flex items-center gap-2"><span className="pill pill-yellow capitalize">{item.category}</span><h2 className="font-semibold">{item.title}</h2></div><p className="mt-1 text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeSnippet(item.snippet) }} /></Link>)}</div>
  </main>;
}

function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`surface-card p-6 text-center text-sm ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>; }
function sanitizeSnippet(value: string): string { return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/&lt;mark&gt;/gu, "<mark>").replace(/&lt;\/mark&gt;/gu, "</mark>"); }
