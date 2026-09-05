import { describe, expect, it } from "vitest";
import { buildProjectCatalogStatsQuery, buildProjectFilesQuery, buildProjectListQuery, projectOrderBy } from "@/shared/projectListQuery";

describe("project catalog list query", () => {
  it("paginates project IDs before loading RPPS JSON and aggregate tables", () => {
    const query = buildProjectListQuery({
      where: "WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.visibility = 'public' AND p.project_kind = ?1",
      limitPlaceholder: "?2",
      offsetPlaceholder: "?3",
      sort: "popularity",
    });

    const pageCte = query.slice(0, query.indexOf("), reproduction_counts AS"));
    expect(pageCte).toContain("SELECT p.id");
    expect(pageCte).toContain("LIMIT ?2 OFFSET ?3");
    expect(pageCte).not.toContain("rpps_json");
    expect(pageCte).not.toContain("rpps_build_passports");
    expect(pageCte).not.toContain("bom_items");

    expect(query).toContain("successful_reproduction_counts AS");
    expect(query).toContain("JOIN builds b ON b.id = bp.build_id AND b.deleted_at IS NULL");
    expect(query).toContain("outcome.outcome = 'succeeded' AND outcome.independence = 'independent'");
    expect(query).toContain("latest_boms.bom_id, COALESCE(bom_facts.bom_line_count, 0)");
  });

  it("returns canonical preview price and latest-BOM publication facts for every paged project", () => {
    const query = buildProjectListQuery({
      where: "WHERE p.deleted_at IS NULL AND p.status = 'published' AND p.visibility = 'public'",
      limitPlaceholder: "?1",
      offsetPlaceholder: "?2",
      sort: "completeness",
    });

    expect(query).toContain("active_price_estimates AS");
    expect(query).toContain("estimate_type AS preview_cost_kind");
    expect(query).toContain("publication_state AS bom_publication_state");
    expect(query).toContain("WHEN p.project_kind = 'commercial_showcase' THEN 'manufacturer_unavailable'");
    expect(query).toContain("NULLIF(bom_facts.known_cost_minor, 0)");
    expect(query).toContain("project-point-estimate-v1");
    expect(query).toContain("WHEN p.robot_category = 'humanoid' THEN 700000");
    expect(query).toContain("WHEN p.project_kind = 'physical_design' THEN 'inferred'");
    expect(query).toContain("latest_boms.current_version_id");
    expect(query).toContain("CASE WHEN p.project_kind <> 'commercial_showcase' THEN p.estimated_cost_minor END");
    expect(query).toContain("p.project_kind <> 'commercial_showcase' AND p.estimated_cost_minor IS NOT NULL");
    expect(query).toContain("COALESCE(bom_facts.bom_line_count, 0) AS bom_line_count");
    expect(query).not.toContain("FROM boms b\n      JOIN page_projects pp ON pp.id = b.project_id\n      LEFT JOIN bom_items");
  });

  it("keeps supported sort expressions qualified and deterministic", () => {
    expect(projectOrderBy("completeness")).toContain("project_specs");
    expect(projectOrderBy("completeness")).toContain("project_files");
    expect(projectOrderBy("completeness")).toContain("bom_items");
    expect(projectOrderBy(undefined)).toBe(projectOrderBy("completeness"));
    expect(projectOrderBy("name")).toBe("p.name COLLATE NOCASE ASC, p.github_stars DESC");
    expect(projectOrderBy("updated")).toBe("p.updated_at DESC");
    expect(projectOrderBy("popularity")).toContain("CASE p.project_kind");
    expect(projectOrderBy("popularity")).toContain("COALESCE(p.github_stars, -1) DESC, p.updated_at DESC");
  });

  it("uses grouped BOM counts for catalog stats instead of a per-project correlated subquery", () => {
    const query = buildProjectCatalogStatsQuery("WHERE p.deleted_at IS NULL AND p.status = 'published'");
    expect(query).toContain("ranked_boms AS");
    expect(query).toContain("WHERE b.is_demo = 0");
    expect(query).toContain("bom_counts AS");
    expect(query).toContain("reproduction_counts AS");
    expect(query).toContain("successful_reproduction_counts AS");
    expect(query).toContain("totalReproductions");
    expect(query).toContain("successfulReproductions");
    expect(query).toContain("GROUP BY latest_boms.project_id");
    expect(query).not.toContain("SELECT COUNT(*) FROM boms b JOIN bom_items");
  });

  it("serves only current-release or legacy unversioned project files", () => {
    const query = buildProjectFilesQuery();
    expect(query).toContain("JOIN projects p ON p.id = pf.project_id");
    expect(query).toContain("pf.project_version_id IS NULL OR pf.project_version_id = p.current_version_id");
    expect(query).toContain("f.visibility = 'public' AND f.status = 'ready'");
  });
});
