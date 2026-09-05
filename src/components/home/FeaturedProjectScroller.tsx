import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProjectPreviewCard } from "@/components/projects/ProjectPreviewCard";
import type { ProjectRow } from "@/lib/projects";
import { trackAnalyticsEvent } from "@/lib/analytics";

export function FeaturedProjectScroller({ projects, loading = false, mode, onModeChange }: { projects: ProjectRow[]; loading?: boolean; mode: "open" | "closed"; onModeChange: (mode: "open" | "closed") => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    const rail = railRef.current;
    if (!rail) return;
    if (typeof rail.scrollTo === "function") rail.scrollTo({ left: 0, behavior: "smooth" });
    else rail.scrollLeft = 0;
  }, [mode]);

  if (loading) {
    return <div aria-label="Loading featured projects" className="min-h-[310px] animate-pulse border border-border bg-muted/25" />;
  }
  if (projects.length === 0) return null;

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: rail.clientWidth * 0.9 * direction, behavior: "smooth" });
    trackAnalyticsEvent({ event: direction > 0 ? "featured_next" : "featured_previous", targetType: "featured", dimensionKey: "mode", dimensionValue: mode });
    setActiveIndex((current) => Math.max(0, Math.min(projects.length - 1, current + direction)));
  };

  return (
    <section aria-label="Featured projects" className="min-w-0 border border-border bg-background p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary"><ShieldCheck className="h-3.5 w-3.5" />Featured projects</div>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Ranked by available project information and source evidence. Not sponsored.</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{activeIndex + 1} / {projects.length}</span>
      </div>

      <div role="group" aria-label="Featured project source" className="mb-2 grid grid-cols-2 gap-1 border border-border bg-muted/20 p-1">
        <button type="button" aria-label="Show open-source featured projects" aria-pressed={mode === "open"} onClick={() => { trackAnalyticsEvent({ event: "featured_mode_change", targetType: "featured", dimensionKey: "mode", dimensionValue: "open" }); onModeChange("open"); }} className={`px-2 py-1.5 text-[10px] font-semibold ${mode === "open" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>Open source</button>
        <button type="button" aria-label="Show closed-source featured projects" aria-pressed={mode === "closed"} onClick={() => { trackAnalyticsEvent({ event: "featured_mode_change", targetType: "featured", dimensionKey: "mode", dimensionValue: "closed" }); onModeChange("closed"); }} className={`px-2 py-1.5 text-[10px] font-semibold ${mode === "closed" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>Closed source</button>
      </div>

      <div
        ref={railRef}
        data-testid="featured-project-rail"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin]"
        onScroll={(event) => {
          const rail = event.currentTarget;
          const step = rail.clientWidth * 0.9;
          if (step > 0) setActiveIndex(Math.max(0, Math.min(projects.length - 1, Math.round(rail.scrollLeft / step))));
        }}
      >
        {projects.map((project) => (
          <div key={project.id} className="min-w-[88%] snap-start sm:min-w-[72%] lg:min-w-[88%] xl:min-w-[78%]">
            <ProjectPreviewCard project={project} variant="featured" className="h-full" />
          </div>
        ))}
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2">
        <span className="text-[9px] text-muted-foreground">Swipe, scroll, or use the controls</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => move(-1)} disabled={activeIndex === 0} aria-label="Previous featured project" className="btn-ghost btn-sm disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => move(1)} disabled={activeIndex === projects.length - 1} aria-label="Next featured project" className="btn-ghost btn-sm disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </section>
  );
}
