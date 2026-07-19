import { supabase } from "@/integrations/supabase/client";
import { emptyRpps, RPPS_VERSION, slugify, validateRpps, type RppsPackage } from "@/lib/rpps/schema";

export type ProjectRow = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  license: string | null;
  version: string;
  status: "draft" | "published" | "archived";
  visibility: "public" | "unlisted" | "private";
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
  const { data, error } = await supabase
    .from("projects" as any)
    .select("*")
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as ProjectRow[];
}

export async function listMyProjects(userId: string): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("projects" as any)
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProjectRow[];
}

export async function getProjectBySlug(slug: string): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from("projects" as any)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ProjectRow) ?? null;
}

export type NewProjectInput = {
  name: string;
  slug?: string;
  summary?: string;
  description?: string;
  license?: string;
  version?: string;
  visibility?: "public" | "unlisted" | "private";
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
  const { data, error } = await supabase.from("projects" as any).insert(row).select("*").single();
  if (error) throw error;
  return data as unknown as ProjectRow;
}

export async function updateProjectRpps(projectId: string, rpps: RppsPackage): Promise<void> {
  const check = validateRpps(rpps);
  if (check.ok === false) throw new Error("Invalid RPPS package: " + check.errors.join("; "));
  const { error } = await supabase
    .from("projects" as any)
    .update({ rpps: check.data as any, name: check.data.name, summary: check.data.summary ?? null, version: check.data.version })
    .eq("id", projectId);
  if (error) throw error;
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from("projects" as any).delete().eq("id", projectId);
  if (error) throw error;
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
  const m = repoUrl.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) throw new Error("Not a GitHub repository URL");
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, "");
  const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}`).then(r => {
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    return r.json();
  });
  let readme = "";
  try {
    const rd = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { Accept: "application/vnd.github.raw" },
    });
    if (rd.ok) readme = await rd.text();
  } catch { /* readme is optional */ }

  const description: string = readme.slice(0, 8000) || meta.description || "";
  const summary: string = (meta.description || readme.split(/\n/).find((l: string) => l.trim())?.trim() || "").slice(0, 280);
  const tags: string[] = Array.isArray(meta.topics) ? meta.topics.slice(0, 20) : [];
  return {
    name: meta.name || repo,
    slug: slugify(`${owner}-${repo}`),
    summary,
    description,
    repo_url: meta.html_url || repoUrl,
    license: meta.license?.spdx_id || undefined,
    tags,
    cover_image_url: meta.owner?.avatar_url,
  };
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