import { describe, expect, it } from "vitest";
import { selectProjectMediaCandidates } from "./projectMedia";
import type { ProjectRow } from "./projects";

type MediaProject = Pick<ProjectRow, "name" | "robot_category" | "cover_image_url" | "media" | "rpps">;

function project(overrides: Partial<MediaProject> = {}): MediaProject {
  return {
    name: "Media Bot",
    robot_category: "mobile",
    cover_image_url: null,
    media: [],
    rpps: {
      rpps_version: "1.0.0",
      name: "Media Bot",
      slug: "media-bot",
      version: "1.0.0",
      bom: [],
    },
    ...overrides,
  } as MediaProject;
}

describe("selectProjectMediaCandidates", () => {
  it("orders managed media before cover and RPPS images", () => {
    const candidates = selectProjectMediaCandidates(project({
      media: [
        { id: "managed-1", contentUrl: "/managed-1.webp", altText: "Managed one", caption: null },
        { id: "managed-2", contentUrl: "/managed-2.webp", altText: null, caption: "Managed two" },
      ],
      cover_image_url: "/cover.webp",
      rpps: project().rpps && {
        ...project().rpps,
        files: [
          { path: "images/rpps.webp", kind: "image", url: "/rpps.webp", description: "RPPS image" },
          { path: "docs/manual.pdf", kind: "doc", url: "/manual.pdf" },
        ],
      },
    }));
    expect(candidates.map((candidate) => [candidate.source, candidate.url])).toEqual([
      ["managed", "/managed-1.webp"],
      ["managed", "/managed-2.webp"],
      ["cover", "/cover.webp"],
      ["rpps", "/rpps.webp"],
    ]);
  });

  it("canonicalizes managed URLs, preserves official URLs, and deduplicates by final URL", () => {
    const legacy = "https://robopartpicker-production.ludomi2502.workers.dev/api/v1/files/content?id=shared";
    const official = "https://manufacturer.example/media/robot.webp";
    const candidates = selectProjectMediaCandidates(project({
      media: [{ id: "managed", contentUrl: legacy, altText: null, caption: null }],
      cover_image_url: "/api/v1/files/content?id=shared",
      rpps: { ...project().rpps, files: [{ path: "official.webp", kind: "image", url: official }] },
    }));
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "/api/v1/files/content?id=shared",
      official,
    ]);
  });

  it("drops unsafe or blank URLs and obeys the requested limit", () => {
    const candidates = selectProjectMediaCandidates(project({
      media: [
        { id: "unsafe", contentUrl: "javascript:alert(1)", altText: null, caption: null },
        { id: "one", contentUrl: "/one.webp", altText: null, caption: null },
        { id: "two", contentUrl: "/two.webp", altText: null, caption: null },
      ],
      cover_image_url: "/three.webp",
    }), 2);
    expect(candidates.map((candidate) => candidate.url)).toEqual(["/one.webp", "/two.webp"]);
  });
});
