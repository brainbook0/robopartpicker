import { normalizeManagedFileUrl } from "@/shared/managedFileUrl";
import type { ProjectRow } from "./projects";

export type ProjectMediaCandidate = {
  id: string;
  url: string;
  source: "managed" | "cover" | "rpps";
  altText: string | null;
  caption: string | null;
};

export type ProjectMediaInput = Pick<
  ProjectRow,
  "name" | "robot_category" | "cover_image_url" | "media" | "rpps"
>;

export function selectProjectMediaCandidates(
  project: ProjectMediaInput,
  limit = 4,
): ProjectMediaCandidate[] {
  const raw: ProjectMediaCandidate[] = [
    ...(project.media ?? []).map((item) => ({
      id: `managed:${item.id}`,
      url: item.contentUrl,
      source: "managed" as const,
      altText: item.altText,
      caption: item.caption,
    })),
    ...(project.cover_image_url ? [{
      id: "cover",
      url: project.cover_image_url,
      source: "cover" as const,
      altText: null,
      caption: null,
    }] : []),
    ...(project.rpps.files ?? [])
      .filter((file) => file.kind === "image" && Boolean(file.url))
      .map((file) => ({
        id: `rpps:${file.path}`,
        url: file.url as string,
        source: "rpps" as const,
        altText: null,
        caption: file.description ?? file.path,
      })),
  ];

  const maximum = Number.isSafeInteger(limit) && limit > 0 ? limit : 4;
  const seen = new Set<string>();
  const candidates: ProjectMediaCandidate[] = [];
  for (const candidate of raw) {
    const url = normalizeManagedFileUrl(candidate.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    candidates.push({ ...candidate, url });
    if (candidates.length >= maximum) break;
  }
  return candidates;
}
