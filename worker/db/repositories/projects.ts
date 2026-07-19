import type { RppsPackage } from "../../../src/lib/rpps/schema";
import { AppError } from "../../http";

type ProjectDatabaseRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  owner_user_id: string | null;
  organization_id: string | null;
  visibility: "private" | "organization" | "unlisted" | "public";
  status: "draft" | "review" | "published" | "archived";
  license_spdx: string | null;
  repository_url: string | null;
  difficulty: string | null;
  estimated_cost_minor: number | null;
  estimated_cost_currency: string | null;
  is_demo: number;
  version: number;
  created_at: string;
  updated_at: string;
  version_label: string | null;
  rpps_schema_version: string | null;
  rpps_json: string | null;
};

export type ProjectDto = {
  id: string;
  owner_id: string | null;
  organization_id: string | null;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  license: string | null;
  version: string;
  record_version: number;
  status: ProjectDatabaseRow["status"];
  visibility: ProjectDatabaseRow["visibility"];
  repo_url: string | null;
  docs_url: string | null;
  cover_image_url: string | null;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | "expert" | null;
  estimated_cost_usd: number | null;
  reproducibility_score: number | null;
  rpps_version: string;
  rpps: RppsPackage;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT_PROJECT = `SELECT p.id, p.slug, p.name, p.summary, p.description, p.owner_user_id,
  p.organization_id, p.visibility, p.status, p.license_spdx, p.repository_url, p.difficulty,
  p.estimated_cost_minor, p.estimated_cost_currency, p.is_demo, p.version, p.created_at, p.updated_at,
  pv.version_label, pv.rpps_schema_version, pv.rpps_json
  FROM projects p LEFT JOIN project_versions pv ON pv.id = p.current_version_id`;

export class ProjectsRepository {
  constructor(private readonly db: D1Database) {}

  async listVisible(userId: string | null, options: { q?: string; mine?: boolean; limit: number; offset: number }): Promise<{ items: ProjectDto[]; total: number }> {
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `?${values.length}`; };
    const access = options.mine
      ? userId ? `(p.owner_user_id = ${bind(userId)} OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id AND om.user_id = ${bind(userId)} AND om.status = 'active'))` : "0"
      : userId
        ? `(p.status = 'published' AND p.visibility = 'public') OR p.owner_user_id = ${bind(userId)} OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id AND om.user_id = ${bind(userId)} AND om.status = 'active')`
        : "p.status = 'published' AND p.visibility = 'public'";
    const clauses = ["p.deleted_at IS NULL", `(${access})`];
    if (options.q) {
      const term = bind(`%${options.q.toLowerCase()}%`);
      clauses.push(`(lower(p.name) LIKE ${term} OR lower(COALESCE(p.summary, '')) LIKE ${term})`);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const count = await this.db.prepare(`SELECT COUNT(*) AS total FROM projects p ${where}`).bind(...values).first<{ total: number }>();
    const rows = await this.db.prepare(`${SELECT_PROJECT} ${where} ORDER BY p.updated_at DESC LIMIT ?${values.length + 1} OFFSET ?${values.length + 2}`)
      .bind(...values, options.limit, options.offset).all<ProjectDatabaseRow>();
    return { items: rows.results.map(toProjectDto), total: Number(count?.total ?? 0) };
  }

  async find(idOrSlug: string): Promise<{ row: ProjectDatabaseRow; item: ProjectDto } | null> {
    const row = await this.db.prepare(`${SELECT_PROJECT} WHERE p.deleted_at IS NULL AND (p.id = ?1 OR p.slug = ?1)`)
      .bind(idOrSlug).first<ProjectDatabaseRow>();
    return row ? { row, item: toProjectDto(row) } : null;
  }

  async create(input: {
    ownerUserId: string;
    organizationId?: string | null;
    visibility: ProjectDatabaseRow["visibility"];
    rpps: RppsPackage;
  }): Promise<ProjectDto> {
    const projectId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { rpps } = input;
    try {
      await this.db.batch([
        this.db.prepare(`INSERT INTO projects
          (id, slug, name, summary, description, owner_user_id, organization_id, visibility, status,
           current_version_id, license_spdx, repository_url, difficulty, estimated_cost_minor,
           estimated_cost_currency, is_demo, version, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'published', ?9, ?10, ?11, ?12, ?13, 'USD', 0, 1, ?14, ?14)`)
          .bind(projectId, rpps.slug, rpps.name, rpps.summary ?? null, rpps.description ?? null, input.ownerUserId,
            input.organizationId ?? null, input.visibility, versionId, rpps.license ?? null, rpps.repo_url ?? null,
            rpps.build?.difficulty ?? null, rpps.build?.estimated_cost_usd == null ? null : Math.round(rpps.build.estimated_cost_usd * 100), now),
        this.db.prepare(`INSERT INTO project_versions
          (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at)
          VALUES (?1, ?2, ?3, ?4, 'Initial publication', ?5, 'published', ?6, ?7, ?7)`)
          .bind(versionId, projectId, rpps.version, rpps.rpps_version, JSON.stringify(rpps), input.ownerUserId, now),
        this.db.prepare(`INSERT INTO project_maintainers (project_id, user_id, role, created_at)
          VALUES (?1, ?2, 'owner', ?3)`).bind(projectId, input.ownerUserId, now),
      ]);
      await this.replaceNormalizedProjectData(projectId, versionId, input.ownerUserId, input.visibility, rpps);
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new AppError(409, "PROJECT_SLUG_TAKEN", "That project slug is already in use.");
      throw error;
    }
    return (await this.find(projectId))!.item;
  }

  async updateRpps(projectId: string, userId: string, rpps: RppsPackage): Promise<ProjectDto> {
    const current = await this.find(projectId);
    if (!current) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await this.db.batch([
        this.db.prepare(`UPDATE project_versions SET status = 'superseded' WHERE project_id = ?1 AND status = 'published'`).bind(projectId),
        this.db.prepare(`INSERT INTO project_versions
          (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at)
          VALUES (?1, ?2, ?3, ?4, 'RPPS package updated', ?5, 'published', ?6, ?7, ?7)`)
          .bind(versionId, projectId, rpps.version, rpps.rpps_version, JSON.stringify(rpps), userId, now),
        this.db.prepare(`UPDATE projects SET slug = ?1, name = ?2, summary = ?3, description = ?4,
          current_version_id = ?5, license_spdx = ?6, repository_url = ?7, difficulty = ?8,
          estimated_cost_minor = ?9, version = version + 1, updated_at = ?10 WHERE id = ?11`)
          .bind(rpps.slug, rpps.name, rpps.summary ?? null, rpps.description ?? null, versionId, rpps.license ?? null,
            rpps.repo_url ?? null, rpps.build?.difficulty ?? null,
            rpps.build?.estimated_cost_usd == null ? null : Math.round(rpps.build.estimated_cost_usd * 100), now, projectId),
      ]);
      await this.replaceNormalizedProjectData(projectId, versionId, userId, current.row.visibility, rpps);
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new AppError(409, "PROJECT_VERSION_CONFLICT", "That project slug or version already exists.");
      throw error;
    }
    return (await this.find(projectId))!.item;
  }

  async softDelete(projectId: string): Promise<void> {
    await this.db.prepare("UPDATE projects SET deleted_at = ?1, status = 'archived', updated_at = ?1 WHERE id = ?2")
      .bind(new Date().toISOString(), projectId).run();
  }

  private async replaceNormalizedProjectData(projectId: string, versionId: string, userId: string, visibility: ProjectDatabaseRow["visibility"], rpps: RppsPackage): Promise<void> {
    const now = new Date().toISOString();
    const bomId = `project-bom-${projectId}`;
    const bomVersionId = `project-bom-version-${versionId}`;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO boms (id, project_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?7)
        ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name,
          current_version_id = excluded.current_version_id, visibility = excluded.visibility, updated_at = excluded.updated_at`)
        .bind(bomId, projectId, `${rpps.slug}-bom`, `${rpps.name} BOM`, bomVersionId, visibility, now),
      this.db.prepare(`INSERT INTO bom_versions (id, bom_id, version_label, notes, currency, created_by_user_id, created_at)
        VALUES (?1, ?2, ?3, 'Generated from the published RPPS package', 'USD', ?4, ?5)`).bind(bomVersionId, bomId, rpps.version, userId, now),
    ];
    rpps.bom.forEach((item, index) => {
      statements.push(this.db.prepare(`INSERT INTO bom_items
        (id, bom_version_id, slot_key, description, quantity, unit, target_unit_price_minor, notes, sort_order)
        VALUES (?1, ?2, ?3, ?4, ?5, 'each', ?6, ?7, ?8)`)
        .bind(crypto.randomUUID(), bomVersionId, item.ref ?? `item-${index + 1}`, item.name, item.qty,
          item.unit_cost_usd == null ? null : Math.round(item.unit_cost_usd * 100), item.notes ?? null, index));
    });
    (rpps.assembly ?? []).forEach((step, index) => {
      statements.push(this.db.prepare(`INSERT INTO project_steps
        (id, project_version_id, step_key, title, body, sort_order, estimated_minutes)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind(crypto.randomUUID(), versionId, step.id || `step-${index + 1}`, step.title, step.body ?? "", index, step.duration_min ?? null));
    });
    (rpps.known_issues ?? []).forEach((issue) => {
      statements.push(this.db.prepare(`INSERT INTO project_known_issues
        (id, project_version_id, title, description, severity, status, created_at)
        VALUES (?1, ?2, ?3, ?4, 'medium', 'open', ?5)`)
        .bind(crypto.randomUUID(), versionId, issue.title, issue.body ?? "", now));
    });
    for (let index = 0; index < statements.length; index += 75) await this.db.batch(statements.slice(index, index + 75));
  }
}

function toProjectDto(row: ProjectDatabaseRow): ProjectDto {
  if (!row.rpps_json) throw new Error(`Project ${row.id} has no current RPPS version.`);
  const rpps = JSON.parse(row.rpps_json) as RppsPackage;
  return {
    id: row.id,
    owner_id: row.owner_user_id,
    organization_id: row.organization_id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    description: row.description,
    license: row.license_spdx,
    version: row.version_label ?? rpps.version,
    record_version: row.version,
    status: row.status,
    visibility: row.visibility,
    repo_url: row.repository_url,
    docs_url: rpps.docs_url ?? null,
    cover_image_url: rpps.cover_image_url ?? null,
    tags: rpps.tags ?? [],
    difficulty: (row.difficulty as ProjectDto["difficulty"]) ?? null,
    estimated_cost_usd: row.estimated_cost_minor == null ? null : row.estimated_cost_minor / 100,
    reproducibility_score: null,
    rpps_version: row.rpps_schema_version ?? rpps.rpps_version,
    rpps,
    is_demo: row.is_demo === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
