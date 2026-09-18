import { useState } from "react";
import { Bot } from "lucide-react";
import { ROBOT_CATEGORY_LABELS } from "@/shared/robotCategory";
import {
  selectProjectMediaCandidates,
  type ProjectMediaInput,
} from "@/lib/projectMedia";

type ProjectMediaProps = {
  project: ProjectMediaInput;
  mode: "card" | "detail";
  maxItems?: number;
  className?: string;
  imageClassName?: string;
};

export function ProjectMedia({
  project,
  mode,
  maxItems = 4,
  className,
  imageClassName = "",
}: ProjectMediaProps) {
  // Cards render a single primary image to avoid loading 4 multi-megabyte
  // originals per preview card; detail pages show the full gallery.
  const limit = mode === "card" ? 1 : maxItems;
  const candidates = selectProjectMediaCandidates(project, limit);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(() => new Set());
  const active = candidates.filter((candidate) => !failedUrls.has(candidate.url));
  // Cards request the pre-generated downscaled thumbnail variant (?v=thumb)
  // so previews download ~90% less instead of full-resolution originals.
  const candidateSrc = (candidate: { url: string }) => {
    if (mode !== "card") return candidate.url;
    const url = new URL(candidate.url, window.location.origin);
    if (url.pathname === "/api/v1/files/content") {
      url.searchParams.set("v", "thumb");
    }
    return url.toString();
  };
  // Must compare against the same value the <img> actually loaded, otherwise
  // card previews (whose src is absolutised above) never report a painted
  // image and the identity illustration stays on top of the real photo.
  const hasLoadedImage = active.some((candidate) => loadedUrls.has(candidateSrc(candidate)));
  const categoryLabel = project.robot_category
    ? ROBOT_CATEGORY_LABELS[project.robot_category]
    : "Robotics project";
  const reservedSize = className ?? (mode === "detail" ? "aspect-[4/3]" : "aspect-[16/8]");

  return (
    <div className={`${reservedSize} relative overflow-hidden rounded border border-border bg-muted`}>
      <div
        data-project-identity-illustration
        role={active.length === 0 && mode === "detail" ? "img" : undefined}
        aria-label={active.length === 0 && mode === "detail"
          ? `${categoryLabel} category illustration; no source-backed project image is available for ${project.name}.`
          : undefined}
        aria-hidden={active.length > 0 || mode === "card" ? true : undefined}
        data-image-loaded={hasLoadedImage ? "true" : "false"}
        className={`pointer-events-none absolute inset-0 z-20 flex h-full w-full flex-col items-center justify-center gap-1 bg-primary/10 px-3 text-center text-foreground transition-opacity ${hasLoadedImage ? "opacity-0" : "opacity-100"}`}
      >
        <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Identity illustration</span>
        <Bot className="h-8 w-8" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{categoryLabel}</span>
      </div>
      {active.length > 0 ? (
        <div className={`relative z-10 grid h-full grid-cols-2 gap-0.5 ${active.length > 2 ? "grid-rows-2" : ""}`}>
          {active.map((candidate, index) => {
            const layoutClass = active.length === 1
              ? "col-span-2"
              : active.length === 3 && index === 0
                ? "row-span-2"
                : "";
            const alt = mode === "card"
              ? ""
              : candidate.altText?.trim()
                || (candidate.caption?.trim() ? `${project.name}: ${candidate.caption.trim()}` : null)
                || `${project.name} source-backed project image`;
            const src = candidateSrc(candidate);
            return (
              <img
                key={`${candidate.id}:${src}`}
                src={src}
                alt={alt}
                loading={mode === "detail" ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={mode === "detail" && index === 0 ? "high" : "auto"}
                className={`${layoutClass} h-full min-h-0 w-full object-cover transition-transform ${imageClassName}`}
                onLoad={() => setLoadedUrls((current) => {
                  const next = new Set(current);
                  next.add(src);
                  return next;
                })}
                onError={() => {
                  setLoadedUrls((loaded) => {
                    const next = new Set(loaded);
                    next.delete(src);
                    return next;
                  });
                  setFailedUrls((current) => {
                    const next = new Set(current);
                    next.add(candidate.url);
                    return next;
                  });
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
