import type { RppsPackage } from "../../../src/lib/rpps/schema";
import { slugify } from "../../../src/lib/rpps/schema";
import { AppError } from "../../http";
import { ProjectsRepository, type ProjectDto } from "./projects";

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

type ForkRow = {
  id: string;
  slug: string;
  name: string;
  version_label: string | null;
  visibility: ForkSummary["visibility"];
  status: ForkSummary["status"];
  upstream_revision: string | null;
  clone_created_at: string | null;
  change_summary: string | null;
  updated_at: string;
};

const FORK_SELECT = `SELECT p.id, p.slug, p.name, pv.version_label, p.visibility, p.status,
  p.upstream_revision, p.clone_created_at, p.change_summary, p.updated_at
  FROM projects p LEFT JOIN project_versions pv ON pv.id = p.current_version_id`;

export class ProjectGraphRepository {
  constructor(private readonly db: D1Database, private readonly projects = new ProjectsRepository(db)) {}

  /** Clone an existing project into a derivative, preserving attribution
   *  (authors, license) and recording upstream lineage. */
  async clone(userId: string, input: {
    sourceProjectId: string;
    name?: string;
    visibility?: ForkSummary["visibility"];
    changeSummary?: string;
  }): Promise<ProjectDto> {
    const source = await this.projects.find(input.sourceProjectId);
    if (!source) throw new AppError(404, "PROJECT_NOT_FOUND", "Source project not found.");
    const now = new Date().toISOString();
    const name = input.name ?? `${source.item.name} (fork)`;
    const slug = `${slugify(name).slice(0, 70)}-${crypto.randomUUID().slice(0, 8)}`;
    const rpps: RppsPackage = {
      ...source.item.rpps,
      name,
      slug,
      version: "0.1.0",
      summary: `Derived from ${source.item.name}${input.changeSummary ? `: ${input.changeSummary}` : ""}`,
      description: source.item.rpps.description,
      license: source.item.rpps.license,
      repo_url: undefined,
      docs_url: source.item.rpps.docs_url,
      cover_image_url: source.item.rpps.cover_image_url,
      authors: source.item.rpps.authors,
      bom: source.item.rpps.bom,
    };
    return this.projects.create({
      ownerUserId: userId,
      visibility: input.visibility ?? "private",
      rpps,
      maintainer: source.item.maintainer ?? source.item.rpps.authors?.[0]?.name ?? null,
      upstreamProjectId: source.item.id,
      upstreamRevision: source.item.version,
      changeSummary: input.changeSummary ?? null,
    });
  }

  /** Resolve the direct upstream project (or null for root projects). */
  async upstream(projectId: string): Promise<ForkSummary | null> {
    const parent = await this.db.prepare(`SELECT upstream_project_id FROM projects WHERE id = ?1 AND deleted_at IS NULL`)
      .bind(projectId).first<{ upstream_project_id: string | null }>();
    if (!parent?.upstream_project_id) return null;
    const row = await this.db.prepare(`${FORK_SELECT} WHERE p.id = ?1 AND p.deleted_at IS NULL`)
      .bind(parent.upstream_project_id).first<ForkRow>();
    return row ? mapFork(row) : null;
  }

  /** List forks in the requested direction. Downstream = projects whose
   *  `upstream_project_id` equals this project; upstream = the ancestor chain. */
  async listForks(projectId: string, direction: "upstream" | "downstream"): Promise<ForkSummary[]> {
    if (direction === "downstream") {
      const rows = await this.db.prepare(`${FORK_SELECT} WHERE p.upstream_project_id = ?1 AND p.deleted_at IS NULL ORDER BY p.updated_at DESC`)
        .bind(projectId).all<ForkRow>();
      return rows.results.map(mapFork);
    }
    const chain: ForkSummary[] = [];
    const seen = new Set<string>([projectId]);
    let currentId: string | null = projectId;
    while (currentId) {
      const parent: { upstream_project_id: string | null } | null = await this.db.prepare(`SELECT upstream_project_id FROM projects WHERE id = ?1 AND deleted_at IS NULL`)
        .bind(currentId).first();
      currentId = parent?.upstream_project_id ?? null;
      if (!currentId || seen.has(currentId)) break;
      seen.add(currentId);
      const row = await this.db.prepare(`${FORK_SELECT} WHERE p.id = ?1 AND p.deleted_at IS NULL`).bind(currentId).first<ForkRow>();
      if (row) chain.push(mapFork(row));
    }
    return chain;
  }

  /** Return both revisions' RPPS packages for a change comparison. */
  async compare(baseId: string, otherId: string): Promise<{ base: ProjectDto; other: ProjectDto }> {
    const base = await this.projects.find(baseId);
    const other = await this.projects.find(otherId);
    if (!base || !other) throw new AppError(404, "PROJECT_NOT_FOUND", "One or both projects were not found.");
    return { base: base.item, other: other.item };
  }
}

function mapFork(row: ForkRow): ForkSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    version: row.version_label,
    visibility: row.visibility,
    status: row.status,
    upstreamRevision: row.upstream_revision,
    cloneCreatedAt: row.clone_created_at,
    changeSummary: row.change_summary,
    updatedAt: row.updated_at,
  };
}
