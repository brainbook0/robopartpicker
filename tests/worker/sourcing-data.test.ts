import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { CatalogRepository } from "../../worker/db/repositories/catalog";
import { normalizeOfferWriteInput } from "../../src/shared/offer";

const origin = "https://example.com";
const ingestionSecret = "test-only-ingestion-secret-32-characters-minimum";
const offerKey = { supplierId: "supplier-sd", componentId: "component-sd" };

const baseInput = () =>
  normalizeOfferWriteInput({
    ...offerKey,
    currency: "USD",
    unitPriceMinor: 1200,
    stockQuantity: 10,
    minimumQuantity: 1,
    leadTimeDays: 7,
    condition: "new",
    riskLabel: "exact",
    freshnessLabel: "fresh",
    observedAt: "2026-08-13T00:00:00.000Z",
  });

describe("IU-SOURCING-DATA: offer history and provenance", () => {
  beforeAll(async () => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO suppliers (id, slug, name, status, is_demo, created_at, updated_at)
        VALUES ('supplier-sd', 'sd-supplier', 'SD Supplier', 'active', 0, ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO manufacturers (id, slug, name, status, is_demo, created_at, updated_at)
        VALUES ('maker-sd', 'sd-maker', 'SD Maker', 'active', 0, ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO components
        (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
         provenance_label, freshness_at, is_demo, version, created_at, updated_at)
        VALUES ('component-sd', 'sd-part', 'maker-sd', 'SD-1', 'SD Part', 'actuator', 'sourcing-data fixture',
         'active', 'test', ?1, 0, 1, ?1, ?1)`).bind(now),
    ]);
  });

  it("inserts an offer and appends its initial observation", async () => {
    const repo = new CatalogRepository(env.DB);
    const created = await repo.upsertOffer(baseInput());
    expect(created.historyAppended).toBe(true);
    const history = await repo.listOfferHistory(created.offerId);
    expect(history).toHaveLength(1);
    expect(history[0].unitPriceMinor).toBe(1200);
    expect(history[0].stockQuantity).toBe(10);
    expect(history[0].minimumQuantity).toBe(1);
    expect(history[0].leadTimeDays).toBe(7);
  });

  it("appends history on price change and never overwrites the prior observation", async () => {
    const repo = new CatalogRepository(env.DB);
    const created = await repo.upsertOffer(baseInput());
    const updated = await repo.upsertOffer({ ...baseInput(), unitPriceMinor: 1350, stockQuantity: 10 });
    expect(updated.offerId).toBe(created.offerId);
    expect(updated.historyAppended).toBe(true);
    const history = await repo.listOfferHistory(created.offerId);
    expect(history).toHaveLength(2);
    expect(history.map((h) => h.unitPriceMinor).sort((a, b) => a - b)).toEqual([1200, 1350]);
  });

  it("does not append a duplicate observation on a no-op update", async () => {
    const repo = new CatalogRepository(env.DB);
    const created = await repo.upsertOffer({ ...baseInput(), unitPriceMinor: 1500 });
    const noop = await repo.upsertOffer({ ...baseInput(), unitPriceMinor: 1500 });
    expect(noop.offerId).toBe(created.offerId);
    expect(noop.historyAppended).toBe(false);
    const history = await repo.listOfferHistory(created.offerId);
    expect(history).toHaveLength(1);
  });

  it("rejects a placeholder price and accepts a valid update through the endpoint", async () => {
    const repo = new CatalogRepository(env.DB);
    const created = await repo.upsertOffer(baseInput());
    const invalid = await call(`/api/v1/offers/${created.offerId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-ingestion-secret": ingestionSecret },
      body: JSON.stringify({ unitPriceMinor: null }),
    });
    expect(invalid.status).toBe(400);

    const valid = await call(`/api/v1/offers/${created.offerId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-ingestion-secret": ingestionSecret },
      body: JSON.stringify({ unitPriceMinor: 1400, stockQuantity: 4, currency: "USD" }),
    });
    expect(valid.status).toBe(200);
    const payload = (await valid.json()) as { historyAppended: boolean };
    expect(payload.historyAppended).toBe(true);
  });
});

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) headers.set("origin", origin);
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}
