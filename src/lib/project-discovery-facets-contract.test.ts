import { describe, expect, it } from "vitest";
import projectsIndexSource from "@/pages/ProjectsIndex.tsx?raw";
import facetSource from "@/components/projects/ProjectFacetFilters.tsx?raw";
import routeSource from "../../worker/routes/projects.ts?raw";
import repositorySource from "../../worker/db/repositories/projects.ts?raw";

describe("project discovery facets contract", () => {
  it("defaults the bare discovery route to physical humanoids", () => {
    expect(projectsIndexSource).toContain('(hasExplicitDiscovery ? "" : "physical_design")');
    expect(projectsIndexSource).toContain('(hasExplicitDiscovery ? "" : "humanoid")');
    expect(facetSource).toContain("Physical humanoids");
    expect(projectsIndexSource).toContain("Browse all");
  });

  it("uses server-side facet and sort options instead of loaded-page filtering", () => {
    expect(projectsIndexSource).toContain("facets: true");
    expect(projectsIndexSource).toContain("priceMin: numberParam");
    expect(projectsIndexSource).toContain("priceMax: numberParam");
    expect(projectsIndexSource).toContain("const filtered = rows");
    expect(repositorySource).toContain("projectFilterCostExpression()");
    expect(repositorySource).toContain("latestProjectBomStateExpression()");
    expect(repositorySource).toContain("facetCounts(where, values)");
  });

  it("offers marketplace-grade desktop and mobile filters", () => {
    for (const label of ["Source type", "Robot category", "Estimated build cost", "BOM evidence", "Build evidence", "Difficulty", "Software and artifacts", "Verification freshness"]) {
      expect(facetSource).toContain(label);
    }
    expect(facetSource).toContain('role="dialog"');
    expect(facetSource).toContain('aria-label="Filter projects"');
    expect(routeSource).toContain("priceMin must not exceed priceMax");
    expect(routeSource).toContain("verifiedWithinDays");
  });
});
