import type { ProjectRow } from "@/lib/projects";

export function selectFeaturedProjects(projects: ProjectRow[], limit = 4): ProjectRow[] {
  return [...projects]
    .sort((a, b) => featuredScore(b) - featuredScore(a)
      || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function featuredScore(project: ProjectRow): number {
  const rpps = project.rpps;
  return (project.is_demo ? 0 : 10_000)
    + project.successful_reproduction_count * 200
    + project.reproduction_count * 30
    + (project.reproducibility_score ?? 0)
    + Math.min(rpps.bom?.length ?? 0, 25) * 2
    + Math.min(rpps.assembly?.length ?? 0, 10) * 3
    + Math.min(rpps.evidence?.length ?? 0, 10) * 4
    + (project.cover_image_url ? 20 : 0);
}
