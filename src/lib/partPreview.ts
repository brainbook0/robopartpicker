import type { CatalogPartFile } from "@/shared/catalog";

export type PartPreview = {
  kind: "step" | "stl" | "obj";
  file: CatalogPartFile;
};

const PRIORITY: Record<PartPreview["kind"], number> = { step: 0, stl: 1, obj: 2 };

export function selectPartPreview(files: readonly CatalogPartFile[] | undefined): PartPreview | null {
  const candidates = (files ?? []).flatMap((file): PartPreview[] => {
    if (file.purpose !== "cad" || !file.contentUrl.trim()) return [];
    const extension = file.originalName.toLowerCase().split(/[?#]/u)[0].split(".").at(-1);
    if (extension === "step" || extension === "stp" || extension === "iges" || extension === "igs") return [{ kind: "step", file }];
    if (extension === "stl") return [{ kind: "stl", file }];
    if (extension === "obj") return [{ kind: "obj", file }];
    return [];
  });
  return candidates.sort((left, right) => PRIORITY[left.kind] - PRIORITY[right.kind] || right.file.sizeBytes - left.file.sizeBytes)[0] ?? null;
}
