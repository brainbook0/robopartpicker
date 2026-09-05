import { describe, expect, it } from "vitest";
import indexSource from "../pages/Index.tsx?raw";
import projectsIndexSource from "../pages/ProjectsIndex.tsx?raw";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";
import projectPreviewCardSource from "../components/projects/ProjectPreviewCard.tsx?raw";

describe("shared ProjectMedia page integration", () => {
  it("routes both homepage project collections through the shared preview card", () => {
    expect(indexSource).toContain('import { ProjectPreviewCard } from "@/components/projects/ProjectPreviewCard";');
    expect(indexSource).toContain("<ProjectPreviewCard");
    expect(projectPreviewCardSource).toContain('import { ProjectMedia } from "@/components/projects/ProjectMedia";');
    expect(projectPreviewCardSource).toContain('<ProjectMedia project={project} mode="card"');
    expect(indexSource).not.toContain("function projectMedia(");
  });

  it("uses the shared preview card for catalog media instead of a local image grid", () => {
    expect(projectsIndexSource).toContain('import { ProjectPreviewCard } from "@/components/projects/ProjectPreviewCard";');
    expect(projectsIndexSource).toContain('<ProjectPreviewCard key={p.id} project={p} variant="catalog"');
    expect(projectsIndexSource).not.toContain("const media = [");
  });

  it("uses ProjectMedia for the meaningful detail header visual", () => {
    expect(projectDetailSource).toContain('import { ProjectMedia } from "@/components/projects/ProjectMedia";');
    expect(projectDetailSource).toContain('<ProjectMedia project={p} mode="detail" maxItems={isCommercialShowcase ? 4 : 1}');
    expect(projectDetailSource).not.toContain("src={cover}");
    expect(projectDetailSource).not.toContain("No cover");
  });
});
