import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ProjectRow } from "@/lib/projects";
import { ProjectPreviewCard } from "@/components/projects/ProjectPreviewCard";

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "project-1", owner_id: null, slug: "open-robot", name: "Open Robot",
    summary: "A complete source-backed robot preview.", description: null, license: "Apache-2.0", version: "1.0.0",
    status: "published", project_kind: "physical_design", robot_category: "mobile", visibility: "public",
    repo_url: "https://github.com/example/open-robot", docs_url: null, cover_image_url: null, media: [], tags: ["open-source"],
    difficulty: "beginner", estimated_cost_usd: 1600, reproducibility_score: null, reproduction_count: 3,
    successful_reproduction_count: 1, bom_id: "bom-1", bom_line_count: 92, bom_publication_state: "partial",
    preview_cost_minor: 160000, preview_cost_currency: "USD", preview_cost_kind: "published", rpps_version: "1.0.0",
    rpps: { rpps_version: "1.0.0", name: "Open Robot", slug: "open-robot", version: "1.0.0", bom: [] }, is_demo: false,
    created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-20T00:00:00.000Z", githubStars: 100,
    upstream_url: "https://github.com/example/open-robot", upstream_identity: "github.com/example/open-robot",
    maintainer: "Example", revision: "v1", ingested_at: "2026-08-01T00:00:00.000Z",
    last_checked_at: "2026-08-20T00:00:00.000Z", publishability: "ready", ...overrides,
  };
}

function renderCard(row: ProjectRow, variant: "catalog" | "featured" | "compact" = "catalog") {
  return render(<MemoryRouter><ProjectPreviewCard project={row} variant={variant} /></MemoryRouter>);
}

describe("ProjectPreviewCard", () => {
  it("renders canonical cost, builds and BOM facts", () => {
    renderCard(project());
    expect(screen.getByRole("link", { name: /Open Robot project preview/i })).toHaveAttribute("href", "/projects/open-robot");
    expect(screen.getByText("$1,600")).toBeInTheDocument();
    expect(screen.getByText("3 started · 1 verified")).toBeInTheDocument();
    expect(screen.getByText("92 partial lines")).toBeInTheDocument();
    expect(screen.getByText("Published estimate")).toBeInTheDocument();
  });

  it("shows honest commercial unavailable states instead of zeros or dashes", () => {
    const view = renderCard(project({
      project_kind: "commercial_showcase", robot_category: "humanoid", license: null, repo_url: null,
      docs_url: "https://manufacturer.example/robot", estimated_cost_usd: 9999,
      version: "catalog-2026-08-27-humanoid-market-v1",
      preview_cost_minor: null, preview_cost_kind: null, bom_id: null, bom_line_count: 0,
      bom_publication_state: "manufacturer_unavailable", reproduction_count: 0, successful_reproduction_count: 0,
    }));
    expect(screen.getByText("Price not published")).toBeInTheDocument();
    expect(screen.getByText("Not buildable")).toBeInTheDocument();
    expect(screen.getByText("Manufacturer BOM unavailable")).toBeInTheDocument();
    expect(screen.getByText("Manufacturer listing · Published")).toBeInTheDocument();
    expect(view.container.textContent).not.toContain("catalog-2026");
    expect(view.container.textContent).not.toContain("—");
  });

  it.each(["catalog", "featured", "compact"] as const)("keeps the fact contract in the %s variant", (variant) => {
    renderCard(project(), variant);
    expect(screen.getByText("$1,600")).toBeInTheDocument();
    expect(screen.getByText("3 started · 1 verified")).toBeInTheDocument();
    expect(screen.getByText("92 partial lines")).toBeInTheDocument();
  });
});
