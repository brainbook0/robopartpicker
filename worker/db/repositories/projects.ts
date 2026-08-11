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
  github_stars: number | null;
  version_label: string | null;
  rpps_schema_version: string | null;
  rpps_json: string | null;
  reproduction_count: number;
  successful_reproduction_count: number;
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
  reproduction_count: number;
  successful_reproduction_count: number;
  rpps_version: string;
  rpps: RppsPackage;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  githubStars: number | null;
};

export type ProjectFileDto = {
  id: string;
  projectVersionId: string | null;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  visibility: "private" | "organization" | "public";
  status: "pending" | "quarantined" | "ready" | "rejected";
  kind: string;
  purpose: string;
  relativePath: string | null;
  caption: string | null;
  altText: string | null;
  createdAt: string;
  updatedAt: string;
  contentUrl: string;
};

const SELECT_PROJECT = `SELECT p.id, p.slug, p.name, p.summary, p.description, p.owner_user_id,
  p.organization_id, p.visibility, p.status, p.license_spdx, p.repository_url, p.difficulty,
  p.estimated_cost_minor, p.estimated_cost_currency, p.is_demo, p.version, p.created_at, p.updated_at,
  p.github_stars,
  pv.version_label, pv.rpps_schema_version, pv.rpps_json,
  (SELECT COUNT(*) FROM rpps_build_passports bp
    JOIN rpps_releases rr ON rr.id = bp.release_id
    JOIN builds b ON b.id = bp.build_id AND b.deleted_at IS NULL
    WHERE rr.project_id = p.id) AS reproduction_count,
  (SELECT COUNT(*) FROM rpps_build_outcomes outcome
    JOIN rpps_releases rr ON rr.id = outcome.release_id
    JOIN builds b ON b.id = outcome.build_id AND b.deleted_at IS NULL
    WHERE rr.project_id = p.id AND outcome.outcome = 'succeeded' AND outcome.independence = 'independent') AS successful_reproduction_count
  FROM projects p LEFT JOIN project_versions pv ON pv.id = p.current_version_id`;

export class ProjectsRepository {
  constructor(private readonly db: D1Database) {}

  async listVisible(userId: string | null, options: { q?: string; mine?: boolean; limit: number; offset: number; sort?: "popularity" | "updated" | "name" }): Promise<{ items: ProjectDto[]; total: number }> {
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
    const rows = await this.db.prepare(`${SELECT_PROJECT} ${where} ORDER BY ${this.orderBy(options.sort)} LIMIT ?${values.length + 1} OFFSET ?${values.length + 2}`)
      .bind(...values, options.limit, options.offset).all<ProjectDatabaseRow>();
    return { items: rows.results.map(toProjectDto), total: Number(count?.total ?? 0) };
  }

  private orderBy(sort: "popularity" | "updated" | "name" | undefined): string {
    switch (sort) {
      case "name": return "p.name COLLATE NOCASE ASC, p.github_stars DESC";
      case "updated": return "p.updated_at DESC";
      case "popularity":
      default: return "COALESCE(p.github_stars, -1) DESC, p.updated_at DESC";
    }
  }

  async find(idOrSlug: string): Promise<{ row: ProjectDatabaseRow; item: ProjectDto } | null> {
    const row = await this.db.prepare(`${SELECT_PROJECT} WHERE p.deleted_at IS NULL AND (p.id = ?1 OR p.slug = ?1)`)
      .bind(idOrSlug).first<ProjectDatabaseRow>();
    return row ? { row, item: toProjectDto(row) } : null;
  }

  async listFiles(projectId: string, publicOnly: boolean): Promise<ProjectFileDto[]> {
    const result = await this.db.prepare(`SELECT f.id, pf.project_version_id, f.original_name, f.media_type,
      f.size_bytes, f.checksum_sha256, f.visibility, f.status, f.kind, pf.purpose, pf.relative_path,
      pm.caption, pm.alt_text, f.created_at, f.updated_at
      FROM project_files pf
      JOIN files f ON f.id = pf.file_id
      LEFT JOIN project_media pm ON pm.project_id = pf.project_id AND pm.file_id = pf.file_id
      WHERE pf.project_id = ?1 AND f.deleted_at IS NULL
        AND (?2 = 0 OR (f.visibility = 'public' AND f.status = 'ready'))
      ORDER BY COALESCE(pm.sort_order, 2147483647), pf.relative_path, f.original_name`)
      .bind(projectId, publicOnly ? 1 : 0).all<{
        id: string; project_version_id: string | null; original_name: string; media_type: string;
        size_bytes: number; checksum_sha256: string | null; visibility: ProjectFileDto["visibility"];
        status: ProjectFileDto["status"]; kind: string; purpose: string; relative_path: string | null;
        caption: string | null; alt_text: string | null; created_at: string; updated_at: string;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      projectVersionId: row.project_version_id,
      originalName: row.original_name,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes,
      checksumSha256: row.checksum_sha256,
      visibility: row.visibility,
      status: row.status,
      kind: row.kind,
      purpose: row.purpose,
      relativePath: row.relative_path,
      caption: row.caption,
      altText: row.alt_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      contentUrl: `/api/v1/files/${row.id}/content`,
    }));
  }

  async detachFile(projectId: string, fileId: string): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare("DELETE FROM project_media WHERE project_id = ?1 AND file_id = ?2").bind(projectId, fileId),
      this.db.prepare("DELETE FROM project_files WHERE project_id = ?1 AND file_id = ?2").bind(projectId, fileId),
    ]);
    return Number(results[1].meta.changes) === 1;
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
      await this.replaceNormalizedProjectData(
        projectId,
        versionId,
        input.ownerUserId,
        input.ownerUserId,
        input.organizationId ?? null,
        input.visibility,
        rpps,
      );
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new AppError(409, "PROJECT_SLUG_TAKEN", "That project slug is already in use.");
      throw error;
    }
    return (await this.find(projectId))!.item;
  }

  async updateRpps(projectId: string, expectedVersion: number, userId: string, rpps: RppsPackage): Promise<ProjectDto> {
    const current = await this.find(projectId);
    if (!current) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      const results = await this.db.batch([
        this.db.prepare(`INSERT INTO project_versions
          (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at)
          SELECT ?1, ?2, ?3, ?4, 'RPPS package updated', ?5, 'published', ?6, ?7, ?7
          WHERE EXISTS (SELECT 1 FROM projects WHERE id = ?2 AND version = ?8)`)
          .bind(versionId, projectId, rpps.version, rpps.rpps_version, JSON.stringify(rpps), userId, now, expectedVersion),
        this.db.prepare(`UPDATE project_versions SET status = 'superseded'
          WHERE project_id = ?1 AND id <> ?2 AND status = 'published'
          AND EXISTS (SELECT 1 FROM projects WHERE id = ?1 AND version = ?3)`).bind(projectId, versionId, expectedVersion),
        this.db.prepare(`UPDATE projects SET slug = ?1, name = ?2, summary = ?3, description = ?4,
          current_version_id = ?5, license_spdx = ?6, repository_url = ?7, difficulty = ?8,
          estimated_cost_minor = ?9, version = version + 1, updated_at = ?10 WHERE id = ?11 AND version = ?12`)
          .bind(rpps.slug, rpps.name, rpps.summary ?? null, rpps.description ?? null, versionId, rpps.license ?? null,
            rpps.repo_url ?? null, rpps.build?.difficulty ?? null,
            rpps.build?.estimated_cost_usd == null ? null : Math.round(rpps.build.estimated_cost_usd * 100), now, projectId, expectedVersion),
      ]);
      if (Number(results[2].meta.changes) < 1) throw new AppError(409, "PROJECT_VERSION_CONFLICT", "The project changed; refresh and retry.");
      await this.replaceNormalizedProjectData(
        projectId,
        versionId,
        userId,
        current.row.owner_user_id ?? userId,
        current.row.organization_id,
        current.row.visibility,
        rpps,
      );
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new AppError(409, "PROJECT_VERSION_CONFLICT", "That project slug or version already exists.");
      throw error;
    }
    return (await this.find(projectId))!.item;
  }

  async updateScope(
    projectId: string,
    expectedVersion: number,
    organizationId: string | null,
    visibility: ProjectDatabaseRow["visibility"],
  ): Promise<ProjectDto> {
    const current = await this.find(projectId);
    if (!current) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
    const now = new Date().toISOString();
    const [updated] = await this.db.batch([
      this.db.prepare(`UPDATE projects SET organization_id = ?1, visibility = ?2, version = version + 1, updated_at = ?3
        WHERE id = ?4 AND version = ?5`).bind(organizationId, visibility, now, projectId, expectedVersion),
      this.db.prepare(`UPDATE boms SET
        owner_user_id = (SELECT owner_user_id FROM projects WHERE id = ?1),
        organization_id = (SELECT organization_id FROM projects WHERE id = ?1),
        visibility = (SELECT visibility FROM projects WHERE id = ?1),
        updated_at = ?2
        WHERE project_id = ?1`).bind(projectId, now),
    ]);
    if (Number(updated.meta.changes) < 1) throw new AppError(409, "PROJECT_VERSION_CONFLICT", "The project changed; refresh and retry.");
    return (await this.find(projectId))!.item;
  }

  async softDelete(projectId: string): Promise<void> {
    await this.db.prepare("UPDATE projects SET deleted_at = ?1, status = 'archived', updated_at = ?1 WHERE id = ?2")
      .bind(new Date().toISOString(), projectId).run();
  }

  private async replaceNormalizedProjectData(
    projectId: string,
    versionId: string,
    actorUserId: string,
    ownerUserId: string,
    organizationId: string | null,
    visibility: ProjectDatabaseRow["visibility"],
    rpps: RppsPackage,
  ): Promise<void> {
    const now = new Date().toISOString();
    const bomId = `project-bom-${projectId}`;
    const bomVersionId = `project-bom-version-${versionId}`;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO boms
        (id, project_id, owner_user_id, organization_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9)
        ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name,
          owner_user_id = excluded.owner_user_id, organization_id = excluded.organization_id,
          current_version_id = excluded.current_version_id, visibility = excluded.visibility, updated_at = excluded.updated_at`)
        .bind(bomId, projectId, ownerUserId, organizationId, `${rpps.slug}-bom`, `${rpps.name} BOM`, bomVersionId, visibility, now),
      this.db.prepare(`INSERT INTO bom_versions (id, bom_id, version_label, notes, currency, created_by_user_id, created_at)
        VALUES (?1, ?2, ?3, 'Generated from the published RPPS package', 'USD', ?4, ?5)`).bind(bomVersionId, bomId, rpps.version, actorUserId, now),
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
    Array.from(new Set(rpps.build?.required_tools ?? [])).forEach((label, index) => {
      statements.push(this.db.prepare(`INSERT INTO project_requirements
        (id, project_version_id, requirement_type, label, required, sort_order)
        VALUES (?1, ?2, 'tool', ?3, 1, ?4)`)
        .bind(crypto.randomUUID(), versionId, label, index));
    });
    Array.from(new Set(rpps.build?.required_skills ?? [])).forEach((label, index) => {
      statements.push(this.db.prepare(`INSERT INTO project_requirements
        (id, project_version_id, requirement_type, label, required, sort_order)
        VALUES (?1, ?2, 'skill', ?3, 1, ?4)`)
        .bind(crypto.randomUUID(), versionId, label, index));
    });
    (rpps.evidence ?? []).forEach((evidence, index) => {
      const evidenceId = crypto.randomUUID();
      const confidence = evidence.confidence ?? 0.5;
      statements.push(
        this.db.prepare(`INSERT INTO evidence
          (id, source_type, source_url, title, retrieved_at, confidence, excerpt, is_demo, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?4, 0, ?7)`)
          .bind(evidenceId, evidence.source_type, evidence.source_url ?? null, evidence.claim, evidence.retrieved_at ?? now, confidence, now),
        this.db.prepare(`INSERT INTO evidence_claims
          (id, evidence_id, entity_type, entity_id, claim_key, claim_value, confidence, created_at)
          VALUES (?1, ?2, 'project', ?3, ?4, ?5, ?6, ?7)`)
          .bind(crypto.randomUUID(), evidenceId, projectId, `rpps.evidence.${index}`, evidence.claim, confidence, now),
      );
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
    reproduction_count: Number(row.reproduction_count ?? 0),
    successful_reproduction_count: Number(row.successful_reproduction_count ?? 0),
    rpps_version: row.rpps_schema_version ?? rpps.rpps_version,
    rpps,
    is_demo: row.is_demo === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    githubStars: row.github_stars ?? null,
  };
}
