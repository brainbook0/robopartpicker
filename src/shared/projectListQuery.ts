export type ProjectListSort = "popularity" | "updated" | "name";

export function projectOrderBy(sort: ProjectListSort | undefined, alias = "p"): string {
  const prefix = alias ? `${alias}.` : "";
  switch (sort) {
    case "name": return `${prefix}name COLLATE NOCASE ASC, ${prefix}github_stars DESC`;
    case "updated": return `${prefix}updated_at DESC`;
    case "popularity":
    default: return `CASE ${prefix}project_kind WHEN 'physical_design' THEN 0 WHEN 'robotics_software' THEN 1 WHEN 'commercial_showcase' THEN 2 ELSE 3 END ASC, COALESCE(${prefix}github_stars, -1) DESC, ${prefix}updated_at DESC`;
  }
}

export function buildProjectListQuery(input: {
  where: string;
  limitPlaceholder: string;
  offsetPlaceholder: string;
  sort?: ProjectListSort;
}): string {
  return `WITH page_projects AS (
      SELECT p.id
      FROM projects p
      ${input.where}
      ORDER BY ${projectOrderBy(input.sort)}
      LIMIT ${input.limitPlaceholder} OFFSET ${input.offsetPlaceholder}
    ), reproduction_counts AS (
      SELECT rr.project_id, COUNT(*) AS reproduction_count
      FROM rpps_releases rr
      JOIN page_projects pp ON pp.id = rr.project_id
      JOIN rpps_build_passports bp ON bp.release_id = rr.id
      JOIN builds b ON b.id = bp.build_id AND b.deleted_at IS NULL
      GROUP BY rr.project_id
    ), successful_reproduction_counts AS (
      SELECT rr.project_id, COUNT(*) AS successful_reproduction_count
      FROM rpps_releases rr
      JOIN page_projects pp ON pp.id = rr.project_id
      JOIN rpps_build_outcomes outcome ON outcome.release_id = rr.id
        AND outcome.outcome = 'succeeded' AND outcome.independence = 'independent'
      JOIN builds b ON b.id = outcome.build_id AND b.deleted_at IS NULL
      GROUP BY rr.project_id
    ), ranked_boms AS (
      SELECT b.id, b.project_id,
        ROW_NUMBER() OVER (PARTITION BY b.project_id ORDER BY b.updated_at DESC, b.id DESC) AS row_number
      FROM boms b
      JOIN page_projects pp ON pp.id = b.project_id
    ), latest_boms AS (
      SELECT id AS bom_id, project_id
      FROM ranked_boms
      WHERE row_number = 1
    ), bom_counts AS (
      SELECT b.project_id, COUNT(bi.id) AS bom_line_count
      FROM boms b
      JOIN page_projects pp ON pp.id = b.project_id
      LEFT JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
      GROUP BY b.project_id
    )
    SELECT p.id, p.slug, p.name, p.summary, p.description, p.owner_user_id,
      p.organization_id, p.visibility, p.status, p.project_kind, p.robot_category, p.license_spdx, p.repository_url, p.difficulty,
      p.estimated_cost_minor, p.estimated_cost_currency, p.is_demo, p.version, p.created_at, p.updated_at,
      p.github_stars, p.upstream_url, p.upstream_identity, p.maintainer, p.revision, p.ingested_at,
      p.last_checked_at, p.publishability, p.upstream_project_id, p.upstream_revision, p.clone_created_at, p.change_summary,
      pv.version_label, pv.rpps_schema_version, pv.rpps_json,
      COALESCE(reproduction_counts.reproduction_count, 0) AS reproduction_count,
      COALESCE(successful_reproduction_counts.successful_reproduction_count, 0) AS successful_reproduction_count,
      latest_boms.bom_id, COALESCE(bom_counts.bom_line_count, 0) AS bom_line_count
    FROM page_projects pp
    JOIN projects p ON p.id = pp.id
    LEFT JOIN project_versions pv ON pv.id = p.current_version_id
    LEFT JOIN reproduction_counts ON reproduction_counts.project_id = p.id
    LEFT JOIN successful_reproduction_counts ON successful_reproduction_counts.project_id = p.id
    LEFT JOIN latest_boms ON latest_boms.project_id = p.id
    LEFT JOIN bom_counts ON bom_counts.project_id = p.id
    ORDER BY ${projectOrderBy(input.sort)}`;
}

export function buildProjectCatalogStatsQuery(where: string): string {
  return `WITH visible_projects AS (
      SELECT p.id, p.status, p.project_kind
      FROM projects p ${where}
    ), bom_counts AS (
      SELECT b.project_id, COUNT(*) AS parts
      FROM boms b
      JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
      JOIN visible_projects vp ON vp.id = b.project_id
      GROUP BY b.project_id
    )
    SELECT
      COUNT(*) AS totalProjects,
      COALESCE(SUM(CASE WHEN vp.project_kind = 'physical_design' THEN 1 ELSE 0 END), 0) AS physicalDesignProjects,
      COALESCE(SUM(CASE WHEN vp.project_kind = 'robotics_software' THEN 1 ELSE 0 END), 0) AS roboticsSoftwareProjects,
      COALESCE(SUM(CASE WHEN vp.project_kind = 'commercial_showcase' THEN 1 ELSE 0 END), 0) AS commercialShowcaseProjects,
      COALESCE(SUM(CASE WHEN vp.status = 'published' THEN 1 ELSE 0 END), 0) AS publishedProjects,
      COALESCE(SUM(COALESCE(bom_counts.parts, 0)), 0) AS totalParts
    FROM visible_projects vp
    LEFT JOIN bom_counts ON bom_counts.project_id = vp.id`;
}

export function buildProjectFilesQuery(): string {
  return `SELECT f.id, pf.project_version_id, f.original_name, f.media_type,
      f.size_bytes, f.checksum_sha256, f.visibility, f.status, f.kind, pf.purpose, pf.relative_path,
      pm.caption, pm.alt_text, f.created_at, f.updated_at
    FROM project_files pf
    JOIN projects p ON p.id = pf.project_id
    JOIN files f ON f.id = pf.file_id
    LEFT JOIN project_media pm ON pm.project_id = pf.project_id AND pm.file_id = pf.file_id
    WHERE pf.project_id = ?1 AND f.deleted_at IS NULL
      AND (pf.project_version_id IS NULL OR pf.project_version_id = p.current_version_id)
      AND (?2 = 0 OR (f.visibility = 'public' AND f.status = 'ready'))
    ORDER BY COALESCE(pm.sort_order, 2147483647), pf.relative_path, f.original_name`;
}
