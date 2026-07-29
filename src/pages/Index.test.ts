import { describe, expect, it } from "vitest";
import { emptyRpps } from "@/lib/rpps/schema";
import type { ProjectRow } from "@/lib/projects";
import { selectFeaturedProjects } from "@/lib/featured-projects";

function project(name: string, input: Partial<ProjectRow> = {}): ProjectRow {
  const slug = name.toLowerCase().replaceAll(" ", "-");
  return {
    id: slug,
    owner_id: null,
    slug,
    name,
    summary: null,
    description: null,
    license: null,
    version: "1.0.0",
    status: "published",
    visibility: "public",
    repo_url: null,
    docs_url: null,
    cover_image_url: null,
    tags: [],
    difficulty: null,
    estimated_cost_usd: null,
    reproducibility_score: null,
    reproduction_count: 0,
    successful_reproduction_count: 0,
    rpps_version: "0.1",
    rpps: emptyRpps({ name, slug }),
    is_demo: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...input,
  };
}

describe("selectFeaturedProjects", () => {
  it("prefers real projects and independent reproduction evidence", () => {
    const projects = [
      project("Demo complete", { is_demo: true, successful_reproduction_count: 5 }),
      project("Published basic"),
      project("Reproduced project", { successful_reproduction_count: 1, reproduction_count: 2 }),
    ];

    expect(selectFeaturedProjects(projects, 2).map((item) => item.name)).toEqual([
      "Reproduced project",
      "Published basic",
    ]);
  });
});
