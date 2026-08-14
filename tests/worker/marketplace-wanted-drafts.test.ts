import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

const origin = "https://example.com";
let ownerCookie = "";
let otherCookie = "";

async function call(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}
function jsonBody(value: unknown): string { return JSON.stringify(value); }
async function body<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }
function cookies(response: Response): string {
  const values = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
}

beforeAll(async () => {
  const suffix = crypto.randomUUID();
  const owner = await call("/api/auth/sign-up/email", { method: "POST", body: jsonBody({ name: "Wanted Draft Owner", email: `wanted-owner-${suffix}@example.com`, password: "correct-horse-battery" }) });
  expect(owner.status).toBe(200); ownerCookie = cookies(owner);
  const other = await call("/api/auth/sign-up/email", { method: "POST", body: jsonBody({ name: "Wanted Draft Other", email: `wanted-other-${suffix}@example.com`, password: "correct-horse-battery" }) });
  expect(other.status).toBe(200); otherCookie = cookies(other);
});

describe("Marketplace wanted draft integrity", () => {
  it("keeps wanted drafts private and rejects silent conversion to sell listings", async () => {
    const created = await call("/api/v1/marketplace", { method: "POST", body: jsonBody({
      listingType: "wanted",
      title: "Need matched actuator revisions",
      description: "Need two matched actuator revisions with test evidence and destination constraints.",
      category: "actuator",
      conditionGrade: "not_applicable",
      currency: "USD",
      price: 500,
      quantity: 2,
      region: "US",
      visibility: "private",
    }) }, ownerCookie);
    expect(created.status).toBe(201);
    const draft = (await body<{ item: { id: string; version: number; listingType: string; visibility: string; status: string } }>(created)).item;
    expect(draft).toMatchObject({ listingType: "wanted", visibility: "private", status: "draft" });

    const otherRead = await call(`/api/v1/marketplace/${draft.id}`, {}, otherCookie);
    expect(otherRead.status).toBe(403);

    const mine = await call("/api/v1/marketplace?mine=true&status=draft", {}, ownerCookie);
    expect(mine.status).toBe(200);
    expect((await body<{ items: Array<{ id: string; listingType: string; visibility: string }> }>(mine)).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: draft.id, listingType: "wanted", visibility: "private" }),
    ]));

    const converted = await call(`/api/v1/marketplace/${draft.id}`, { method: "PATCH", body: jsonBody({
      version: draft.version,
      listingType: "sell",
      title: "Need matched actuator revisions",
      description: "Attempt to overwrite this wanted draft from the wrong editor.",
      category: "actuator",
      conditionGrade: "B",
      currency: "USD",
      price: 500,
      quantity: 2,
      region: "US",
      visibility: "private",
    }) }, ownerCookie);
    expect(converted.status).toBe(422);
    expect((await body<{ error: { code: string } }>(converted)).error.code).toBe("LISTING_TYPE_IMMUTABLE");
    expect(await env.DB.prepare("SELECT listing_type, visibility FROM marketplace_listings WHERE id = ?1").bind(draft.id).first()).toEqual({ listing_type: "wanted", visibility: "private" });
  });
});
