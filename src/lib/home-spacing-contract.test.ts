import { describe, expect, it } from "vitest";
import indexSource from "../pages/Index.tsx?raw";
import featuredScrollerSource from "../components/home/FeaturedProjectScroller.tsx?raw";

describe("homepage hero spacing", () => {
  it("fills the hero side with completeness-ranked projects and moves metrics below", () => {
    expect(indexSource).toContain('["home-featured", "completeness", "open"]');
    expect(indexSource).toContain('["home-featured", "completeness", "closed"]');
    expect(indexSource).toContain('listProjectsPage(1, 6, { kind: "physical_design", sort: "completeness" })');
    expect(indexSource).toContain('listProjectsPage(1, 6, { kind: "commercial_showcase", category: "humanoid", sort: "completeness" })');
    expect(indexSource).toContain("<FeaturedProjectScroller");
    expect(indexSource).toContain("lg:row-span-2 lg:col-start-2");
    expect(indexSource).toContain("lg:col-start-1 lg:row-start-2");
    expect(indexSource).toContain("data-home-catalog-metrics");
    expect(indexSource).not.toContain("overflow-hidden self-end");
    expect(indexSource).toContain('label="Normalized BOM lines"');
    expect(indexSource).not.toContain('label="Source-verified BOMs"');
  });

  it("keeps featured movement user-controlled", () => {
    expect(featuredScrollerSource).toContain('data-testid="featured-project-rail"');
    expect(featuredScrollerSource).toContain('aria-label="Previous featured project"');
    expect(featuredScrollerSource).toContain('aria-label="Next featured project"');
    expect(featuredScrollerSource).not.toContain("setInterval");
  });
});