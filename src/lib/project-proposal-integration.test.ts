import { describe, expect, it } from "vitest";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";

describe("structured project proposal integration", () => {
  it("places signed-in source-linked proposals and owner review controls on project pages", () => {
    expect(projectDetailSource).toContain("<ProjectProposalPanel");
    expect(projectDetailSource).toContain("projectId={p.id}");
    expect(projectDetailSource).toContain("signedIn={Boolean(user)}");
    expect(projectDetailSource).toContain("canReview={canManageScope}");
  });
});
