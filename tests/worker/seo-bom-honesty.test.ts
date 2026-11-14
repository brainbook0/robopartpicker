import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

// Regression coverage for the BOM-prerender honesty + internal-link fix.
//
// Before: every /boms/<slug> crawlable description ended "Inspect … and observed pricing.",
// and the Dataset structured data always listed "Observed price" as a measured variable — even on
// BOMs where not one line carries an observed price (the SO-101's 14 lines all render "not
// available"). That is a hollow promise on a page whose whole point is stated evidence. The page
// also never linked back to its own parent project page.
//
// After: "observed pricing" is claimed only when at least one line's component has a real observed
// supplier offer; the fact list reports the priced-line count; and the page links to the project.

const origin = "https://example.com";
const now = "2026-11-13T00:00:00.000Z";

const insertProject = (id: string, slug: string, name: string) =>
  env.DB.prepare(`INSERT INTO projects
    (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, project_kind, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'u-honesty', 'public', 'published', 0, 1, 'physical_design', ?5, ?5)`)
    .bind(id, slug, name, `${name} summary.`, now);

const bomStatements = (id: string, projectId: string, slug: string, name: string, versionId: string) => [
  env.DB.prepare(`INSERT INTO boms
    (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
    VALUES (?1, ?2, 'u-honesty', ?3, ?4, ?5, 'public', 0, ?6, ?6)`)
    .bind(id, projectId, slug, name, versionId, now),
  env.DB.prepare(`INSERT INTO bom_versions
    (id, bom_id, version_label, currency, created_by_user_id, source_fingerprint,
     validation_report_json, quote_ready, publication_state, coverage_note,
     omission_report_json, compiler_version, policy_version, created_at)
    VALUES (?1, ?2, '1', 'USD', 'u-honesty', ?3, '{}', 1, 'verified', 'All lines sourced.',
      '[]', 'bom-compiler/1', 'bom-publication/1', ?4)`)
    .bind(versionId, id, "f".repeat(64), now),
];

const insertItem = (id: string, versionId: string, componentId: string | null, description: string, sort: number) =>
  env.DB.prepare(`INSERT INTO bom_items
    (id, bom_version_id, component_id, slot_key, description, quantity, unit,
     extraction_method, completeness, evidence_locator, confidence, line_classification,
     included, optional, raw_fields_json, aggregated_locators_json, sort_order)
    VALUES (?1, ?2, ?3, ?4, ?5, 1, 'each', 'explicit-bom',
      'unresolved', 'README.md#row1', 0.5, 'purchased', 1, 0, '{}', '[]', ?6)`)
    .bind(id, versionId, componentId, description, description, sort);

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-honesty', 'Honesty Test', 'honesty@example.com', 1, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO suppliers (id, slug, name, status, is_demo, created_at, updated_at)
      VALUES ('s-honesty', 'honesty-supplier', 'Honesty Supplier', 'active', 0, ?1, ?1)`).bind(now),

    // Unpriced BOM: line has no resolved component at all.
    insertProject("p-unpriced", "unpriced-arm", "Unpriced Arm"),
    ...bomStatements("b-unpriced", "p-unpriced", "unpriced-arm-bom", "Unpriced Arm BOM", "bv-unpriced"),
    insertItem("bi-unpriced-1", "bv-unpriced", null, "Some bracket", 0),

    // Priced BOM: line resolves to a component that carries a real observed supplier offer.
    insertProject("p-priced", "priced-arm", "Priced Arm"),
    ...bomStatements("b-priced", "p-priced", "priced-arm-bom", "Priced Arm BOM", "bv-priced"),
    env.DB.prepare(`INSERT INTO components
      (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
       source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
      VALUES ('c-priced', 'priced-servo', NULL, NULL, 'Priced Servo', 'actuator', NULL, 'active',
       NULL, 'honesty test', ?1, 0, 1, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO supplier_offers
      (id, supplier_id, component_id, supplier_sku, currency, unit_price_minor, minimum_quantity,
       availability, observed_at, is_demo, created_at, updated_at)
      VALUES ('o-priced', 's-honesty', 'c-priced', 'PS-1', 'USD', 1389, 1,
       'in_stock', ?1, 0, ?1, ?1)`).bind(now),
    insertItem("bi-priced-1", "bv-priced", "c-priced", "Priced Servo 7.4V", 0),
  ]);
});

describe("BOM prerender honesty and internal linking", () => {
  it("does not promise observed pricing when no line carries a price", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/unpriced-arm-bom", origin);
    expect(doc.description).not.toContain("observed pricing");
    expect(doc.description).toContain("source evidence");
    expect(doc.bodyHtml).not.toContain("Observed price");
    expect(JSON.stringify(doc.structuredData)).not.toContain("Observed price");
  });

  it("links a BOM page back to its parent project page", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/unpriced-arm-bom", origin);
    expect(doc.bodyHtml).toContain(
      `href="${origin}/projects/unpriced-arm">Unpriced Arm</a>`,
    );
  });

  it("still promises observed pricing, and reports the count, when a line is priced", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/priced-arm-bom", origin);
    expect(doc.description).toContain("observed pricing");
    expect(doc.bodyHtml).toContain("Lines with an observed supplier price: 1");
    expect(JSON.stringify(doc.structuredData)).toContain("Observed price");
    expect(doc.bodyHtml).toContain(
      `href="${origin}/projects/priced-arm">Priced Arm</a>`,
    );
  });
});
