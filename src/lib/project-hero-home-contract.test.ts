import { describe, expect, it } from "vitest";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";
import homeSource from "../pages/Index.tsx?raw";

describe("project hero and homepage operational copy", () => {
  it("caps detail media at a stable 4:3 surface so tall source images cannot stretch the action column", () => {
    expect(projectDetailSource).toContain('data-project-hero-evidence className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,36%)_minmax(0,1fr)]"');
    expect(projectDetailSource).toContain('className="aspect-[4/3] min-h-[240px] w-full"');
    expect(projectDetailSource).toContain('className="min-h-[240px] lg:self-start"');
    expect(projectDetailSource).toContain('<ProjectMetadataSummary project={p} estimate={profileEstimate} variant="hero" />');
    expect(projectDetailSource).not.toContain('className="h-[140px] w-full md:h-[150px]"');
  });

  it("keeps identity and actions in a full-width row above the media and evidence row", () => {
    const identityActions = projectDetailSource.indexOf("data-project-identity-actions");
    const heroEvidence = projectDetailSource.indexOf("data-project-hero-evidence");
    const media = projectDetailSource.indexOf("<ProjectMedia project={p}");
    const metadata = projectDetailSource.indexOf("<ProjectMetadataSummary project={p}");

    expect(identityActions).toBeGreaterThan(-1);
    expect(heroEvidence).toBeGreaterThan(identityActions);
    expect(media).toBeGreaterThan(heroEvidence);
    expect(metadata).toBeGreaterThan(media);
  });

  it("removes the internal quote-gate slogan from the homepage", () => {
    expect(homeSource).not.toContain("Quote gate");
    expect(homeSource).not.toContain("Fail closed");
    expect(homeSource).toContain("Normalized BOM lines");
    expect(homeSource).not.toContain("Source-verified BOMs");
  });

  it("queries commercial humanoids before pagination instead of filtering one mixed page", () => {
    expect(homeSource).toContain('listProjectsPage(1, 8, { kind: "commercial_showcase", category: "humanoid"');
    expect(homeSource).not.toContain("showcaseRows.filter");
  });
});
