import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectMetadataSummary } from "./ProjectMetadataSummary";
import type { ProjectProfileEstimate } from "@/shared/projectEstimate";

const estimate: ProjectProfileEstimate = {
  cost: { amountMinor: 90_000, source: "inferred", confidence: "low", method: "Category baseline." },
  time: { minutes: 1_440, source: "inferred", confidence: "low", method: "Category baseline." },
  methodVersion: "project-point-estimate-v1",
  valuedAt: "2026-08-25T00:00:00Z",
};

describe("ProjectMetadataSummary", () => {
  it("groups identity, source, maturity and estimate metadata", () => {
    render(<ProjectMetadataSummary
      project={{
        version: "1.2.0",
        rpps_version: "1.0",
        project_kind: "physical_design",
        robot_category: "humanoid",
        status: "published",
        publishability: "review",
        license: null,
        repo_url: "https://example.com/product",
        docs_url: null,
        last_checked_at: "2026-08-24T00:00:00Z",
        updated_at: "2026-08-25T00:00:00Z",
        bom_line_count: 42,
        reproduction_count: 3,
        successful_reproduction_count: 1,
        tags: ["humanoid", "commercial"],
        is_demo: false,
      }}
      estimate={estimate}
    />);
    const metadata = screen.getByRole("region", { name: "Project metadata" });

    for (const label of ["Identity", "Source", "Maturity", "Estimates", "Version", "Category", "License", "BOM", "Build cost", "Build time"]) {
      expect(metadata).toHaveTextContent(label);
    }
    expect(metadata).toHaveTextContent("$900");
    expect(metadata).toHaveTextContent("24 h");
    expect(metadata).toHaveTextContent("Inferred · low confidence");
    expect(metadata).not.toHaveTextContent("—");
  });

  it("states when commercial pricing and build time are not published", () => {
    render(<ProjectMetadataSummary
      project={{ version: "1", rpps_version: "1", project_kind: "commercial_showcase", robot_category: "humanoid",
        status: "published", publishability: "review", license: null, repo_url: null, docs_url: "https://example.com/robot",
        last_checked_at: null, updated_at: "2026-08-25T00:00:00Z", bom_line_count: 0, reproduction_count: 0,
        successful_reproduction_count: 0, tags: [], is_demo: false }}
      estimate={{ cost: null, time: null, methodVersion: "project-point-estimate-v1", valuedAt: "2026-08-25" }}
    />);
    const metadata = screen.getByRole("region", { name: "Project metadata" });
    expect(metadata).toHaveTextContent("Official price not published");
    expect(metadata).toHaveTextContent("Not a buildable release");
    expect(metadata).not.toHaveTextContent(/category baseline/iu);
  });

  it("uses explicit language for unavailable public licensing instead of an empty tag", () => {
    render(<ProjectMetadataSummary
      project={{
        version: "0.1.0",
        rpps_version: "1.0",
        project_kind: "physical_design",
        robot_category: null,
        status: "review",
        publishability: "incomplete",
        license: null,
        repo_url: null,
        docs_url: null,
        last_checked_at: null,
        updated_at: "2026-08-25T00:00:00Z",
        bom_line_count: 0,
        reproduction_count: 0,
        successful_reproduction_count: 0,
        tags: [],
        is_demo: false,
      }}
      estimate={estimate}
    />);
    const metadata = screen.getByRole("region", { name: "Project metadata" });

    expect(metadata).toHaveTextContent("License not published");
    expect(metadata).toHaveTextContent("Source URL not published");
    expect(metadata).toHaveTextContent("Source BOM not published");
    expect(metadata).not.toHaveTextContent("—");
  });
});
