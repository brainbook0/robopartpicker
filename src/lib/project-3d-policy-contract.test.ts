import { describe, expect, it } from "vitest";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";

describe("project complete-assembly viewer contract", () => {
  it("gates every project-level viewer on verified complete-assembly metadata", () => {
    expect(projectDetailSource).toContain("urdfIsCompleteAssembly && previewUrdf?.contentUrl");
    expect(projectDetailSource).toContain("stlIsCompleteAssembly && stlFiles.length > 0");
    expect(projectDetailSource).toContain("stepIsCompleteAssembly && stepFiles.length > 0");
    expect(projectDetailSource).toContain("objIsCompleteAssembly && objFile");
  });

  it("does not use loose project model files as a whole-robot fallback", () => {
    expect(projectDetailSource).not.toContain(": stlFiles.length > 0 ?");
    expect(projectDetailSource).not.toContain(": stepFiles.length > 0 ?");
    expect(projectDetailSource).toContain("Partial component geometry is not rendered as the complete robot");
  });
});
