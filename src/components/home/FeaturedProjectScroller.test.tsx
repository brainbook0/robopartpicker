import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ProjectRow } from "@/lib/projects";
import { FeaturedProjectScroller } from "@/components/home/FeaturedProjectScroller";

function project(id: string): ProjectRow {
  return {
    id, owner_id: null, slug: `project-${id}`, name: `Project ${id}`, summary: "Source-backed featured project.",
    description: null, license: "MIT", version: "1.0.0", status: "published", project_kind: "physical_design",
    robot_category: "mobile", visibility: "public", repo_url: `https://github.com/example/${id}`, docs_url: null,
    cover_image_url: null, media: [], tags: [], difficulty: null, estimated_cost_usd: null, reproducibility_score: null,
    reproduction_count: 0, successful_reproduction_count: 0, bom_id: null, bom_line_count: 0,
    bom_publication_state: "unavailable", preview_cost_minor: null, preview_cost_kind: null, rpps_version: "1.0.0",
    rpps: { rpps_version: "1.0.0", name: `Project ${id}`, slug: `project-${id}`, version: "1.0.0", bom: [] },
    is_demo: false, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-20T00:00:00.000Z",
    githubStars: 1, upstream_url: `https://github.com/example/${id}`, upstream_identity: `github.com/example/${id}`,
    maintainer: "Example", revision: "v1", ingested_at: "2026-08-01T00:00:00.000Z",
    last_checked_at: "2026-08-20T00:00:00.000Z", publishability: "ready",
  };
}

describe("FeaturedProjectScroller", () => {
  it("renders completeness-ranked projects with explicit controls and position", () => {
    render(<MemoryRouter><FeaturedProjectScroller projects={[project("a"), project("b")]} mode="open" onModeChange={() => undefined} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Featured projects" })).toBeInTheDocument();
    expect(screen.getByText(/Ranked by available project information/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous featured project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next featured project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show open-source featured projects" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Show closed-source featured projects" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Project a project preview/i })).toBeInTheDocument();
  });

  it("moves only when the user activates a control", () => {
    render(<MemoryRouter><FeaturedProjectScroller projects={[project("a"), project("b")]} mode="open" onModeChange={() => undefined} /></MemoryRouter>);
    const rail = screen.getByTestId("featured-project-rail");
    const scrollBy = vi.fn();
    Object.defineProperty(rail, "scrollBy", { value: scrollBy });
    Object.defineProperty(rail, "clientWidth", { value: 500 });
    fireEvent.click(screen.getByRole("button", { name: "Next featured project" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 450, behavior: "smooth" });
  });

  it("renders a fixed loading skeleton and no fake empty cards", () => {
    const { rerender } = render(<MemoryRouter><FeaturedProjectScroller projects={[]} loading mode="open" onModeChange={() => undefined} /></MemoryRouter>);
    expect(screen.getByLabelText("Loading featured projects")).toBeInTheDocument();
    rerender(<MemoryRouter><FeaturedProjectScroller projects={[]} mode="open" onModeChange={() => undefined} /></MemoryRouter>);
    expect(screen.queryByRole("region", { name: "Featured projects" })).not.toBeInTheDocument();
  });
});
