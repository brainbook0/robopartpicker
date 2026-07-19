import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, GitCompareArrows } from "lucide-react";
import { readCompare, clearCompare, removeFromCompare, WORKSPACE_EVENT, type CompareState, COMPARE_CAP } from "@/lib/catalogWorkspace";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { CatalogPart } from "@/shared/catalog";

/** Persistent compact compare tray. Reads local compare state and reflects
 *  add/remove immediately. Hidden when no parts are selected. */
export function CompareTray({ refreshKey = 0 }: { refreshKey?: number }) {
  const [state, setState] = useState<CompareState>(() => readCompare());

  useEffect(() => { setState(readCompare()); }, [refreshKey]);
  useEffect(() => {
    const sync = () => setState(readCompare());
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key.includes("rpp:cat:compare")) sync(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(WORKSPACE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WORKSPACE_EVENT, sync);
    };
  }, []);

  const partQueries = useQueries({
    queries: state.ids.map((id) => ({
      queryKey: ["catalog-component", id],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.get<{ item: CatalogPart }>(`/api/v1/components/${encodeURIComponent(id)}`, { signal }),
      staleTime: 30_000,
    })),
  });

  if (!state.ids.length) return null;
  const parts = partQueries.flatMap((query) => query.data?.item ? [query.data.item] : []);
  const compareHref = `/parts/compare?ids=${state.ids.join(",")}`;

  const doRemove = (id: string) => setState(removeFromCompare(id));
  const doClear = () => { clearCompare(); setState({ category: null, ids: [] }); };

  return (
    <div
      role="region"
      aria-label="Component comparison tray"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 surface-card shadow-lg px-3 py-2 flex items-center gap-2 max-w-[96vw]"
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <GitCompareArrows className="h-3.5 w-3.5 text-primary" aria-hidden />
        Compare <span className="mono text-foreground">{state.ids.length}/{COMPARE_CAP}</span>
      </div>
      <ul className="flex flex-wrap gap-1 max-w-[60vw]" aria-label="Selected components">
        {parts.map(p => (
          <li key={p.id}>
            <span className="pill pill-yellow inline-flex items-center gap-1 max-w-[220px]">
              <span className="truncate">{p.name}</span>
              <button onClick={() => doRemove(p.id)} aria-label={`Remove ${p.name} from compare`} className="hover:text-negative">
                <X className="h-3 w-3" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1 ml-1">
        <button onClick={doClear} className="btn-ghost btn-sm" aria-label="Clear comparison">Clear</button>
        <Link to={compareHref} className="btn-primary btn-sm inline-flex items-center gap-1">
          Compare →
        </Link>
      </div>
    </div>
  );
}
