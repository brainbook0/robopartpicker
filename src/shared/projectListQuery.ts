export type ProjectListSort = "completeness" | "popularity" | "trend" | "updated" | "name" | "cost_asc" | "repro_desc";
export type ProjectSourceFilter = "open" | "commercial" | "licensed" | "official" | "unclear";
export type ProjectBuildFilter = "started" | "verified";
export type ProjectRosFilter = "native" | "community" | "supported" | "none";
export type ProjectListFilters = {
  source?: ProjectSourceFilter;
  priceMinMinor?: number;
  priceMaxMinor?: number;
  bomState?: string;
  bomLinesMin?: number;
  build?: ProjectBuildFilter;
  difficulty?: string;
  ros?: ProjectRosFilter;
  license?: string;
  hasMedia?: boolean;
  hasCad?: boolean;
  hasAssembly?: boolean;
  hasOfficialSource?: boolean;
  verifiedSince?: string;
};

export type ProjectFacetCounts = {
  kinds: Record<string, number>;
  categories: Record<string, number>;
  sources: Record<string, number>;
  bomStates: Record<string, number>;
  difficulties: Record<string, number>;
};

export function inferredOpenProjectCostExpression(alias = "p", bomLineExpression = "0"): string {
  const prefix = alias ? `${alias}.` : "";
  return `CASE WHEN ${prefix}project_kind = 'physical_design' THEN CAST(ROUND((CASE
    WHEN ${prefix}robot_category = 'humanoid' THEN 700000
    WHEN ${prefix}robot_category = 'manipulator' THEN 180000
    WHEN ${prefix}robot_category = 'gripper' THEN 75000
    WHEN ${prefix}robot_category = 'quadruped' THEN 300000
    WHEN ${prefix}robot_category = 'hexapod' THEN 120000
    WHEN ${prefix}robot_category = 'mobile' THEN 90000
    WHEN ${prefix}robot_category = 'aerial' THEN 120000
    WHEN ${prefix}robot_category = 'biped' THEN 250000
    WHEN ${prefix}robot_category = 'exoskeleton' THEN 450000
    WHEN ${prefix}robot_category = 'head' THEN 100000
    WHEN ${prefix}robot_category = 'actuator' THEN 45000
    WHEN ${prefix}robot_category = 'underwater' THEN 350000
    ELSE 150000 END) * (CASE
      WHEN COALESCE(${bomLineExpression}, 0) <= 12 THEN 1.0
      WHEN COALESCE(${bomLineExpression}, 0) <= 48 THEN 1.5
      WHEN COALESCE(${bomLineExpression}, 0) <= 108 THEN 2.0
      ELSE 2.5 END)) AS INTEGER) END`;
}

export function latestProjectBomLineCountExpression(alias = "p"): string {
  const prefix = alias ? `${alias}.` : "";
  return `(SELECT COUNT(*) FROM bom_items filter_bi WHERE filter_bi.bom_version_id = (
    SELECT filter_b.current_version_id FROM boms filter_b
    WHERE filter_b.project_id = ${prefix}id AND filter_b.is_demo = 0
    ORDER BY filter_b.updated_at DESC, filter_b.id DESC LIMIT 1))`;
}

export function latestProjectBomStateExpression(alias = "p"): string {
  const prefix = alias ? `${alias}.` : "";
  return `COALESCE((SELECT filter_bv.publication_state FROM boms filter_b
    JOIN bom_versions filter_bv ON filter_bv.id = filter_b.current_version_id
    WHERE filter_b.project_id = ${prefix}id AND filter_b.is_demo = 0
    ORDER BY filter_b.updated_at DESC, filter_b.id DESC LIMIT 1), CASE
      WHEN ${prefix}project_kind = 'commercial_showcase' THEN 'manufacturer_unavailable'
      WHEN ${prefix}project_kind = 'robotics_software' THEN 'not_applicable'
      WHEN ${prefix}project_kind = 'physical_design' THEN 'unavailable'
      ELSE 'classification_required' END)`;
}

export function projectFilterCostExpression(alias = "p"): string {
  const prefix = alias ? `${alias}.` : "";
  const bomLines = latestProjectBomLineCountExpression(alias);
  const knownBomCost = `(SELECT CAST(COALESCE(SUM(CASE WHEN filter_cost_bi.included = 1 AND filter_cost_bi.target_unit_price_minor > 0
    THEN filter_cost_bi.target_unit_price_minor * filter_cost_bi.quantity ELSE 0 END), 0) AS INTEGER)
    FROM bom_items filter_cost_bi WHERE filter_cost_bi.bom_version_id = (
      SELECT filter_cost_b.current_version_id FROM boms filter_cost_b
      WHERE filter_cost_b.project_id = ${prefix}id AND filter_cost_b.is_demo = 0
      ORDER BY filter_cost_b.updated_at DESC, filter_cost_b.id DESC LIMIT 1))`;
  return `COALESCE((SELECT COALESCE(filter_ppe.representative_minor, filter_ppe.min_minor)
      FROM project_price_estimates filter_ppe WHERE filter_ppe.project_id = ${prefix}id AND filter_ppe.status = 'active'
        AND (filter_ppe.expires_at IS NULL OR datetime(filter_ppe.expires_at) > datetime('now')) LIMIT 1),
    CASE WHEN ${prefix}project_kind <> 'commercial_showcase' THEN ${prefix}estimated_cost_minor END,
    NULLIF(${knownBomCost}, 0), ${inferredOpenProjectCostExpression(alias, bomLines)})`;
}

export function projectSourceClassExpression(alias = "p"): string {
  const prefix = alias ? `${alias}.` : "";
  return `CASE
    WHEN ${prefix}project_kind = 'commercial_showcase' THEN 'commercial'
    WHEN ${prefix}license_spdx IS NOT NULL AND COALESCE(${prefix}repository_url, ${prefix}upstream_url) IS NOT NULL THEN 'licensed'
    WHEN COALESCE(${prefix}repository_url, ${prefix}upstream_url) IS NOT NULL THEN 'open'
    ELSE 'unclear' END`;
}

export function projectCompletenessScore(alias = "p"): string {
  const prefix = alias ? `${alias}.` : "";
  return `(
    CASE WHEN length(trim(COALESCE(${prefix}summary, ''))) >= 50 THEN 2 ELSE 0 END +
    CASE WHEN length(trim(COALESCE(${prefix}description, ''))) >= 100 THEN 3 ELSE 0 END +
    CASE WHEN ${prefix}current_description_generation_id IS NOT NULL THEN 2 ELSE 0 END +
    CASE WHEN ${prefix}license_spdx IS NOT NULL AND trim(${prefix}license_spdx) <> '' THEN 1 ELSE 0 END +
    CASE WHEN COALESCE(${prefix}repository_url, ${prefix}upstream_url) IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN ${prefix}maintainer IS NOT NULL AND trim(${prefix}maintainer) <> '' THEN 1 ELSE 0 END +
    CASE WHEN ${prefix}revision IS NOT NULL AND trim(${prefix}revision) <> '' THEN 1 ELSE 0 END +
    CASE WHEN ${prefix}robot_category IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN EXISTS (
      SELECT 1 FROM project_files completeness_pf
      JOIN files completeness_f ON completeness_f.id = completeness_pf.file_id
      WHERE completeness_pf.project_id = ${prefix}id
        AND (completeness_pf.project_version_id IS NULL OR completeness_pf.project_version_id = ${prefix}current_version_id)
        AND completeness_f.kind = 'image' AND completeness_f.status = 'ready' AND completeness_f.deleted_at IS NULL
    ) THEN 2 ELSE 0 END +
    CASE WHEN EXISTS (
      SELECT 1 FROM evidence_claims completeness_ec
      WHERE completeness_ec.entity_type = 'project' AND completeness_ec.entity_id = ${prefix}id
    ) THEN 2 ELSE 0 END +
    CASE
      WHEN ${prefix}project_kind = 'physical_design' AND EXISTS (
        SELECT 1 FROM boms completeness_b
        JOIN bom_versions completeness_bv ON completeness_bv.id = completeness_b.current_version_id
        JOIN bom_items completeness_bi ON completeness_bi.bom_version_id = completeness_bv.id
        WHERE completeness_b.project_id = ${prefix}id AND completeness_b.is_demo = 0
          AND completeness_bv.publication_state IN ('verified', 'partial')
      ) THEN 4
      WHEN ${prefix}project_kind = 'commercial_showcase' AND (
        SELECT COUNT(*) FROM project_specs completeness_ps
        WHERE completeness_ps.project_id = ${prefix}id AND completeness_ps.is_current = 1
      ) >= 3 THEN 4
      WHEN ${prefix}project_kind = 'robotics_software'
        AND ${prefix}repository_url IS NOT NULL
        AND ${prefix}current_description_generation_id IS NOT NULL THEN 4
      ELSE 0
    END
  )`;
}

export function projectOrderBy(sort: ProjectListSort | undefined, alias = "p"): string {
  const prefix = alias ? `${alias}.` : "";
  switch (sort) {
    case "completeness": return `${projectCompletenessScore(alias)} DESC, CASE ${prefix}publishability WHEN 'ready' THEN 0 WHEN 'review' THEN 1 WHEN 'incomplete' THEN 2 ELSE 3 END ASC, COALESCE(${prefix}github_stars, -1) DESC, ${prefix}updated_at DESC, ${prefix}id ASC`;
    case "name": return `${prefix}name COLLATE NOCASE ASC, ${prefix}github_stars DESC`;
    case "updated": return `${prefix}updated_at DESC`;
    case "trend": return `COALESCE((SELECT rank FROM project_trend_snapshots pts WHERE pts.project_id = ${prefix}id AND pts.active = 1 LIMIT 1), 2147483647) ASC, ${prefix}name COLLATE NOCASE ASC`;
    case "cost_asc": return `CASE WHEN ${projectFilterCostExpression(alias)} IS NULL THEN 1 ELSE 0 END ASC, ${projectFilterCostExpression(alias)} ASC, ${prefix}name COLLATE NOCASE ASC`;
    case "repro_desc": return `(SELECT COUNT(*) FROM rpps_releases sort_rr JOIN rpps_build_outcomes sort_outcome ON sort_outcome.release_id = sort_rr.id AND sort_outcome.outcome = 'succeeded' AND sort_outcome.independence = 'independent' WHERE sort_rr.project_id = ${prefix}id) DESC, ${prefix}updated_at DESC`;
    case "popularity": return `CASE ${prefix}project_kind WHEN 'physical_design' THEN 0 WHEN 'robotics_software' THEN 1 WHEN 'commercial_showcase' THEN 2 ELSE 3 END ASC, COALESCE(${prefix}github_stars, -1) DESC, ${prefix}updated_at DESC`;
    default: return projectOrderBy("completeness", alias);
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
      SELECT b.id, b.project_id, b.current_version_id,
        ROW_NUMBER() OVER (PARTITION BY b.project_id ORDER BY b.updated_at DESC, b.id DESC) AS row_number
      FROM boms b
      JOIN page_projects pp ON pp.id = b.project_id
      WHERE b.is_demo = 0
    ), latest_boms AS (
      SELECT id AS bom_id, project_id, current_version_id
      FROM ranked_boms
      WHERE row_number = 1
    ), bom_facts AS (
      SELECT latest_boms.project_id,
        bv.publication_state AS bom_publication_state,
        COUNT(bi.id) AS bom_line_count,
        CAST(COALESCE(SUM(CASE WHEN bi.included = 1 AND bi.target_unit_price_minor > 0
          THEN bi.target_unit_price_minor * bi.quantity ELSE 0 END), 0) AS INTEGER) AS known_cost_minor
      FROM latest_boms
      LEFT JOIN bom_versions bv ON bv.id = latest_boms.current_version_id
      LEFT JOIN bom_items bi ON bi.bom_version_id = latest_boms.current_version_id
      GROUP BY latest_boms.project_id, bv.publication_state
    ), active_price_estimates AS (
      SELECT ppe.project_id, ppe.estimate_type AS preview_cost_kind, ppe.currency,
        ppe.min_minor, ppe.representative_minor, ppe.confidence, ppe.method_version, ppe.valued_at
      FROM project_price_estimates ppe
      JOIN page_projects pp ON pp.id = ppe.project_id
      WHERE ppe.status = 'active'
        AND (ppe.expires_at IS NULL OR datetime(ppe.expires_at) > datetime('now'))
    )
    SELECT p.id, p.slug, p.name, p.summary, p.description, p.owner_user_id,
      p.organization_id, p.visibility, p.status, p.project_kind, p.robot_category, p.license_spdx, p.repository_url, p.difficulty,
      p.estimated_cost_minor, p.estimated_cost_currency, p.is_demo, p.version, p.created_at, p.updated_at,
      p.github_stars, p.upstream_url, p.upstream_identity, p.maintainer, p.revision, p.ingested_at,
      p.last_checked_at, p.publishability, p.upstream_project_id, p.upstream_revision, p.clone_created_at, p.change_summary,
      pv.version_label, pv.rpps_schema_version, pv.rpps_json,
      COALESCE(reproduction_counts.reproduction_count, 0) AS reproduction_count,
      COALESCE(successful_reproduction_counts.successful_reproduction_count, 0) AS successful_reproduction_count,
      latest_boms.bom_id, COALESCE(bom_facts.bom_line_count, 0) AS bom_line_count,
      COALESCE(bom_facts.bom_publication_state,
        CASE WHEN p.project_kind = 'commercial_showcase' THEN 'manufacturer_unavailable'
          WHEN p.project_kind = 'robotics_software' THEN 'not_applicable'
          WHEN p.project_kind = 'physical_design' THEN 'unavailable'
          ELSE 'classification_required' END) AS bom_publication_state,
      COALESCE(active_price_estimates.representative_minor, active_price_estimates.min_minor,
        CASE WHEN p.project_kind <> 'commercial_showcase' THEN p.estimated_cost_minor END,
        NULLIF(bom_facts.known_cost_minor, 0),
        ${inferredOpenProjectCostExpression("p", "bom_facts.bom_line_count")}) AS preview_cost_minor,
      COALESCE(active_price_estimates.currency, p.estimated_cost_currency, 'USD') AS preview_cost_currency,
      COALESCE(active_price_estimates.preview_cost_kind,
        CASE WHEN p.project_kind <> 'commercial_showcase' AND p.estimated_cost_minor IS NOT NULL THEN 'published'
          WHEN bom_facts.known_cost_minor > 0 THEN 'known_bom'
          WHEN p.project_kind = 'physical_design' THEN 'inferred' END) AS preview_cost_kind,
      COALESCE(active_price_estimates.confidence, CASE WHEN p.project_kind = 'physical_design' THEN 'low' END) AS preview_cost_confidence,
      COALESCE(active_price_estimates.method_version, CASE WHEN p.project_kind = 'physical_design' THEN 'project-point-estimate-v1' END) AS preview_cost_method,
      COALESCE(active_price_estimates.valued_at, p.updated_at) AS preview_cost_valued_at
    FROM page_projects pp
    JOIN projects p ON p.id = pp.id
    LEFT JOIN project_versions pv ON pv.id = p.current_version_id
    LEFT JOIN reproduction_counts ON reproduction_counts.project_id = p.id
    LEFT JOIN successful_reproduction_counts ON successful_reproduction_counts.project_id = p.id
    LEFT JOIN latest_boms ON latest_boms.project_id = p.id
    LEFT JOIN bom_facts ON bom_facts.project_id = p.id
    LEFT JOIN active_price_estimates ON active_price_estimates.project_id = p.id
    ORDER BY ${projectOrderBy(input.sort)}`;
}

export function buildProjectCatalogStatsQuery(where: string): string {
  return `WITH visible_projects AS (
      SELECT p.id, p.status, p.project_kind
      FROM projects p ${where}
    ), ranked_boms AS (
      SELECT b.project_id, b.current_version_id,
        ROW_NUMBER() OVER (PARTITION BY b.project_id ORDER BY b.updated_at DESC, b.id DESC) AS row_number
      FROM boms b
      JOIN visible_projects vp ON vp.id = b.project_id
      WHERE b.is_demo = 0
    ), latest_boms AS (
      SELECT project_id, current_version_id FROM ranked_boms WHERE row_number = 1
    ), bom_counts AS (
      SELECT latest_boms.project_id, COUNT(*) AS parts
      FROM latest_boms
      JOIN bom_items bi ON bi.bom_version_id = latest_boms.current_version_id
      GROUP BY latest_boms.project_id
    ), reproduction_counts AS (
      SELECT rr.project_id, COUNT(bp.id) AS started
      FROM rpps_releases rr
      JOIN visible_projects vp ON vp.id = rr.project_id
      JOIN rpps_build_passports bp ON bp.release_id = rr.id
      JOIN builds b ON b.id = bp.build_id AND b.deleted_at IS NULL
      GROUP BY rr.project_id
    ), successful_reproduction_counts AS (
      SELECT rr.project_id, COUNT(outcome.id) AS verified
      FROM rpps_releases rr
      JOIN visible_projects vp ON vp.id = rr.project_id
      JOIN rpps_build_outcomes outcome ON outcome.release_id = rr.id
        AND outcome.outcome = 'succeeded' AND outcome.independence = 'independent'
      JOIN builds b ON b.id = outcome.build_id AND b.deleted_at IS NULL
      GROUP BY rr.project_id
    )
    SELECT
      COUNT(*) AS totalProjects,
      COALESCE(SUM(CASE WHEN vp.project_kind = 'physical_design' THEN 1 ELSE 0 END), 0) AS physicalDesignProjects,
      COALESCE(SUM(CASE WHEN vp.project_kind = 'robotics_software' THEN 1 ELSE 0 END), 0) AS roboticsSoftwareProjects,
      COALESCE(SUM(CASE WHEN vp.project_kind = 'commercial_showcase' THEN 1 ELSE 0 END), 0) AS commercialShowcaseProjects,
      COALESCE(SUM(CASE WHEN vp.status = 'published' THEN 1 ELSE 0 END), 0) AS publishedProjects,
      COALESCE(SUM(COALESCE(bom_counts.parts, 0)), 0) AS totalParts,
      COALESCE(SUM(COALESCE(reproduction_counts.started, 0)), 0) AS totalReproductions,
      COALESCE(SUM(COALESCE(successful_reproduction_counts.verified, 0)), 0) AS successfulReproductions
    FROM visible_projects vp
    LEFT JOIN bom_counts ON bom_counts.project_id = vp.id
    LEFT JOIN reproduction_counts ON reproduction_counts.project_id = vp.id
    LEFT JOIN successful_reproduction_counts ON successful_reproduction_counts.project_id = vp.id`;
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
