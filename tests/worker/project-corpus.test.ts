import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const origin = "https://example.com";

describe("IU-PROJECT-CORPUS: provenance and publishability", () => {
  it("records provenance on a publishable project and exposes it via API", async () => {
    const cookie = await signUp();
    const slug = `corpus-ready-${Date.now()}`;
    const rpps = {
      rpps_version: "1.0.0",
      name: "Corpus Ready Bot",
      slug,
      version: "0.1.0",
      license: "Apache-2.0",
      authors: [{ name: "Owner User" }],
    };
    const created = await call("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ visibility: "public", rpps }),
    }, cookie);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: Record<string, unknown> };
    expect(item.publishability).toBe("ready");
    expect(item.status).toBe("published");
    expect(item.maintainer).toBe("Owner User");
    expect(item.ingested_at).toBeTruthy();
    expect(item.last_checked_at).toBeTruthy();

    const fetched = await call(`/api/v1/projects/${item.id}`, {}, cookie);
    expect(fetched.status).toBe(200);
    const loaded = (await fetched.json()) as { item: Record<string, unknown> };
    expect(loaded.item.upstream_identity).toBe(item.upstream_identity);
    expect(loaded.item.publishability).toBe("ready");
  });

  it("does not silently publish a project missing required provenance", async () => {
    const cookie = await signUp();
    const slug = `corpus-incomplete-${Date.now()}`;
    const created = await call("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        visibility: "public",
        rpps: { rpps_version: "1.0.0", name: "Incomplete Bot", slug, version: "0.1.0" },
      }),
    }, cookie);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: Record<string, unknown> };
    expect(item.publishability).toBe("incomplete");
    expect(item.status).toBe("review");
  });

  it("deduplicates projects by canonical upstream identity", async () => {
    const cookie = await signUp();
    const repoUrl = `https://github.com/example/corpus-${Date.now()}`;
    const first = await call("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        visibility: "public",
        rpps: { rpps_version: "1.0.0", name: "Dedup One", slug: `dedup-one-${Date.now()}`, version: "0.1.0", license: "MIT", repo_url: repoUrl, authors: [{ name: "Owner" }] },
      }),
    }, cookie);
    expect(first.status).toBe(201);
    const second = await call("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        visibility: "public",
        rpps: { rpps_version: "1.0.0", name: "Dedup Two", slug: `dedup-two-${Date.now()}`, version: "0.1.0", license: "MIT", repo_url: `${repoUrl}.git`, authors: [{ name: "Owner" }] },
      }),
    }, cookie);
    expect(second.status).toBe(409);
  });
});

async function signUp(): Promise<string> {
  const email = `corpus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const response = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "Corpus Owner", email, password: "correct-horse-battery" }),
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
