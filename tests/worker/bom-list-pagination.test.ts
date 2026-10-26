import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

const origin = "https://example.com";

/**
 * The public BOM list is documented in openapi.json / llms.txt for agent
 * clients. It used to return every row (2,408 records, ~1.19 MB) regardless
 * of `limit`, which made the endpoint unusable for the clients it advertises.
 */
describe("GET /api/v1/boms paginates the public list", () => {
  let cookie = "";
  const created: string[] = [];

  beforeAll(async () => {
    cookie = await signUp();
    for (const name of ["Pagination BOM A", "Pagination BOM B", "Pagination BOM C"]) {
      const response = await call("/api/v1/boms", {
        method: "POST",
        body: JSON.stringify({ name, visibility: "public", items: [] }),
      }, cookie);
      expect(response.status).toBe(201);
      created.push((await response.json()).item.id);
    }
  });

  it("honours limit and page and reports total/pages", async () => {
    const first = await call("/api/v1/boms?limit=2");
    expect(first.status).toBe(200);
    const body = await first.json() as { items: Array<{ id: string }>; total: number; page: number; limit: number; pages: number };
    expect(body.limit).toBe(2);
    expect(body.page).toBe(1);
    expect(body.items.length).toBeLessThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(3);
    expect(body.pages).toBe(Math.max(1, Math.ceil(body.total / 2)));

    const second = await call("/api/v1/boms?limit=2&page=2");
    const next = await second.json() as { items: Array<{ id: string }>; page: number };
    expect(next.page).toBe(2);
    const firstIds = new Set(body.items.map((item) => item.id));
    expect(next.items.some((item) => firstIds.has(item.id))).toBe(false);
  });

  it("defaults to a bounded page instead of the whole catalog", async () => {
    const response = await call("/api/v1/boms");
    const body = await response.json() as { items: unknown[]; limit: number };
    expect(body.limit).toBe(50);
    expect(body.items.length).toBeLessThanOrEqual(50);
  });

  it("clamps an oversized limit instead of returning everything", async () => {
    const response = await call("/api/v1/boms?limit=99999");
    const body = await response.json() as { limit: number };
    expect(body.limit).toBe(1000);
  });
});

async function signUp(): Promise<string> {
  const email = `bompage-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const response = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "BOM Pagination Owner", email, password: "correct-horse-battery" }),
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
