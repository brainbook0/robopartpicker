import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

const origin = "https://example.com";
const now = "2026-10-27T00:00:00.000Z";

// The real upstream README writes `**<sup>[2](#leaderbundle)</sup>`. The importer drops the link
// target and keeps `<sup>2</sup>` inside the line description, which is exactly what the SO-101
// BOM rows carried in production on 2026-10-27.
const MARKUP_DESCRIPTION = "STS3215 Servo 7.4V, 1/345 gear (C001) <sup>2</sup>";
const ENTITY_DESCRIPTION = "Motor &amp; driver bundle";

beforeAll(async () => {
  const projectId = "p-markup";
  const versionId = "bv-markup";
  const bomId = "b-markup";
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-markup', 'Markup Test', 'markup@example.com', 1, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO projects
      (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, project_kind, created_at, updated_at)
      VALUES (?1, 'markup-arm', 'Markup Arm', 'An arm whose BOM came from a README table.', 'u-markup', 'public', 'published', 0, 1, 'physical_design', ?2, ?2)`)
      .bind(projectId, now),
    env.DB.prepare(`INSERT INTO boms
      (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
      VALUES (?1, ?2, 'u-markup', 'markup-arm-bom', 'Markup Arm BOM', ?3, 'public', 0, ?4, ?4)`)
      .bind(bomId, projectId, versionId, now),
    env.DB.prepare(`INSERT INTO bom_versions
      (id, bom_id, version_label, currency, created_by_user_id, source_fingerprint,
       validation_report_json, quote_ready, publication_state, coverage_note,
       omission_report_json, compiler_version, policy_version, created_at)
      VALUES (?1, ?2, '1', 'USD', 'u-markup', ?3, '{}', 1, 'verified', 'All lines sourced.',
        '[]', 'bom-compiler/1', 'bom-publication/1', ?4)`)
      .bind(versionId, bomId, "c".repeat(64), now),
    env.DB.prepare(`INSERT INTO bom_items
      (id, bom_version_id, component_id, slot_key, description, quantity, unit,
       extraction_method, completeness, evidence_locator, confidence, line_classification,
       included, optional, raw_fields_json, aggregated_locators_json, sort_order)
      VALUES ('bi-markup-1', ?1, NULL, 'servo', ?2, 7, 'each', 'explicit-bom',
        'unresolved', 'README.md#row9', 0.5, 'purchased', 1, 0, '{}', '[\"README.md#row9\"]', 0)`)
      .bind(versionId, MARKUP_DESCRIPTION),
    env.DB.prepare(`INSERT INTO bom_items
      (id, bom_version_id, component_id, slot_key, description, quantity, unit,
       extraction_method, completeness, evidence_locator, confidence, line_classification,
       included, optional, raw_fields_json, aggregated_locators_json, sort_order)
      VALUES ('bi-markup-2', ?1, NULL, 'driver', ?2, 1, 'each', 'explicit-bom',
        'unresolved', 'README.md#row10', 0.5, 'purchased', 1, 0, '{}', '[\"README.md#row10\"]', 1)`)
      .bind(versionId, ENTITY_DESCRIPTION),
  ]);
});

describe("project prerender strips imported markup from BOM lines", () => {
  it("renders the part name as text instead of publishing the footnote tag", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/markup-arm", origin);
    expect(doc.bodyHtml).toContain("STS3215 Servo 7.4V, 1/345 gear (C001)");
    // The regression: esc() over raw markup emitted the literal characters `&lt;sup&gt;2&lt;/sup&gt;`,
    // so both crawlers and human readers saw "<sup>2</sup>" next to the part name.
    expect(doc.bodyHtml).not.toContain("<sup>");
    expect(doc.bodyHtml).not.toContain("&lt;sup&gt;");
    expect(doc.bodyHtml).not.toContain("sup&gt;");
  });

  it("decodes source HTML entities before escaping, so one entity is not published as two", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/markup-arm", origin);
    // `&amp;` in the source table becomes a single escaped `&amp;`, not `&amp;amp;`.
    expect(doc.bodyHtml).toContain("Motor &amp; driver bundle");
    expect(doc.bodyHtml).not.toContain("&amp;amp;");
  });
});
