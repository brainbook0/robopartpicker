import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const origin = "https://example.com";

describe("IU-PROJECT-GRAPH: clone, lineage and fork resolution", () => {
  it("clones a project with lineage and resolves both fork directions", async () => {
    const cookie = await signUp();
    const source = await createProject(cookie, `graph-source-${Date.now()}`, "Graph Source Bot");
    expect(source.status).toBe(201);
    const sourceItem = (await source.json()).item as { id: string; version: string; slug: string };

    const cloned = await call(`/api/v1/projects/${sourceItem.id}/clone`, {
      method: "POST",
      body: JSON.stringify({ name: "Graph Fork Bot", changeSummary: "Swapped motors" }),
    }, cookie);
    expect(cloned.status).toBe(201);
    const derivative = (await cloned.json()).item as {
      id: string; upstream_project_id: string | null; upstream_revision: string | null;
      clone_created_at: string | null; change_summary: string | null;
    };
    expect(derivative.upstream_project_id).toBe(sourceItem.id);
    expect(derivative.upstream_revision).toBe(sourceItem.version);
    expect(derivative.clone_created_at).toBeTruthy();
    expect(derivative.change_summary).toBe("Swapped motors");

    const downstream = await call(`/api/v1/projects/${sourceItem.id}/forks?direction=downstream`, {}, cookie);
    expect(downstream.status).toBe(200);
    const downstreamItems = (await downstream.json()).items as Array<{ id: string }>;
    expect(downstreamItems.some((item) => item.id === derivative.id)).toBe(true);

    const upstream = await call(`/api/v1/projects/${derivative.id}/forks?direction=upstream`, {}, cookie);
    expect(upstream.status).toBe(200);
    const upstreamItems = (await upstream.json()).items as Array<{ id: string }>;
    expect(upstreamItems.some((item) => item.id === sourceItem.id)).toBe(true);
  });
});

async function createProject(cookie: string, slug: string, name: string): Promise<Response> {
  return call("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      visibility: "public",
      rpps: { rpps_version: "1.0.0", name, slug, version: "0.1.0", license: "MIT", authors: [{ name: "Owner" }] },
    }),
  }, cookie);
}

async function signUp(): Promise<string> {
  const email = `graph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const response = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "Graph Owner", email, password: "correct-horse-battery" }),
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
