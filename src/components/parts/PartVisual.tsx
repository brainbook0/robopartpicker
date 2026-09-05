import { useState } from "react";
import {
  CircuitBoard,
  Cog,
  Cpu,
  Gauge,
  Hand,
  Package,
  Radar,
  type LucideIcon,
} from "lucide-react";
import type { CatalogPart, CatalogPartFile } from "@/shared/catalog";

type PartVisualProps = {
  part: Pick<CatalogPart, "name" | "category" | "maker" | "mpn" | "files">;
  compact?: boolean;
  className?: string;
};

type CategoryVisual = {
  label: string;
  icon: LucideIcon;
};

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  actuator: { label: "Actuator", icon: Cog },
  hand: { label: "Hand", icon: Hand },
  sensor: { label: "Sensor", icon: Radar },
  compute: { label: "Compute", icon: Cpu },
  driver: { label: "Driver", icon: CircuitBoard },
  reducer: { label: "Reducer", icon: Gauge },
};

function selectPartImage(files: readonly CatalogPartFile[] | undefined): CatalogPartFile | null {
  return files?.find((file) =>
    file.purpose === "image"
    && file.mediaType.startsWith("image/")
    && file.contentUrl.trim().length > 0
  ) ?? null;
}

function humanizeCategory(category: string): string {
  const words = category.trim().replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
  return words ? `${words[0].toLocaleUpperCase("en-US")}${words.slice(1)}` : "Component";
}

export function PartVisual({ part, compact = false, className }: PartVisualProps) {
  const image = selectPartImage(part.files);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const sizeClass = className ?? (compact ? "h-10 w-14" : "h-24 w-full");
  const category = CATEGORY_VISUALS[part.category] ?? {
    label: humanizeCategory(part.category),
    icon: Package,
  };

  if (image && failedUrl !== image.contentUrl) {
    return (
      <img
        src={image.contentUrl}
        alt={`Source-backed product image for ${part.name}`}
        className={`${sizeClass} rounded border border-border bg-surface object-contain p-1`}
        loading="lazy"
        onError={() => setFailedUrl(image.contentUrl)}
      />
    );
  }

  const Icon = category.icon;
  const maker = part.maker?.trim() && part.maker !== "Unknown manufacturer" ? part.maker.trim() : "";
  const mpn = part.mpn?.trim() ?? "";
  const identityLabel = `${category.label} identity illustration for ${part.name}${maker ? ` by ${maker}` : ""}${mpn ? `, MPN ${mpn}` : ""}; not a product photograph.`;
  return (
    <div
      role="img"
      aria-label={identityLabel}
      className={`${sizeClass} relative flex shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded border border-primary/40 bg-primary/10 px-1 text-center text-foreground`}
    >
      {!compact ? <span className="absolute left-2 top-1.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Identity illustration</span> : null}
      <Icon className={compact ? "h-4 w-4" : "h-7 w-7"} aria-hidden />
      <span className={`${compact ? "text-[8px]" : "text-[10px]"} max-w-full truncate font-semibold uppercase tracking-wide`}>
        {category.label}
      </span>
      {!compact ? (
        <>
          <span className="mt-0.5 max-w-[92%] truncate text-[11px] font-semibold text-foreground">{part.name}</span>
          {(maker || mpn) ? <span className="max-w-[92%] truncate font-mono text-[8.5px] text-muted-foreground">{[maker, mpn].filter(Boolean).join(" · ")}</span> : null}
        </>
      ) : null}
    </div>
  );
}
