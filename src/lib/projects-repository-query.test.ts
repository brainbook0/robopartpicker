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
    expect(query).toContain("latest_boms.bom_id, COALESCE(bom_counts.bom_line_count, 0)");
  });

  it("keeps supported sort expressions qualified and deterministic", () => {
    expect(projectOrderBy("name")).toBe("p.name COLLATE NOCASE ASC, p.github_stars DESC");
    expect(projectOrderBy("updated")).toBe("p.updated_at DESC");
    expect(projectOrderBy("popularity")).toContain("CASE p.project_kind");
    expect(projectOrderBy("popularity")).toContain("COALESCE(p.github_stars, -1) DESC, p.updated_at DESC");
  });

  it("uses grouped BOM counts for catalog stats instead of a per-project correlated subquery", () => {
    const query = buildProjectCatalogStatsQuery("WHERE p.deleted_at IS NULL AND p.status = 'published'");
    expect(query).toContain("bom_counts AS");
    expect(query).toContain("GROUP BY b.project_id");
    expect(query).not.toContain("SELECT COUNT(*) FROM boms b JOIN bom_items");
  });

  it("serves only current-release or legacy unversioned project files", () => {
    const query = buildProjectFilesQuery();
    expect(query).toContain("JOIN projects p ON p.id = pf.project_id");
    expect(query).toContain("pf.project_version_id IS NULL OR pf.project_version_id = p.current_version_id");
    expect(query).toContain("f.visibility = 'public' AND f.status = 'ready'");
  });
});
