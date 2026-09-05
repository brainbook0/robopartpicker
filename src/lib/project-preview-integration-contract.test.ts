import { describe, expect, it } from "vitest";
import projectsIndexSource from "@/pages/ProjectsIndex.tsx?raw";
import homeSource from "@/pages/Index.tsx?raw";
import projectDetailSource from "@/pages/ProjectDetail.tsx?raw";

const surfaces = [projectsIndexSource, homeSource, projectDetailSource];

describe("project preview integration contract", () => {
  it("uses the shared preview card on catalog, homepage and related-project surfaces", () => {
    for (const source of surfaces) {
      expect(source).toContain('import { ProjectPreviewCard } from "@/components/projects/ProjectPreviewCard"');
      expect(source).toContain("<ProjectPreviewCard");
    }
  });

  it("does not format raw cost, build or BOM values inside page-local cards", () => {
    expect(projectsIndexSource).not.toContain('<MetaCell label="Cost"');
    expect(projectsIndexSource).not.toContain('<MetaCell label="Builds"');
    expect(projectsIndexSource).not.toContain('<MetaCell label="BOM"');
    expect(homeSource).not.toContain("BOM lines</span>");
    expect(projectDetailSource).not.toContain("project.bom_line_count > 0 ? `${project.bom_line_count} BOM lines`");
  });
});
