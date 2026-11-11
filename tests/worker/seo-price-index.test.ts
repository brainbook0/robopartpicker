import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

// Regression coverage for the /price-index per-category offer counts.
//
// The page used to compute offers-per-category with a correlated subquery
// (`SELECT COUNT(*) FROM supplier_offers so WHERE so.component_id = c.id ...`) inside a GROUP BY query.
// SQLite evaluates a bare outer column in an aggregate query against one arbitrary row of the group, so
// the subquery returned the offer count of a single component, not the category — and reported 0 for any
// category whose first component had no offer (verified against production 2026-11-10: electronics had
// 495 real offers and rendered 0). The page is a public "dataset" page, so a wrong count is a trust bug,
// not a cosmetic one. These tests fail on the correlated form and pass on the JOIN aggregate.

const origin = "https://example.com";
const now = "2026-10-20T00:00:00.000Z";

const insertComponent = (id: string, slug: string, name: string, category: string) =>
  env.DB.prepare(`INSERT INTO components
    (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
     source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, NULL, NULL, ?3, ?4, NULL, 'active',
     NULL, 'price index test', ?5, 0, 1, ?5, ?5)`)
    .bind(id, slug, name, category, now);

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO suppliers (id, slug, name, status, is_demo, created_at, updated_at)
      VALUES ('s-price-test', 'price-test-supplier', 'Price Test Supplier', 'active', 0, ?1, ?1)`).bind(now),
    // Three components in one category. Only the last carries an offer, so a de-correlated
    // (arbitrary-row) subquery is guaranteed to miss it.
    insertComponent("c-price-a", "price-widget-a", "Widget A", "sprocket"),
    insertComponent("c-price-b", "price-widget-b", "Widget B", "sprocket"),
    insertComponent("c-price-c", "price-widget-c", "Widget C", "sprocket"),
    env.DB.prepare(`INSERT INTO supplier_offers
      (id, supplier_id, component_id, supplier_sku, currency, unit_price_minor, minimum_quantity,
       availability, observed_at, is_demo, created_at, updated_at)
      VALUES ('o-price-c', 's-price-test', 'c-price-c', 'WGC-1', 'USD', 1499, 1,
       'in_stock', ?1, 0, ?1, ?1)`).bind(now),
  ]);
});

describe("component price index page", () => {
  it("counts every offer in a category instead of one arbitrary component's offers", async () => {
    const response = await exports.default.fetch(`${origin}/price-index`);
    expect(response.status).toBe(200);
    const html = await response.text();
    // The category row must show 1 offer and the observed price, not 0/em dash.
    expect(html).toContain(
      `<td><a href="/parts/sprocket">sprocket</a></td><td>3</td><td>1</td><td>$14.99</td>`,
    );
    // The summary line must agree with the category table.
    expect(html).toContain("1 supplier offer is recorded");
    expect(html).not.toContain('<td><a href="/parts/sprocket">sprocket</a></td><td>3</td><td>0</td>');
  });

  it("advertises the observed price range in the page description", async () => {
    const response = await exports.default.fetch(`${origin}/price-index`);
    const html = await response.text();
    expect(html).toContain("ranging from $14.99 to $14.99");
  });
});
