import { describe, expect, it } from "vitest";
import releasePanel from "../components/projects/ReleaseCollaborationPanel.tsx?raw";
import projectDetail from "../pages/ProjectDetail.tsx?raw";
import specifications from "../components/projects/ProjectSpecifications.tsx?raw";

describe("commercial project presentation", () => {
  it("uses human release-integrity copy instead of rendering a raw package hash", () => {
    expect(releasePanel).not.toContain("sha256:{release.packageSha256}");
    expect(releasePanel).toContain("Integrity verified");
  });

  it("never offers build actions for a commercial showcase release", () => {
    expect(projectDetail).toContain("buildActionsEnabled={!isCommercialShowcase}");
    expect(releasePanel).toContain("buildActionsEnabled && release.status === \"published\"");
    expect(releasePanel).toContain("Reference package");
  });

  it("uses a commercial media mosaic and omits empty technical buckets", () => {
    expect(projectDetail).toContain("isCommercialShowcase ? 4 : 1");
    expect(projectDetail).toContain("hasHardwareData");
    expect(projectDetail).toContain("hasSoftwareData");
    expect(projectDetail).toContain("hasBuildData");
    expect(projectDetail).toContain("<ProjectSpecifications projectId={p.id}");
    expect(projectDetail).toContain("Published systems & capabilities");
    expect(projectDetail).toContain("official product view, not a subsystem photograph");
    expect(specifications).toContain("if (!profile.specs.length) return null");
    expect(specifications).not.toContain("does not expose structured specifications");
  });
});
