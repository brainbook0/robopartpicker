import { describe, expect, it } from "vitest";
import claimPanelSource from "@/components/projects/ProjectClaimPanel.tsx?raw";
import claimsApiSource from "@/lib/api/projectClaims.ts?raw";

describe("project claim UI contract", () => {
  it("uploads evidence privately and never attaches it to the public project", () => {
    expect(claimPanelSource).toContain('uploadFile(evidenceFile, "test_evidence", "private")');
    expect(claimPanelSource).not.toContain("attachFile(");
    expect(claimPanelSource).toContain("Evidence stays private");
  });

  it("supports eligibility, submission, claimant history, and withdrawal", () => {
    expect(claimsApiSource).toContain("claim-eligibility");
    expect(claimsApiSource).toContain("/project-claims/mine");
    expect(claimsApiSource).toContain("/claims`");
    expect(claimsApiSource).toContain("/withdraw`");
  });
});
