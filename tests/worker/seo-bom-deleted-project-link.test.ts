import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

const origin = "https://example.com";
const now = "2026-11-27T00:00:00.000Z";

// A BOM can outlive its project. When a duplicate project is soft-deleted during a merge (the
// raw `open-source-rover` project was folded into `nasa-jpl-open-source-rover` on 2026-09-05), the
// public BOM rows that pointed at the deleted project stay public, resolved and sitemap-listed. The
// prerender joined the project without checking liveness, so a live, indexed BOM page emitted
// `<a href="/projects/<deleted-slug>">` — an internal link straight into a 404.
describe("BOM prerender never links to a soft-deleted project", () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
        VALUES ('u-orphan', 'Orphan Test', 'orphan@example.com', 1, ?1, ?1)`).bind(now),
      // Soft-deleted duplicate: public/published on paper, deleted_at set.
      env.DB.prepare(`INSERT INTO projects
        (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, project_kind, created_at, updated_at, deleted_at)
        VALUES ('p-orphan', 'orphan-arm', 'Orphan Arm', 'A merged-away duplicate project.', 'u-orphan', 'public', 'published', 0, 1, 'physical_design', ?1, ?1, ?1)`)
        .bind(now),
      // Live control project whose BOM must still link through.
      env.DB.prepare(`INSERT INTO projects
        (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, project_kind, created_at, updated_at)
        VALUES ('p-live', 'live-arm', 'Live Arm', 'A current project.', 'u-orphan', 'public', 'published', 0, 1, 'physical_design', ?1, ?1)`)
        .bind(now),
      env.DB.prepare(`INSERT INTO boms
        (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
        VALUES ('b-orphan', 'p-orphan', 'u-orphan', 'orphan-arm-bom', 'Orphan Arm BOM', 'bv-orphan', 'public', 0, ?1, ?1)`)
        .bind(now),
      env.DB.prepare(`INSERT INTO boms
        (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
        VALUES ('b-live', 'p-live', 'u-orphan', 'live-arm-bom', 'Live Arm BOM', 'bv-live', 'public', 0, ?1, ?1)`)
        .bind(now),
      env.DB.prepare(`INSERT INTO bom_versions
        (id, bom_id, version_label, currency, created_by_user_id, source_fingerprint,
         validation_report_json, quote_ready, publication_state, coverage_note,
         omission_report_json, compiler_version, policy_version, created_at)
        VALUES ('bv-orphan', 'b-orphan', '1', 'USD', 'u-orphan', ?1, '{}', 1, 'verified', 'All lines sourced.',
          '[]', 'bom-compiler/1', 'bom-publication/1', ?2)`).bind("d".repeat(64), now),
      env.DB.prepare(`INSERT INTO bom_versions
        (id, bom_id, version_label, currency, created_by_user_id, source_fingerprint,
         validation_report_json, quote_ready, publication_state, coverage_note,
         omission_report_json, compiler_version, policy_version, created_at)
        VALUES ('bv-live', 'b-live', '1', 'USD', 'u-orphan', ?1, '{}', 1, 'verified', 'All lines sourced.',
          '[]', 'bom-compiler/1', 'bom-publication/1', ?2)`).bind("e".repeat(64), now),
      env.DB.prepare(`INSERT INTO bom_items
        (id, bom_version_id, component_id, slot_key, description, quantity, unit,
         extraction_method, completeness, evidence_locator, confidence, line_classification,
         included, optional, raw_fields_json, aggregated_locators_json, sort_order)
        VALUES ('bi-orphan-1', 'bv-orphan', NULL, 'servo', 'STS3215 Servo 7.4V', 6, 'each', 'explicit-bom',
          'unresolved', 'README.md#row1', 0.5, 'purchased', 1, 0, '{}', '["README.md#row1"]', 0)`),
      env.DB.prepare(`INSERT INTO bom_items
        (id, bom_version_id, component_id, slot_key, description, quantity, unit,
         extraction_method, completeness, evidence_locator, confidence, line_classification,
         included, optional, raw_fields_json, aggregated_locators_json, sort_order)
        VALUES ('bi-live-1', 'bv-live', NULL, 'servo', 'STS3215 Servo 7.4V', 6, 'each', 'explicit-bom',
          'unresolved', 'README.md#row1', 0.5, 'purchased', 1, 0, '{}', '["README.md#row1"]', 0)`),
    ]);
  });

  it("omits the project link when the BOM's project is soft-deleted", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/orphan-arm-bom", origin);
    expect(doc.bodyHtml).toBeTruthy();
    // The regression: an internal link to a project page that returns 404.
    expect(doc.bodyHtml).not.toContain("/projects/orphan-arm");
    // The BOM page itself is unchanged: real facts and lines still render.
    expect(doc.bodyHtml).toContain("Orphan Arm BOM");
    expect(doc.bodyHtml).toContain("Line items");
  });

  it("still links a BOM to its project when that project is live", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/live-arm-bom", origin);
    expect(doc.bodyHtml).toContain("/projects/live-arm");
  });
});
