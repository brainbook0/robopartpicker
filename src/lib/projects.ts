import { api } from "@/lib/api/client";
import { emptyRpps, RPPS_VERSION, slugify, validateRpps, type RppsPackage } from "@/lib/rpps/schema";
import type { PortableRppsManifest, RppsValidationReport } from "@/lib/rpps/portable";

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
  reproduction_count: number;
  successful_reproduction_count: number;
  rpps_version: string;
  rpps: RppsPackage;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  githubStars: number | null;
  upstream_url: string | null;
  upstream_identity: string | null;
  maintainer: string | null;
  revision: string | null;
  ingested_at: string | null;
  last_checked_at: string | null;
  publishability: "ready" | "review" | "incomplete" | "blocked";
};

export async function listPublicProjects(): Promise<ProjectRow[]> {
  return (await api.get<{ items: ProjectRow[] }>("/api/v1/projects?limit=1000&sort=popularity")).items;
}

export async function listProjectsPage(page: number, limit = 1000): Promise<{ items: ProjectRow[]; total: number }> {
  return await api.get<{ items: ProjectRow[]; total: number }>(`/api/v1/projects?limit=${limit}&sort=popularity&page=${page}`);
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

export async function updateProjectRpps(projectId: string, version: number, rpps: RppsPackage): Promise<ProjectRow> {
  const check = validateRpps(rpps);
  if (check.ok === false) throw new Error("Invalid RPPS package: " + check.errors.join("; "));
  return (await api.put<{ item: ProjectRow }>(`/api/v1/projects/${encodeURIComponent(projectId)}/rpps`, { version, rpps: check.data })).item;
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/api/v1/projects/${encodeURIComponent(projectId)}`);
}

// ---------- Lineage / forks ----------

export type ForkSummary = {
  id: string;
  slug: string;
  name: string;
  version: string | null;
  visibility: "private" | "organization" | "unlisted" | "public";
  status: "draft" | "review" | "published" | "archived";
  upstreamRevision: string | null;
  cloneCreatedAt: string | null;
  changeSummary: string | null;
  updatedAt: string;
};

export async function listForks(projectId: string, direction: "upstream" | "downstream"): Promise<ForkSummary[]> {
  return (await api.get<{ items: ForkSummary[] }>(`/api/v1/projects/${encodeURIComponent(projectId)}/forks?direction=${direction}`)).items;
}

export async function cloneProject(projectId: string, input: { name?: string; visibility?: ProjectRow["visibility"]; changeSummary?: string }): Promise<ProjectRow> {
  return (await api.post<{ item: ProjectRow }>(`/api/v1/projects/${encodeURIComponent(projectId)}/clone`, input)).item;
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
};

export type ProjectImportAnalysis = {
  schemaVersion: "project-import-analysis/3";
  sourceType: "github" | "rpps" | "bom" | "urdf" | "archive" | "files";
  sourceLabel: string;
  analyzedAt: string;
  draft: GithubDraft;
  inventory: {
    totalFiles: number;
    relevantFiles: number;
    truncated: boolean;
    detected: string[];
    artifacts: Array<{ path: string; kind: string; sizeBytes: number | null; sha256?: string; sourceUrl?: string; sourceRevision?: string }>;
  };
  retrieval: {
    mode: "reference" | "uploaded" | "inline";
    provider: "github" | "r2" | "request";
    requestCount: number;
    attemptedFiles: number;
    fetchedFiles: number;
    failedFiles: number;
    fetchedBytes: number;
    inventoryOnlyFiles: number;
    mirroredFiles: number;
    limits: { maxFetchedFiles: number; maxFetchedBytes: number; maxFileBytes: number };
  };
  sourceMappings: Array<{ objectType: string; objectStableId: string; sourceUrl?: string; sourcePath: string; sourceRevision?: string; parserId: string; confidence: number }>;
  extracted: {
    parts: {
      sourcePaths: string[];
      candidates: Array<{ id: string; name: string; quantity: number; unit: string; manufacturer?: string; mpn?: string; fabricated: boolean; optional: boolean; sourcePath: string; confidence: number; extractionMethod: "explicit-bom" | "rpps-manifest" }>;
      modelCandidates: Array<{ name: string; linkName: string; meshPath: string; classification: "fabricated-or-assembly"; purchasablePartInferred: false; sourcePath: string; confidence: number }>;
    };
    model: null | { sourcePath: string; robotName?: string; linkCount: number; jointCount: number; movableJointCount: number; jointTypes: Record<string, number>; joints: Array<{ name: string; type: string; parent?: string; child?: string; axis?: string; lower?: number; upper?: number; effort?: number; velocity?: number }>; meshPaths: string[]; materialNames: string[]; transmissionCount: number };
    software: { packages: Array<{ ecosystem: "ros" | "npm" | "python" | "cargo" | "platformio"; name: string; version?: string; dependencies: string[]; sourcePath: string }> };
    configuration: { parameters: Array<{ sourcePath: string; keyPath: string; valueType: "string" | "number" | "boolean" | "null" }> };
    repository: { readmes: string[]; licenses: string[]; contributionGuides: string[]; changelogs: string[]; ciDefinitions: string[]; testArtifacts: string[]; firmwareArtifacts: string[]; configurationArtifacts: string[]; nativeCadArtifacts: string[]; manufacturingArtifacts: string[] };
    procedureCandidates: Array<{ id: string; kind: "assembly" | "configuration" | "calibration" | "test" | "operation" | "maintenance"; title: string; steps: string[]; sourcePath: string; confidence: number; heuristic: true }>;
    previews: { imagePath?: string; modelPath?: string; modelKind?: "urdf" | "gltf" | "glb" | "stl" | "obj" | "step" };
  };
  manifest: PortableRppsManifest;
  manifestYaml: string;
  report: RppsValidationReport;
  importWarnings: string[];
  deterministic: true;
  aiUsed: false;
};

export async function analyzeProjectSource(input: { sourceType: "github"; repositoryUrl: string } | { sourceType: "rpps" | "bom" | "urdf"; fileName: string; content: string }): Promise<ProjectImportAnalysis> {
  return (await api.post<{ analysis: ProjectImportAnalysis }>("/api/v1/projects/import/analyze", input)).analysis;
}

export async function analyzeProjectArchive(fileId: string): Promise<ProjectImportAnalysis> {
  return (await api.post<{ analysis: ProjectImportAnalysis }>("/api/v1/projects/import/archive", { fileId })).analysis;
}

export async function analyzeStoredProjectFiles(fileIds: string[]): Promise<ProjectImportAnalysis> {
  return (await api.post<{ analysis: ProjectImportAnalysis }>("/api/v1/projects/import/files", { fileIds })).analysis;
}

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
