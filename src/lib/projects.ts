import { api } from "@/lib/api/client";
import { emptyRpps, RPPS_VERSION, slugify, validateRpps, type RppsPackage } from "@/lib/rpps/schema";

export type ProjectRow = {
  id: string;
  owner_id: string | null;
  organization_id?: string | null;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  license: string | null;
  version: string;
  record_version?: number;
  status: "draft" | "review" | "published" | "archived";
  visibility: "public" | "organization" | "unlisted" | "private";
  repo_url: string | null;
  docs_url: string | null;
  cover_image_url: string | null;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | "expert" | null;
  estimated_cost_usd: number | null;
  reproducibility_score: number | null;
  rpps_version: string;
  rpps: RppsPackage;
  created_at: string;
  updated_at: string;
};

export async function listPublicProjects(): Promise<ProjectRow[]> {
  return (await api.get<{ items: ProjectRow[] }>("/api/v1/projects?limit=100")).items;
}

export async function listMyProjects(userId: string): Promise<ProjectRow[]> {
  void userId;
  return (await api.get<{ items: ProjectRow[] }>("/api/v1/projects?mine=true&limit=100", { retry: false })).items;
}

export async function getProjectBySlug(slug: string): Promise<ProjectRow | null> {
  try {
    return (await api.get<{ item: ProjectRow }>(`/api/v1/projects/${encodeURIComponent(slug)}`)).item;
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export type NewProjectInput = {
  name: string;
  slug?: string;
  summary?: string;
  description?: string;
  license?: string;
  version?: string;
  visibility?: "public" | "organization" | "unlisted" | "private";
  organizationId?: string | null;
  repo_url?: string;
  docs_url?: string;
  cover_image_url?: string;
  tags?: string[];
  difficulty?: ProjectRow["difficulty"];
  estimated_cost_usd?: number | null;
  rpps?: Partial<RppsPackage>;
};

export async function createProject(userId: string, input: NewProjectInput): Promise<ProjectRow> {
  const slug = slugify(input.slug || input.name);
  const rpps = emptyRpps({
    ...input.rpps,
    name: input.name,
    slug,
    version: input.version ?? "0.1.0",
    summary: input.summary,
    description: input.description,
    license: input.license,
    repo_url: input.repo_url,
    docs_url: input.docs_url,
    cover_image_url: input.cover_image_url ?? input.rpps?.cover_image_url,
    tags: input.tags,
    build: { ...(input.rpps?.build ?? {}), difficulty: input.difficulty ?? undefined, estimated_cost_usd: input.estimated_cost_usd ?? undefined },
  });
  const check = validateRpps(rpps);
  if (check.ok === false) throw new Error("Invalid RPPS package: " + check.errors.join("; "));

  const row = {
    owner_id: userId,
    slug,
    name: input.name,
    summary: input.summary ?? null,
    description: input.description ?? null,
    license: input.license ?? null,
    version: input.version ?? "0.1.0",
    visibility: input.visibility ?? "public",
    repo_url: input.repo_url ?? null,
    docs_url: input.docs_url ?? null,
    cover_image_url: input.cover_image_url ?? check.data.cover_image_url ?? null,
    tags: input.tags ?? [],
    difficulty: input.difficulty ?? null,
    estimated_cost_usd: input.estimated_cost_usd ?? null,
    rpps_version: RPPS_VERSION,
    rpps: check.data as any,
  };
  void userId;
  return (await api.post<{ item: ProjectRow }>("/api/v1/projects", {
    visibility: row.visibility,
    organizationId: input.organizationId ?? null,
    rpps: check.data,
  })).item;
}

export async function updateProjectScope(projectId: string, input: {
  version: number;
  organizationId: string | null;
  visibility: ProjectRow["visibility"];
}): Promise<ProjectRow> {
  return (await api.patch<{ item: ProjectRow }>(`/api/v1/projects/${encodeURIComponent(projectId)}`, input)).item;
}

export async function updateProjectRpps(projectId: string, rpps: RppsPackage): Promise<void> {
  const check = validateRpps(rpps);
  if (check.ok === false) throw new Error("Invalid RPPS package: " + check.errors.join("; "));
  await api.put(`/api/v1/projects/${encodeURIComponent(projectId)}/rpps`, { rpps: check.data });
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/api/v1/projects/${encodeURIComponent(projectId)}`);
}

// ---------- GitHub import ----------
// Parses a public GitHub URL, fetches repo metadata + README via the public API,
// and returns a draft RPPS scaffold. Untrusted content: never treated as instructions.
export type GithubDraft = {
  name: string;
  slug: string;
  summary: string;
  description: string;
  repo_url: string;
  license?: string;
  tags: string[];
  cover_image_url?: string;
};

export async function draftFromGithub(repoUrl: string): Promise<GithubDraft> {
  return (await api.post<{ draft: GithubDraft }>("/api/v1/projects/import/repository", { repositoryUrl: repoUrl })).draft;
}

// ---------- Export helpers ----------
export function downloadRpps(pkg: RppsPackage) {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${pkg.slug}-${pkg.version}.rpps.json`;
  a.click();
  URL.revokeObjectURL(url);
}
