import { describe, expect, it } from "vitest";
import projectsIndexSource from "../pages/ProjectsIndex.tsx?raw";
import projectsClientSource from "./projects.ts?raw";

describe("project trend catalog integration", () => {
  it("requests server-ranked trend pages instead of re-sorting only the loaded client window", () => {
    expect(projectsClientSource).toContain('sort?: "completeness" | "popularity" | "trend" | "updated" | "name" | "cost_asc" | "repro_desc"');
    expect(projectsClientSource).toContain('params.set("sort", options.sort ?? "completeness")');
    expect(projectsIndexSource).toContain('<option value="completeness">Most complete information</option>');
    expect(projectsIndexSource).toContain('|| "completeness"');
    expect(projectsIndexSource).toContain('<option value="trend">Trending now</option>');
    expect(projectsIndexSource).toContain("listProjectsPage(1, pageSize, queryOptions)");
    expect(projectsIndexSource).toContain("const filtered = rows");
  });
});
