import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

const origin = "https://example.com";

describe("IU-RFQ-EXPIRY: automatic expiry enforcement", () => {
  let cookie = "";
  let bomId = "";

  beforeAll(async () => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO manufacturers (id, slug, name, status, is_demo, created_at, updated_at)
        VALUES ('maker-rfqx', 'rfqx-maker', 'RFQX Maker', 'active', 0, ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO components
        (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
         provenance_label, freshness_at, is_demo, version, created_at, updated_at)
        VALUES ('component-rfqx', 'rfqx-part', 'maker-rfqx', 'RFQX-1', 'RFQX Part', 'actuator', 'rfq expiry fixture',
         'active', 'test', ?1, 0, 1, ?1, ?1)`).bind(now),
    ]);
    cookie = await signUp();
    const created = await call("/api/v1/boms", {
      method: "POST",
      body: JSON.stringify({
        name: "RFQ expiry BOM",
        visibility: "private",
        items: [{ componentId: "component-rfqx", slotKey: "drive", description: "RFQX Part", quantity: 1 }],
      }),
    }, cookie);
    expect(created.status).toBe(201);
    bomId = (await created.json()).item.id;
  });

  async function createRfq(expiresInDays: number): Promise<string> {
    const created = await call("/api/v1/rfq", {
      method: "POST",
      body: JSON.stringify({ bomId, expiresInDays }),
    }, cookie);
    expect(created.status).toBe(201);
    return (await created.json()).item.id;
  }

  it("reports expired status and blocks every mutation once expires_at has passed", async () => {
    const rfqId = await createRfq(1);
    const past = new Date(Date.now() - 60_000).toISOString();
    await env.DB.prepare("UPDATE rfq_requests SET expires_at = ?1 WHERE id = ?2").bind(past, rfqId).run();

    const got = await call(`/api/v1/rfq/${rfqId}`, {}, cookie);
    expect(got.status).toBe(200);
    expect((await got.json()).item.status).toBe("expired");

    const transition = await call(`/api/v1/rfq/${rfqId}/transition`, {
      method: "POST",
      body: JSON.stringify({ action: "request" }),
    }, cookie);
    expect(transition.status).toBe(409);
    expect((await transition.json()).error.code).toBe("RFQ_EXPIRED");

    const responses = await call(`/api/v1/rfq/${rfqId}/responses`, {
      method: "POST",
      body: JSON.stringify({ items: [{ lineKey: "any-line", quoteUnitPriceMinor: 1000 }] }),
    }, cookie);
    expect(responses.status).toBe(409);
    expect((await responses.json()).error.code).toBe("RFQ_EXPIRED");
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM rfq_line_items WHERE rfq_request_id = ?1 AND quote_unit_price_minor IS NOT NULL").bind(rfqId).first<{ value: number }>())?.value)).toBe(0);

    const reconcile = await call(`/api/v1/rfq/${rfqId}/reconcile`, { method: "POST", body: JSON.stringify({}) }, cookie);
    expect(reconcile.status).toBe(409);
    expect((await reconcile.json()).error.code).toBe("RFQ_EXPIRED");

    const approve = await call(`/api/v1/rfq/${rfqId}/approve`, { method: "POST", body: JSON.stringify({}) }, cookie);
    expect(approve.status).toBe(409);
    expect((await approve.json()).error.code).toBe("RFQ_EXPIRED");

    const cancel = await call(`/api/v1/rfq/${rfqId}/cancel`, { method: "POST", body: JSON.stringify({}) }, cookie);
    expect(cancel.status).toBe(409);
    expect((await cancel.json()).error.code).toBe("RFQ_EXPIRED");
  });

  it("leaves nonterminal requests mutable before expires_at passes", async () => {
    const rfqId = await createRfq(1);

    const got = await call(`/api/v1/rfq/${rfqId}`, {}, cookie);
    expect((await got.json()).item.status).toBe("estimate_ready");

    const transition = await call(`/api/v1/rfq/${rfqId}/transition`, {
      method: "POST",
      body: JSON.stringify({ action: "request" }),
    }, cookie);
    expect(transition.status).toBe(200);
    expect((await transition.json()).item.status).toBe("quote_requested");
  });
});

async function signUp(): Promise<string> {
  const email = `rfqx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const response = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "RFQX Owner", email, password: "correct-horse-battery" }),
  });
  expect(response.status).toBe(200);
  const values = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
}

async function call(path: string, init: RequestInit = {}, cookie?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}
