import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

// Regression coverage for the BOM line label.
//
// Before: a line that resolved to a catalogue component rendered the CATALOGUE's product name as the
// link text, throwing away the bill's own wording. On the SO-101 bill that collapsed three distinct
// lines -- "STS3215 Servo 7.4V, 1/345 gear (C001)", "… 1/191 gear (C044)", "… 1/147 gear (C046)" --
// into the same 200-character product name, so a reader could not tell which gearing each line
// called for, and the bill's own "Motor Control Board" was replaced by a truncated SKU title.
//
// After: the resolved line links to the part page but keeps the source bill's text. The catalogue
// name is the fallback only for a line whose own description is empty.

const origin = "https://example.com";
const now = "2026-11-18T00:00:00.000Z";

// A deliberately distinctive catalogue name: if this string appears where a line description should
// be, the renderer has swapped in the catalogue title again.
const COMPONENT_NAME = "Serial Bus Servo, Magnetic Encoder, Two-way Feedback, Servo/Motor Switchable";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-line', 'Line Test', 'line@example.com', 1, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO projects
      (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, project_kind, created_at, updated_at)
      VALUES ('p-line', 'line-arm', 'Line Arm', 'Line Arm summary.', 'u-line', 'public', 'published', 0, 1, 'physical_design', ?1, ?1)`)
      .bind(now),
    env.DB.prepare(`INSERT INTO components
      (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
       source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
      VALUES ('c-line', 'line-servo', NULL, NULL, ?1, 'actuator', NULL, 'active',
       NULL, 'line test', ?2, 0, 1, ?2, ?2)`).bind(COMPONENT_NAME, now),
    env.DB.prepare(`INSERT INTO boms
      (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
      VALUES ('b-line', 'p-line', 'u-line', 'line-arm-bom', 'Line Arm BOM', 'bv-line', 'public', 0, ?1, ?1)`)
      .bind(now),
    env.DB.prepare(`INSERT INTO bom_versions
      (id, bom_id, version_label, currency, created_by_user_id, source_fingerprint,
       validation_report_json, quote_ready, publication_state, coverage_note,
       omission_report_json, compiler_version, policy_version, created_at)
      VALUES ('bv-line', 'b-line', '1', 'USD', 'u-line', ?1, '{}', 1, 'partial', 'Lines sourced.',
        '[]', 'bom-compiler/1', 'bom-publication/1', ?2)`).bind("f".repeat(64), now),

    // Two lines resolved to the SAME component with different gearings, exactly the SO-101 shape.
    env.DB.prepare(`INSERT INTO bom_items
      (id, bom_version_id, component_id, slot_key, description, quantity, unit,
       extraction_method, completeness, evidence_locator, confidence, line_classification,
       included, optional, raw_fields_json, aggregated_locators_json, sort_order)
      VALUES ('bi-line-1', 'bv-line', 'c-line', 'source-line-1',
        'STS3215 Servo 7.4V, 1/345 gear (C001)', 7, 'each', 'explicit-bom', 'probable',
        'README.md#row2', 1, 'purchased', 1, 0, '{}', '[]', 0)`),
    env.DB.prepare(`INSERT INTO bom_items
      (id, bom_version_id, component_id, slot_key, description, quantity, unit,
       extraction_method, completeness, evidence_locator, confidence, line_classification,
       included, optional, raw_fields_json, aggregated_locators_json, sort_order)
      VALUES ('bi-line-2', 'bv-line', 'c-line', 'source-line-2',
        'STS3215 Servo 7.4V, 1/147 gear (C046)', 3, 'each', 'explicit-bom', 'probable',
        'README.md#row4', 1, 'purchased', 1, 0, '{}', '[]', 1)`),
    // An unresolved line: unrelated part the catalogue cannot identify, stays plain text.
    env.DB.prepare(`INSERT INTO bom_items
      (id, bom_version_id, component_id, slot_key, description, quantity, unit,
       extraction_method, completeness, evidence_locator, confidence, line_classification,
       included, optional, raw_fields_json, aggregated_locators_json, sort_order)
      VALUES ('bi-line-3', 'bv-line', NULL, 'source-line-3', 'Table Clamp 4pcs', 1, 'each',
        'explicit-bom', 'unresolved', 'README.md#row8', 1, 'purchased', 1, 0, '{}', '[]', 2)`),
    // A resolved line whose own description is empty: the catalogue name is the only label available.
    env.DB.prepare(`INSERT INTO bom_items
      (id, bom_version_id, component_id, slot_key, description, quantity, unit,
       extraction_method, completeness, evidence_locator, confidence, line_classification,
       included, optional, raw_fields_json, aggregated_locators_json, sort_order)
      VALUES ('bi-line-4', 'bv-line', 'c-line', 'source-line-4', '', 1, 'each',
        'explicit-bom', 'probable', 'README.md#row9', 1, 'purchased', 1, 0, '{}', '[]', 3)`),
  ]);
});

describe("BOM line labels keep the bill's own wording", () => {
  it("links a resolved line to its part page using the bill's text, not the catalogue title", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/line-arm-bom", origin);
    const html = doc.bodyHtml ?? "";
    const partUrl = `${origin}/parts/actuator/line-servo`;

    expect(html).toContain(`href="${partUrl}">STS3215 Servo 7.4V, 1/345 gear (C001)</a>`);
    expect(html).toContain(`href="${partUrl}">STS3215 Servo 7.4V, 1/147 gear (C046)</a>`);
  });

  it("does not substitute the catalogue product name for the line description", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/line-arm-bom", origin);
    const html = doc.bodyHtml ?? "";
    // Two sibling gearings must read differently, or a builder cannot tell them apart.
    expect(html.match(/C001/gu)?.length).toBeGreaterThan(0);
    expect(html.match(/C046/gu)?.length).toBeGreaterThan(0);
    // The catalogue title appears exactly once: the line that has no description of its own. It must
    // never appear in place of a line the bill itself names.
    expect(html.split(COMPONENT_NAME).length - 1).toBe(1);
  });

  it("leaves an unresolved line as plain text with no part link", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/line-arm-bom", origin);
    const html = doc.bodyHtml ?? "";
    expect(html).toContain("Table Clamp 4pcs — 1 each (purchased, unresolved)");
    expect(html).not.toContain(`<a href="${origin}/parts/actuator/line-servo">Table Clamp 4pcs</a>`);
  });

  it("falls back to the catalogue name when the line has no description of its own", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms/line-arm-bom", origin);
    const html = doc.bodyHtml ?? "";
    expect(html).toContain(`href="${origin}/parts/actuator/line-servo">${COMPONENT_NAME}</a>`);
  });
});
