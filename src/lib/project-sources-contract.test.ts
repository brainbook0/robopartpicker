import { describe, expect, it } from "vitest";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";

describe("project source and correction surface", () => {
  it("uses Sources & verification and removes standalone Known issues", () => {
    expect(projectDetailSource).toContain("<SourcesVerification evidence={evidence} projectId={p.id} />");
    expect(projectDetailSource).not.toContain('title={`Known issues');
    expect(projectDetailSource).not.toContain('title={`Evidence');
  });

  it("moves issue handling into Discussion & corrections", () => {
    expect(projectDetailSource).toContain('title="Discussion & corrections"');
    expect(projectDetailSource).toContain("Submit assembly steps, integrations, sources, issue reports, or corrections");
  });

  it("uses explicit integration states instead of dashes", () => {
    expect(projectDetailSource).toContain('it.notes ?? "Notes not documented"');
    expect(projectDetailSource).toContain('>Source verification open</span>');
  });
});
