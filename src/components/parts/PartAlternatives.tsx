import { ExternalLink, GitCompareArrows, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import type { CatalogPart } from "@/shared/catalog";
import type { ComponentAlternativeRecommendation } from "@/shared/componentAlternatives";
import { PartVisual } from "./PartVisual";

type PartAlternativesProps = {
  current: CatalogPart;
  items: ComponentAlternativeRecommendation[];
  loading?: boolean;
  error?: boolean;
};

function comparePath(currentId: string, candidateId: string): string {
  const search = new URLSearchParams({ ids: `${currentId},${candidateId}` });
  return `/parts/compare?${search}`;
}

export function PartAlternatives({ current, items, loading = false, error = false }: PartAlternativesProps) {
  return (
    <section className="surface-card overflow-hidden" aria-labelledby="recommended-alternatives-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div>
          <div className="section-title">Catalog comparison</div>
          <h2 id="recommended-alternatives-title" className="mt-0.5 text-[14px] font-semibold">Recommended alternatives</h2>
        </div>
        <span className="pill mono text-[10px]">{items.length}</span>
      </div>
      <div
        role="note"
        aria-label="Candidate alternative - fit and electrical/mechanical compatibility are not verified"
        className="flex items-start gap-2 border-b border-warning/30 bg-warning/5 px-3 py-2 text-[10.5px] leading-4 text-muted-foreground"
      >
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
        <span><strong className="text-foreground">Candidate alternative</strong> - fit and electrical/mechanical compatibility are not verified. Compare specifications and manufacturer documentation before substitution.</span>
      </div>

      {loading ? (
        <div className="p-4 text-[12px] text-muted-foreground" role="status">Loading ranked alternatives…</div>
      ) : error ? (
        <div className="p-4 text-[12px] text-negative" role="alert">Alternative recommendations are temporarily unavailable.</div>
      ) : items.length === 0 ? (
        <div className="p-4 text-[12px] text-muted-foreground">No same-category alternative is currently published.</div>
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.slice(0, 5).map(({ item, reasons }) => (
            <article key={item.id} className="min-w-0 rounded border border-border bg-surface p-2.5">
              <PartVisual part={item} className="h-28 w-full" />
              <div className="mt-2 min-w-0">
                <Link
                  to={`/parts/${item.category}/${item.slug}`}
                  aria-label={`Open ${item.name}`}
                  className="block truncate text-[12px] font-semibold hover:text-primary hover:underline"
                >
                  {item.name}
                </Link>
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {item.maker || "Unknown manufacturer"}{item.mpn ? ` · ${item.mpn}` : ""}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {reasons.slice(0, 3).map((reason) => <span key={reason} className="pill text-[9px]">{reason}</span>)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Link
                    to={comparePath(current.id, item.id)}
                    aria-label={`Compare ${current.name} and ${item.name}`}
                    className="btn-ghost btn-sm"
                  >
                    <GitCompareArrows className="h-3 w-3" aria-hidden /> Compare
                  </Link>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Product source for ${item.name}`}
                      className="btn-ghost btn-sm"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden /> Source
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
