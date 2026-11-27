import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

// Imported source markup must never be published as literal characters. Live 2026-11-27: a part
// page served `48 [rev/min] (at 9.0 [V])&lt;br /&gt;…&lt;br /&gt;**64 [rev/min]** rev/min` because
// motor spec tables carry `<br />` row separators and `**` emphasis verbatim; part pages are the
// one surface the catalogue does get indexed on, and the same class of defect put a raw
// `<img src="…">` tag in the link text of four BOM lines. This pins both at the render boundary.
const origin = "https://example.com";
const now = "2026-11-27T00:00:00.000Z";

const insertComponent = (id: string, slug: string, name: string) =>
  env.DB.prepare(`INSERT INTO components
    (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
     source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, NULL, NULL, ?3, 'widget', NULL, 'active',
     NULL, 'worker integration test', ?4, 0, 1, ?4, ?4)`)
    .bind(id, slug, name, now);

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-specmarkup', 'Spec Markup Test', 'spec-markup@example.com', 1, ?1, ?1)`).bind(now),

    // A part whose spec value carries source `<br />` separators and `**` emphasis.
    insertComponent("c-spec", "markup-spec-widget", "Markup Spec Widget"),
    env.DB.prepare(`INSERT INTO component_revisions (id, component_id, revision_label, status, effective_at, created_at)
      VALUES ('cr-spec', 'c-spec', 'source-current', 'published', ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO component_specs (id, component_revision_id, spec_key, label, value_text, value_number, unit, sort_order, created_at)
      VALUES ('cs-speed', 'cr-spec', 'no_load_speed', 'No-load speed',
        '48 [rev/min] (at 9.0 [V])<br />59 [rev/min] (at 11.1 [V])<br />**64 [rev/min] (at 12.0 [V])**',
        NULL, 'rev/min', 10, ?1)`).bind(now),

    // A BOM line whose only source content was an image cell.
    env.DB.prepare(`INSERT INTO projects
      (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, project_kind, created_at, updated_at)
      VALUES ('p-img', 'img-label-arm', 'Img Label Arm', 'A project whose BOM row carried an image.', 'u-specmarkup', 'public', 'published', 0, 1, 'physical_design', ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO boms
      (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
      VALUES ('b-img', 'p-img', 'u-specmarkup', 'img-label-arm-bom', 'Img Label Arm BOM', 'bv-img', 'public', 0, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO bom_versions
      (id, bom_id, version_label, currency, created_by_user_id, source_fingerprint,
       validation_report_json, quote_ready, publication_state, coverage_note,
       omission_report_json, compiler_version, policy_version, created_at)
      VALUES ('bv-img', 'b-img', '1', 'USD', 'u-specmarkup', ?1, '{}', 1, 'verified', 'All lines sourced.',
        '[]', 'bom-compiler/1', 'bom-publication/1', ?2)`).bind("f".repeat(64), now),
    env.DB.prepare(`INSERT INTO bom_items
      (id, bom_version_id, component_id, slot_key, description, quantity, unit,
       extraction_method, completeness, evidence_locator, confidence, line_classification,
       included, optional, raw_fields_json, aggregated_locators_json, sort_order)
      VALUES ('bi-img-1', 'bv-img', NULL, 'cable', '<img src="./Purchased_Parts/XT30_2+2.png" width="80">', 2, 'each',
        'explicit-bom', 'unresolved', 'readme.md#row2', 0.5, 'purchased', 1, 0, '{}', '["readme.md#row2"]', 0)`),
  ]);
});

describe("imported spec markup is normalised at the render boundary", () => {
  it("renders a spec value without literal <br /> tags or markdown emphasis", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/widget/markup-spec-widget", origin);
    expect(doc).toBeTruthy();
    expect(doc!.bodyHtml).toContain("No-load speed");
    // No escaped source markup survives; the row separator is a plain character.
    expect(doc!.bodyHtml).not.toContain("&lt;br");
    expect(doc!.bodyHtml).not.toContain("**");
    expect(doc!.bodyHtml).toContain("48 [rev/min] (at 9.0 [V]) · 59 [rev/min] (at 11.1 [V]) · 64 [rev/min] (at 12.0 [V])");
  });

  it("never publishes a raw image tag as a BOM line label", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/img-label-arm-bom", origin);
    expect(doc).toBeTruthy();
    expect(doc!.bodyHtml).not.toContain("&lt;img");
    expect(doc!.bodyHtml).not.toContain("Purchased_Parts");
    // The line is still shown honestly, with a neutral label rather than raw markup.
    expect(doc!.bodyHtml).toContain("Unspecified part");
    expect(doc!.bodyHtml).toContain("2 each");
  });
});
