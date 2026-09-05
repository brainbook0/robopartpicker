import { describe, expect, it } from "vitest";
import type { ProjectRow } from "@/lib/projects";
import { projectPreviewFacts } from "@/lib/projectPreviewFacts";

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "project-1",
    owner_id: null,
    slug: "open-robot",
    name: "Open Robot",
    summary: "A source-backed open robot project.",
    description: null,
    license: "Apache-2.0",
    version: "1.0.0",
    status: "published",
    project_kind: "physical_design",
    robot_category: "mobile",
    visibility: "public",
    repo_url: "https://github.com/example/open-robot",
    docs_url: null,
    cover_image_url: null,
    media: [],
    tags: ["open-source"],
    difficulty: "beginner",
    estimated_cost_usd: null,
    reproducibility_score: null,
    reproduction_count: 0,
    successful_reproduction_count: 0,
    bom_id: null,
    bom_line_count: 0,
    rpps_version: "1.0.0",
    rpps: { rpps_version: "1.0.0", name: "Open Robot", slug: "open-robot", version: "1.0.0", bom: [] },
    is_demo: false,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    githubStars: 10,
    upstream_url: "https://github.com/example/open-robot",
    upstream_identity: "github.com/example/open-robot",
    maintainer: "Example",
    revision: "v1",
    ingested_at: "2026-08-01T00:00:00.000Z",
    last_checked_at: "2026-08-20T00:00:00.000Z",
    publishability: "ready",
    ...overrides,
  };
}

describe("projectPreviewFacts", () => {
  it("shows published cost, partial BOM lines and explicit zero build counts", () => {
    const facts = projectPreviewFacts(project({
      preview_cost_minor: 160000,
      preview_cost_currency: "USD",
      preview_cost_kind: "published",
      bom_publication_state: "partial",
      bom_line_count: 92,
    }));

    expect(facts.cost).toMatchObject({ value: "$1,600", detail: "Published estimate" });
    expect(facts.builds).toMatchObject({ value: "0 started · 0 verified" });
    expect(facts.bom).toMatchObject({ value: "92 partial lines" });
  });

  it("uses official commercial prices while refusing to imply buildability", () => {
    const facts = projectPreviewFacts(project({
      project_kind: "commercial_showcase",
      license: null,
      repo_url: null,
      docs_url: "https://manufacturer.example/robot",
      preview_cost_minor: 490000,
      preview_cost_currency: "USD",
      preview_cost_kind: "published_price",
      preview_cost_method: "official-product-price-v1",
      bom_publication_state: "manufacturer_unavailable",
    }));

    expect(facts.cost).toMatchObject({ value: "$4,900", detail: "Official price" });
    expect(facts.builds).toMatchObject({ value: "Not buildable" });
    expect(facts.bom).toMatchObject({ value: "Manufacturer BOM unavailable" });
    expect(facts.source).toMatchObject({ value: "Official product source" });
  });

  it("does not leak stale project estimates into unpriced commercial cards", () => {
    const facts = projectPreviewFacts(project({
      project_kind: "commercial_showcase",
      license: null,
      repo_url: null,
      docs_url: "https://manufacturer.example/robot",
      estimated_cost_usd: 9999,
      preview_cost_minor: null,
      preview_cost_kind: null,
      bom_publication_state: "manufacturer_unavailable",
    }));

    expect(facts.cost.value).toBe("Price not published");
  });

  it("formats known BOM subtotals without fabricating a complete project price", () => {
    const facts = projectPreviewFacts(project({
      preview_cost_minor: 9087,
      preview_cost_currency: "USD",
      preview_cost_kind: "known_bom",
      bom_publication_state: "verified",
      bom_line_count: 12,
    }));

    expect(facts.cost).toMatchObject({ value: "$90.87", detail: "Known BOM cost" });
    expect(facts.bom.value).toBe("12 verified lines");
  });

  it("labels an open physical-design category estimate as inferred and low confidence", () => {
    const facts = projectPreviewFacts(project({
      preview_cost_minor: 700000,
      preview_cost_currency: "USD",
      preview_cost_kind: "inferred",
      preview_cost_confidence: "low",
      preview_cost_method: "project-point-estimate-v1",
    }));

    expect(facts.cost).toMatchObject({ value: "$7,000", detail: "Low-confidence estimate", tone: "warning" });
  });

  it("uses explicit BOM states for open, software and commercial projects", () => {
    expect(projectPreviewFacts(project()).bom.value).toBe("Source BOM not published");
    expect(projectPreviewFacts(project({ project_kind: "robotics_software" })).bom.value).toBe("Not applicable");
    expect(projectPreviewFacts(project({ project_kind: "commercial_showcase", license: null, repo_url: null })).bom.value).toBe("Manufacturer BOM unavailable");
  });

  it("shows real attempt and independent verification counts", () => {
    const facts = projectPreviewFacts(project({ reproduction_count: 7, successful_reproduction_count: 2 }));
    expect(facts.builds.value).toBe("7 started · 2 verified");
  });
});
