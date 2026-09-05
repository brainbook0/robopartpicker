import type { BomItem } from "@/shared/builds";

export function bomItemDestination(bomId: string, item: Pick<BomItem, "id" | "componentCategory" | "componentSlug">): string {
  if (item.componentCategory && item.componentSlug) {
    return `/parts/${encodeURIComponent(item.componentCategory)}/${encodeURIComponent(item.componentSlug)}`;
  }
  return `/boms/${encodeURIComponent(bomId)}/items/${encodeURIComponent(item.id)}`;
}
