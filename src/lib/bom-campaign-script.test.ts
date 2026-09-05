import { describe, expect, it } from "vitest";
import { boundValidationBlockers, buildCampaignPublicationSql, buildExactComponentMatcher, selectBomSourcePaths } from "../../scripts/lib/bom-campaign";
import type { CompiledProjectBom } from "./bom-compiler";

describe("BOM generation campaign", () => {
  it("bounds inline quote blockers while reporting the omitted count", () => {
    const blockers = Array.from({ length: 100 }, (_, index) => ({ lineId: `line-${index}`, description: `Blocker ${index}` }));
    const bounded = boundValidationBlockers(blockers, 40);
    expect(bounded).toHaveLength(41);
    expect(bounded.at(-1)).toEqual({ lineId: "bom", description: "60 additional quote blockers are stored in line-level validation data." });
  });

  it("selects explicit BOM files and excludes partition/config impostors", () => {
    expect(selectBomSourcePaths([
      { path: "README.md", size: 3000 },
      { path: "hardware/bom.csv", size: 4000 },
      { path: "hardware/bill-of-materials.xlsx", size: 5000 },
      { path: "firmware/partitions.csv", size: 1000 },
      { path: "config/parts.yaml", size: 1000 },
      { path: "rpps.yaml", size: 2000 },
      { path: "docs/BOM.md", size: 1200 },
      { path: "robot.urdf", size: 2000 },
    ])).toEqual([
      "rpps.yaml",
      "hardware/bom.csv",
      "hardware/bill-of-materials.xlsx",
      "docs/BOM.md",
      "README.md",
    ]);
  });

  it("poisons ambiguous exact MPN keys instead of selecting the first catalog row", () => {
    const match = buildExactComponentMatcher([
      { id: "one", manufacturer: "Acme", mpn: "A-1" },
      { id: "two", manufacturer: "Acme", mpn: "A-1" },
      { id: "three", manufacturer: "Other", mpn: "B-2" },
      { id: "four", manufacturer: null, mpn: "UNIQUE-4" },
    ]);
    expect(match("Acme", "A-1")).toBeNull();
    expect(match("Other", "B-2")).toBe("three");
    expect(match(undefined, "UNIQUE-4")).toBe("four");
    expect(match(undefined, "A-1")).toBeNull();
  });

  it("publishes an immutable current version without deleting historical lines", () => {
    const compiled: CompiledProjectBom = {
      schemaVersion: "bom-compiler/1", compilerVersion: "bom-compiler/1", policyVersion: "bom-publication/1",
      projectId: "project-1", sourceRevision: "abc123", sourceFingerprint: "f".repeat(64), publicationState: "verified",
      lines: [{ id: "line-1", description: "Drive motor", quantity: 2, unit: "each", manufacturer: "Other", mpn: "B-2", optional: false, lineClassification: "purchased", completeness: "verified", componentMatchStatus: "exact_candidate", evidenceLocator: "bom.csv#row2", aggregatedLocators: ["bom.csv#row2"], rawFields: [{ Name: "Drive motor" }] }],
      omissions: [], accounting: { ok: true, errors: [], objectsSeen: 1, outcomesRecorded: 1 },
      outcomes: [{ sourceObjectId: "bom.csv#row2", outcome: "published_purchased" }], artifacts: [],
    };
    const sql = buildCampaignPublicationSql({
      project: { id: "project-1", slug: "robot", name: "Robot", ownerUserId: "owner", organizationId: null, visibility: "public", existingBomId: "bom-old", existingVersionCount: 3 },
      compiled,
      now: "2026-08-26T00:00:00.000Z",
      matchComponent: () => "three",
      ids: { runId: "run-new", bomId: "bom-old", versionId: "version-new" },
    }).join("\n");
    expect(sql).toContain("INSERT INTO bom_versions");
    expect(sql).toContain("'verified'");
    expect(sql).toContain("UPDATE boms SET current_version_id = 'version-new'");
    expect(sql).toContain("'three'");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+bom/iu);
  });
});
