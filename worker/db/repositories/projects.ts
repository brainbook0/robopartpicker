import type { RppsPackage } from "../../../src/lib/rpps/schema";
import { classifyProjectKind, projectKindAfterRppsUpdate, type ProjectKind } from "../../../src/shared/projectKind";
import type { RobotCategory } from "../../../src/shared/robotCategory";
import { buildProjectCatalogStatsQuery, buildProjectFilesQuery, buildProjectListQuery, latestProjectBomLineCountExpression, latestProjectBomStateExpression, projectFilterCostExpression, projectSourceClassExpression, type ProjectFacetCounts, type ProjectListFilters, type ProjectListSort } from "../../../src/shared/projectListQuery";
import { computePublishability, resolveUpstreamIdentity } from "../../../src/shared/provenance";
import { normalizeManagedFileUrl } from "../../../src/shared/managedFileUrl";
import { AppError } from "../../http";
import { fileContentUrl } from "../../services/file-urls";

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
  project_kind: ProjectKind;
  robot_category: string | null;
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
  upstream_url: string | null;
  upstream_identity: string | null;
  maintainer: string | null;
  revision: string | null;
  ingested_at: string | null;
  last_checked_at: string | null;
  publishability: "ready" | "review" | "incomplete" | "blocked";
  upstream_project_id: string | null;
  upstream_revision: string | null;
  clone_created_at: string | null;
  change_summary: string | null;
  version_label: string | null;
  rpps_schema_version: string | null;
  rpps_json: string | null;
  reproduction_count: number;
  successful_reproduction_count: number;
  bom_id: string | null;
  bom_line_count: number;
  bom_publication_state?: ProjectDto["bom_publication_state"];
  preview_cost_minor?: number | null;
  preview_cost_currency?: string | null;
  preview_cost_kind?: ProjectDto["preview_cost_kind"];
  preview_cost_confidence?: ProjectDto["preview_cost_confidence"];
  preview_cost_method?: string | null;
  preview_cost_valued_at?: string | null;
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
  project_kind: ProjectKind;
  robot_category: RobotCategory | null;
  visibility: ProjectDatabaseRow["visibility"];
  repo_url: string | null;
  docs_url: string | null;
  cover_image_url: string | null;
  media: Array<{ id: string; contentUrl: string; altText: string | null; caption: string | null }>;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | "expert" | null;
  estimated_cost_usd: number | null;
  reproducibility_score: number | null;
  reproduction_count: number;
  successful_reproduction_count: number;
  bom_id: string | null;
  bom_line_count: number;
  bom_publication_state: "draft" | "verified" | "partial" | "unavailable" | "manufacturer_unavailable" | "not_applicable" | "classification_required" | "rejected" | null;
  preview_cost_minor: number | null;
  preview_cost_currency: string | null;
  preview_cost_kind: "published_price" | "published_range" | "market_estimate" | "published" | "known_bom" | "inferred" | null;
  preview_cost_confidence: "high" | "medium" | "low" | null;
  preview_cost_method: string | null;
  preview_cost_valued_at: string | null;
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
  upstream_project_id: string | null;
  upstream_revision: string | null;
  clone_created_at: string | null;
  change_summary: string | null;
};

export type ProjectCatalogStats = {
  totalProjects: number;
  totalParts: number;
  medianCostMinor: number | null;
  physicalDesignProjects: number;
  roboticsSoftwareProjects: number;
  commercialShowcaseProjects: number;
  publishedProjects: number;
  totalReproductions: number;
  successfulReproductions: number;
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
  p.organization_id, p.visibility, p.status, p.project_kind, p.robot_category, p.license_spdx, p.repository_url, p.difficulty,
  p.estimated_cost_minor, p.estimated_cost_currency, p.is_demo, p.version, p.created_at, p.updated_at,
  p.github_stars, p.upstream_url, p.upstream_identity, p.maintainer, p.revision, p.ingested_at,
  p.last_checked_at, p.publishability, p.upstream_project_id, p.upstream_revision, p.clone_created_at, p.change_summary,
  pv.version_label, pv.rpps_schema_version, pv.rpps_json,
  (SELECT COUNT(*) FROM rpps_build_passports bp
    JOIN rpps_releases rr ON rr.id = bp.release_id
    JOIN builds b ON b.id = bp.build_id AND b.deleted_at IS NULL
    WHERE rr.project_id = p.id) AS reproduction_count,
  (SELECT COUNT(*) FROM rpps_build_outcomes outcome
    JOIN rpps_releases rr ON rr.id = outcome.release_id
    JOIN builds b ON b.id = outcome.build_id AND b.deleted_at IS NULL
    WHERE rr.project_id = p.id AND outcome.outcome = 'succeeded' AND outcome.independence = 'independent') AS successful_reproduction_count,
  (SELECT b.id FROM boms b WHERE b.project_id = p.id AND b.is_demo = 0 ORDER BY b.updated_at DESC LIMIT 1) AS bom_id,
  (SELECT COUNT(*) FROM boms b
    JOIN bom_versions bv ON bv.id = b.current_version_id AND bv.publication_state IN ('verified', 'partial')
    JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
    WHERE b.project_id = p.id AND b.is_demo = 0) AS bom_line_count
  FROM projects p LEFT JOIN project_versions pv ON pv.id = p.current_version_id`;

export class ProjectsRepository {
  constructor(private readonly db: D1Database) {}

  async listVisible(userId: string | null, options: { q?: string; mine?: boolean; kind?: ProjectKind; category?: RobotCategory; filters?: ProjectListFilters; includeFacets?: boolean; limit: number; offset: number; sort?: ProjectListSort }): Promise<{ items: ProjectDto[]; total: number; stats: ProjectCatalogStats; facets?: ProjectFacetCounts }> {
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `?${values.length}`; };
    const access = options.mine
      ? userId ? `(p.owner_user_id = ${bind(userId)} OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id AND om.user_id = ${bind(userId)} AND om.status = 'active'))` : "0"
      : userId
        ? `(p.status = 'published' AND p.visibility = 'public') OR p.owner_user_id = ${bind(userId)} OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id AND om.user_id = ${bind(userId)} AND om.status = 'active')`
        : "p.status = 'published' AND p.visibility = 'public'";
    const clauses = ["p.deleted_at IS NULL", "p.is_demo = 0", `(${access})`];
    if (options.q) {
      const term = bind(`%${options.q.toLowerCase()}%`);
      clauses.push(`(lower(p.name) LIKE ${term} OR lower(COALESCE(p.summary, '')) LIKE ${term}
        OR lower(COALESCE(p.maintainer, '')) LIKE ${term}
        OR lower(COALESCE((SELECT search_pv.rpps_json FROM project_versions search_pv WHERE search_pv.id = p.current_version_id), '')) LIKE ${term})`);
    }
    if (options.kind) clauses.push(`p.project_kind = ${bind(options.kind)}`);
    if (options.category) clauses.push(`p.robot_category = ${bind(options.category)}`);
    const filters = options.filters ?? {};
    if (filters.source === "open") clauses.push("p.project_kind <> 'commercial_showcase' AND COALESCE(p.repository_url, p.upstream_url) IS NOT NULL");
    if (filters.source === "commercial") clauses.push("p.project_kind = 'commercial_showcase'");
    if (filters.source === "licensed") clauses.push("p.license_spdx IS NOT NULL AND COALESCE(p.repository_url, p.upstream_url) IS NOT NULL");
    if (filters.source === "official") clauses.push("p.project_kind = 'commercial_showcase' AND COALESCE(p.repository_url, p.upstream_url) IS NOT NULL");
    if (filters.source === "unclear") clauses.push("p.license_spdx IS NULL");
    if (filters.priceMinMinor != null) clauses.push(`${projectFilterCostExpression()} >= ${bind(filters.priceMinMinor)}`);
    if (filters.priceMaxMinor != null) clauses.push(`${projectFilterCostExpression()} <= ${bind(filters.priceMaxMinor)}`);
    if (filters.bomState) clauses.push(`${latestProjectBomStateExpression()} = ${bind(filters.bomState)}`);
    if (filters.bomLinesMin != null) clauses.push(`${latestProjectBomLineCountExpression()} >= ${bind(filters.bomLinesMin)}`);
    if (filters.build === "started") clauses.push("EXISTS (SELECT 1 FROM rpps_releases filter_rr JOIN rpps_build_passports filter_bp ON filter_bp.release_id = filter_rr.id JOIN builds filter_build ON filter_build.id = filter_bp.build_id AND filter_build.deleted_at IS NULL WHERE filter_rr.project_id = p.id)");
    if (filters.build === "verified") clauses.push("EXISTS (SELECT 1 FROM rpps_releases filter_rr JOIN rpps_build_outcomes filter_outcome ON filter_outcome.release_id = filter_rr.id AND filter_outcome.outcome = 'succeeded' AND filter_outcome.independence = 'independent' JOIN builds filter_build ON filter_build.id = filter_outcome.build_id AND filter_build.deleted_at IS NULL WHERE filter_rr.project_id = p.id)");
    if (filters.difficulty) clauses.push(`p.difficulty = ${bind(filters.difficulty)}`);
    if (filters.ros) {
      const ros = "lower(COALESCE(json_extract((SELECT ros_pv.rpps_json FROM project_versions ros_pv WHERE ros_pv.id = p.current_version_id), '$.software.ros_support'), 'none'))";
      if (filters.ros === "supported") clauses.push(`${ros} IN ('native', 'community')`);
      else clauses.push(`${ros} = ${bind(filters.ros)}`);
    }
    if (filters.license) clauses.push(`lower(COALESCE(p.license_spdx, '')) = ${bind(filters.license.toLowerCase())}`);
    if (filters.hasMedia) clauses.push("EXISTS (SELECT 1 FROM project_files filter_pf JOIN files filter_f ON filter_f.id = filter_pf.file_id WHERE filter_pf.project_id = p.id AND filter_f.kind = 'image' AND filter_f.status = 'ready' AND filter_f.deleted_at IS NULL)");
    if (filters.hasCad) clauses.push("EXISTS (SELECT 1 FROM project_files filter_pf JOIN files filter_f ON filter_f.id = filter_pf.file_id WHERE filter_pf.project_id = p.id AND filter_f.kind = 'cad' AND filter_f.status = 'ready' AND filter_f.deleted_at IS NULL)");
    if (filters.hasAssembly) clauses.push("EXISTS (SELECT 1 FROM project_steps filter_step WHERE filter_step.project_version_id = p.current_version_id)");
    if (filters.hasOfficialSource) clauses.push("COALESCE(p.repository_url, p.upstream_url) IS NOT NULL");
    if (filters.verifiedSince) clauses.push(`COALESCE(p.last_checked_at, p.updated_at) >= ${bind(filters.verifiedSince)}`);
    const where = `WHERE ${clauses.join(" AND ")}`;
    const count = await this.db.prepare(`SELECT COUNT(*) AS total FROM projects p ${where}`).bind(...values).first<{ total: number }>();
    const pageLimitPlaceholder = `?${values.length + 1}`;
    const pageOffsetPlaceholder = `?${values.length + 2}`;
    const listQuery = buildProjectListQuery({ where, limitPlaceholder: pageLimitPlaceholder, offsetPlaceholder: pageOffsetPlaceholder, sort: options.sort });
    const rows = await this.db.prepare(listQuery)
      .bind(...values, options.limit, options.offset).all<ProjectDatabaseRow>();
    const stats = await this.catalogStats(userId, options.mine ?? false, options.kind, options.category);
    const facets = options.includeFacets ? await this.facetCounts(where, values) : undefined;
    const items = rows.results.map(toProjectDto);
    await Promise.all(items.map(async (item) => { item.media = await this.listPreviewMedia(item.id, userId); }));
    return { items, total: Number(count?.total ?? 0), stats, ...(facets ? { facets } : {}) };
  }

  private async facetCounts(where: string, values: unknown[]): Promise<ProjectFacetCounts> {
    const queries = [
      `SELECT COALESCE(p.project_kind, 'unknown') key, COUNT(*) count FROM projects p ${where} GROUP BY key`,
      `SELECT COALESCE(p.robot_category, 'other') key, COUNT(*) count FROM projects p ${where} GROUP BY key`,
      `SELECT ${projectSourceClassExpression()} key, COUNT(*) count FROM projects p ${where} GROUP BY key`,
      `SELECT ${latestProjectBomStateExpression()} key, COUNT(*) count FROM projects p ${where} GROUP BY key`,
      `SELECT COALESCE(p.difficulty, 'unspecified') key, COUNT(*) count FROM projects p ${where} GROUP BY key`,
    ];
    const results = await this.db.batch(queries.map((query) => this.db.prepare(query).bind(...values)));
    const asRecord = (rows: unknown[]) => Object.fromEntries((rows as Array<{ key: string; count: number }>).map((row) => [String(row.key), Number(row.count)]));
    return {
      kinds: asRecord(results[0].results),
      categories: asRecord(results[1].results),
      sources: asRecord(results[2].results),
      bomStates: asRecord(results[3].results),
      difficulties: asRecord(results[4].results),
    };
  }

  private async listPreviewMedia(projectId: string, userId: string | null): Promise<ProjectDto["media"]> {
    const rows = await this.db.prepare(`SELECT f.id, pm.alt_text, pm.caption
      FROM project_files pf JOIN files f ON f.id = pf.file_id LEFT JOIN project_media pm ON pm.project_id = pf.project_id AND pm.file_id = pf.file_id
      WHERE pf.project_id = ?1 AND f.deleted_at IS NULL AND f.status = 'ready' AND f.kind = 'image'
        AND (f.visibility = 'public' OR f.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM organization_members om
          WHERE om.organization_id = f.organization_id AND om.user_id = ?2 AND om.status = 'active'))
      ORDER BY CASE pf.purpose WHEN 'cover' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, pf.created_at DESC LIMIT 4`)
      .bind(projectId, userId).all<{ id: string; alt_text: string | null; caption: string | null }>();
    return rows.results.map((row) => {
      const generatedUrl = fileContentUrl(row.id);
      return {
        id: row.id,
        contentUrl: normalizeManagedFileUrl(generatedUrl) ?? generatedUrl,
        altText: row.alt_text,
        caption: row.caption,
      };
    });
  }

  private async catalogStats(userId: string | null, mine: boolean, kind?: ProjectKind, category?: RobotCategory): Promise<ProjectCatalogStats> {
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `?${values.length}`; };
    const access = mine
      ? userId ? `(p.owner_user_id = ${bind(userId)} OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id AND om.user_id = ${bind(userId)} AND om.status = 'active'))` : "0"
      : userId
        ? `(p.status = 'published' AND p.visibility = 'public') OR p.owner_user_id = ${bind(userId)} OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id AND om.user_id = ${bind(userId)} AND om.status = 'active')`
        : "p.status = 'published' AND p.visibility = 'public'";
    const clauses = ["p.deleted_at IS NULL", "p.is_demo = 0", `(${access})`];
    if (kind) clauses.push(`p.project_kind = ${bind(kind)}`);
    if (category) clauses.push(`p.robot_category = ${bind(category)}`);
    const where = `WHERE ${clauses.join(" AND ")}`;
    const result = await this.db.prepare(buildProjectCatalogStatsQuery(where)).bind(...values).first<{
      totalProjects: number;
      physicalDesignProjects: number;
      roboticsSoftwareProjects: number;
      commercialShowcaseProjects: number;
      publishedProjects: number;
      totalParts: number;
      totalReproductions: number;
      successfulReproductions: number;
    }>();
    const costs = await this.db.prepare(`SELECT cost FROM (
      SELECT COALESCE(ppe.representative_minor, ppe.min_minor,
        CASE WHEN p.project_kind <> 'commercial_showcase' THEN p.estimated_cost_minor END) AS cost
      FROM projects p
      LEFT JOIN project_price_estimates ppe ON ppe.project_id = p.id AND ppe.status = 'active'
        AND (ppe.expires_at IS NULL OR datetime(ppe.expires_at) > datetime('now'))
      ${where}
    ) WHERE cost IS NOT NULL ORDER BY cost`)
      .bind(...values).all<{ cost: number }>();
    const sortedCosts = costs.results.map((row) => Number(row.cost)).filter(Number.isFinite);
    const middle = Math.floor(sortedCosts.length / 2);
    const medianCostMinor = sortedCosts.length === 0 ? null : sortedCosts.length % 2 === 1
      ? sortedCosts[middle]
      : (sortedCosts[middle - 1] + sortedCosts[middle]) / 2;
    return {
      totalProjects: Number(result?.totalProjects ?? 0),
      totalParts: Number(result?.totalParts ?? 0),
      medianCostMinor,
      physicalDesignProjects: Number(result?.physicalDesignProjects ?? 0),
      roboticsSoftwareProjects: Number(result?.roboticsSoftwareProjects ?? 0),
      commercialShowcaseProjects: Number(result?.commercialShowcaseProjects ?? 0),
      publishedProjects: Number(result?.publishedProjects ?? 0),
      totalReproductions: Number(result?.totalReproductions ?? 0),
      successfulReproductions: Number(result?.successfulReproductions ?? 0),
    };
  }

  async find(idOrSlug: string): Promise<{ row: ProjectDatabaseRow; item: ProjectDto } | null> {
    const row = await this.db.prepare(`${SELECT_PROJECT} WHERE p.deleted_at IS NULL AND p.is_demo = 0 AND (p.id = ?1 OR p.slug = ?1)`)
      .bind(idOrSlug).first<ProjectDatabaseRow>();
    return row ? { row, item: toProjectDto(row) } : null;
  }

  async listFiles(projectId: string, publicOnly: boolean): Promise<ProjectFileDto[]> {
    const result = await this.db.prepare(buildProjectFilesQuery())
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
      contentUrl: normalizeManagedFileUrl(fileContentUrl(row.id)) ?? fileContentUrl(row.id),
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
    upstreamUrl?: string | null;
    revision?: string | null;
    maintainer?: string | null;
    upstreamProjectId?: string | null;
    upstreamRevision?: string | null;
    changeSummary?: string | null;
  }): Promise<ProjectDto> {
    const projectId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { rpps } = input;
    const maintainer = input.maintainer ?? rpps.authors?.[0]?.name ?? null;
    const upstreamUrl = input.upstreamUrl ?? rpps.repo_url ?? null;
    const upstreamIdentity = resolveUpstreamIdentity({ upstreamUrl, repositoryUrl: rpps.repo_url });
    const publishability = computePublishability({
      name: rpps.name,
      slug: rpps.slug,
      version: rpps.version,
      license: rpps.license,
      maintainer,
      authorsCount: rpps.authors?.length ?? 0,
      upstreamUrl,
      repositoryUrl: rpps.repo_url,
      revision: input.revision,
    });
    if (upstreamIdentity) {
      const existing = await this.db.prepare(`SELECT id FROM projects WHERE upstream_identity = ?1 AND deleted_at IS NULL LIMIT 1`)
        .bind(upstreamIdentity).first<{ id: string }>();
      if (existing) throw new AppError(409, "PROJECT_UPSTREAM_EXISTS", "A project for this upstream repository already exists.");
    }
    const status = publishability === "ready" ? "published" : "review";
    const projectKind = classifyProjectKind(rpps);
    try {
      await this.db.batch([
        this.db.prepare(`INSERT INTO projects
          (id, slug, name, summary, description, owner_user_id, organization_id, visibility, status, project_kind,
           current_version_id, license_spdx, repository_url, difficulty, estimated_cost_minor,
           estimated_cost_currency, is_demo, version, upstream_url, upstream_identity, maintainer, revision,
           ingested_at, last_checked_at, publishability, upstream_project_id, upstream_revision,
           clone_created_at, change_summary, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 'USD', 0, 1, ?16, ?17, ?18, ?19, ?20, ?20, ?21, ?22, ?23, ?24, ?25, ?20, ?20)`)
          .bind(projectId, rpps.slug, rpps.name, rpps.summary ?? null, rpps.description ?? null, input.ownerUserId,
            input.organizationId ?? null, input.visibility, status, projectKind, versionId, rpps.license ?? null, rpps.repo_url ?? null,
            rpps.build?.difficulty ?? null, rpps.build?.estimated_cost_usd == null ? null : Math.round(rpps.build.estimated_cost_usd * 100),
            upstreamUrl, upstreamIdentity, maintainer, input.revision ?? null, now, publishability,
            input.upstreamProjectId ?? null, input.upstreamRevision ?? null,
            input.upstreamProjectId ? now : null, input.changeSummary ?? null),
        this.db.prepare(`INSERT INTO project_versions
          (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at)
          VALUES (?1, ?2, ?3, ?4, 'Initial publication', ?5, ?6, ?7, ?8, ?8)`)
          .bind(versionId, projectId, rpps.version, rpps.rpps_version, JSON.stringify(rpps), status, input.ownerUserId, now),
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
    const upstreamUrl = current.row.upstream_url ?? rpps.repo_url ?? null;
    const upstreamIdentity = resolveUpstreamIdentity({ upstreamUrl, repositoryUrl: rpps.repo_url });
    const publishability = computePublishability({
      name: rpps.name,
      slug: rpps.slug,
      version: rpps.version,
      license: rpps.license,
      maintainer: current.row.maintainer ?? rpps.authors?.[0]?.name,
      authorsCount: rpps.authors?.length ?? 0,
      upstreamUrl,
      repositoryUrl: rpps.repo_url,
      revision: current.row.revision,
    });
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
          estimated_cost_minor = ?9, project_kind = ?10, upstream_url = ?11, upstream_identity = ?12, maintainer = ?13,
          publishability = ?14, last_checked_at = ?15, version = version + 1, updated_at = ?15
          WHERE id = ?16 AND version = ?17`)
          .bind(rpps.slug, rpps.name, rpps.summary ?? null, rpps.description ?? null, versionId, rpps.license ?? null,
            rpps.repo_url ?? null, rpps.build?.difficulty ?? null,
            rpps.build?.estimated_cost_usd == null ? null : Math.round(rpps.build.estimated_cost_usd * 100),
            projectKindAfterRppsUpdate(current.row.project_kind, rpps), upstreamUrl, upstreamIdentity, current.row.maintainer ?? rpps.authors?.[0]?.name ?? null,
            publishability, now, projectId, expectedVersion),
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
    for (const [index, item] of rpps.bom.entries()) {
      const componentId = await resolveExactBomComponent(this.db, item.manufacturer, item.mpn);
      const classification = item.fabricated ? "fabricated" : item.optional ? "optional" : "purchased";
      const completeness = componentId ? "complete" : item.completeness ?? (item.fabricated ? "custom-fabricated" : item.mpn ? "probable" : "unresolved");
      statements.push(this.db.prepare(`INSERT INTO bom_items
        (id, bom_version_id, component_id, slot_key, description, quantity, unit, target_unit_price_minor, notes,
         extraction_method, completeness, evidence_locator, confidence, line_classification, included, optional,
         raw_fields_json, aggregated_locators_json, sort_order)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 1, ?15, ?16, ?17, ?18)`)
        .bind(crypto.randomUUID(), bomVersionId, componentId, item.ref ?? `item-${index + 1}`, item.name, item.qty,
          item.unit ?? "each", item.unit_cost_usd == null ? null : Math.round(item.unit_cost_usd * 100), item.notes ?? null,
          item.extraction_method ?? "explicit-bom", completeness, item.evidence_locator ?? null, item.confidence ?? null,
          classification, item.optional ? 1 : 0, JSON.stringify(item), JSON.stringify(item.evidence_locator ? [item.evidence_locator] : []), index));
    }
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

async function resolveExactBomComponent(db: D1Database, manufacturer: string | undefined, mpn: string | undefined): Promise<string | null> {
  const normalizedMpn = mpn?.trim();
  if (!normalizedMpn) return null;
  const rows = manufacturer?.trim()
    ? await db.prepare(`SELECT c.id FROM components c
        JOIN manufacturers m ON m.id = c.manufacturer_id
        WHERE c.deleted_at IS NULL AND c.is_demo = 0
          AND lower(trim(c.manufacturer_part_number)) = lower(?1)
          AND lower(trim(m.name)) = lower(?2)
        ORDER BY c.id LIMIT 2`).bind(normalizedMpn, manufacturer.trim()).all<{ id: string }>()
    : await db.prepare(`SELECT c.id FROM components c
        WHERE c.deleted_at IS NULL AND c.is_demo = 0
          AND lower(trim(c.manufacturer_part_number)) = lower(?1)
        ORDER BY c.id LIMIT 2`).bind(normalizedMpn).all<{ id: string }>();
  return rows.results.length === 1 ? rows.results[0].id : null;
}

function toProjectDto(row: ProjectDatabaseRow): ProjectDto {
  if (!row.rpps_json) throw new Error(`Project ${row.id} has no current RPPS version.`);
  const rpps = canonicalizeRppsMediaUrls(JSON.parse(row.rpps_json) as RppsPackage);
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
    project_kind: row.project_kind ?? "unknown",
    robot_category: (row.robot_category as RobotCategory | null) ?? null,
    visibility: row.visibility,
    repo_url: row.repository_url,
    docs_url: rpps.docs_url ?? null,
    cover_image_url: rpps.cover_image_url ?? null,
    media: [],
    tags: rpps.tags ?? [],
    difficulty: (row.difficulty as ProjectDto["difficulty"]) ?? null,
    estimated_cost_usd: row.estimated_cost_minor == null ? null : row.estimated_cost_minor / 100,
    reproducibility_score: null,
    reproduction_count: Number(row.reproduction_count ?? 0),
    successful_reproduction_count: Number(row.successful_reproduction_count ?? 0),
    bom_id: row.bom_id ?? null,
    bom_line_count: Number(row.bom_line_count ?? 0),
    bom_publication_state: row.bom_publication_state ?? null,
    preview_cost_minor: row.preview_cost_minor ?? (row.project_kind === "commercial_showcase" ? null : row.estimated_cost_minor) ?? null,
    preview_cost_currency: row.preview_cost_currency ?? row.estimated_cost_currency ?? null,
    preview_cost_kind: row.preview_cost_kind ?? (row.project_kind === "commercial_showcase" || row.estimated_cost_minor == null ? null : "published"),
    preview_cost_confidence: row.preview_cost_confidence ?? null,
    preview_cost_method: row.preview_cost_method ?? null,
    preview_cost_valued_at: row.preview_cost_valued_at ?? (row.project_kind === "commercial_showcase" || row.estimated_cost_minor == null ? null : row.updated_at),
    rpps_version: row.rpps_schema_version ?? rpps.rpps_version,
    rpps,
    is_demo: row.is_demo === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    githubStars: row.github_stars ?? null,
    upstream_url: row.upstream_url,
    upstream_identity: row.upstream_identity,
    maintainer: row.maintainer,
    revision: row.revision,
    ingested_at: row.ingested_at,
    last_checked_at: row.last_checked_at,
    publishability: row.publishability ?? "review",
    upstream_project_id: row.upstream_project_id,
    upstream_revision: row.upstream_revision,
    clone_created_at: row.clone_created_at,
    change_summary: row.change_summary,
  };
}

function canonicalizeRppsMediaUrls(rpps: RppsPackage): RppsPackage {
  const coverImageUrl = normalizeManagedFileUrl(rpps.cover_image_url);
  return {
    ...rpps,
    cover_image_url: coverImageUrl ?? undefined,
    files: rpps.files?.map((file) => {
      if (!file.url) return file;
      const url = normalizeManagedFileUrl(file.url);
      return { ...file, url: url ?? undefined };
    }),
  };
}
