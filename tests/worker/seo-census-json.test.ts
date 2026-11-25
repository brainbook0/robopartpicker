import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { serveStateOfOpenRobotics, serveStateOfOpenRoboticsJson } from "../../worker/services/seo";

// The /state-of-open-robotics page advertises that "the same data is available programmatically",
// yet /state-of-open-robotics.json — a path Googlebot already probes — answered 404, and the page
// never linked a machine-readable copy. These tests pin the JSON twin: it must be a 200
// schema.org Dataset whose project count equals the live database count, and the human page must
// link it, so the two surfaces cannot drift apart or silently disagree.

function ctx(path: string) {
  return {
    env,
    req: { url: `https://example.com${path}`, method: "GET" },
  } as unknown as Parameters<typeof serveStateOfOpenRoboticsJson>[0];
}

describe("serveStateOfOpenRoboticsJson (/state-of-open-robotics.json)", () => {
  it("serves a 200 JSON schema.org Dataset", async () => {
    const res = await serveStateOfOpenRoboticsJson(ctx("/state-of-open-robotics.json"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
    const body = (await res.json()) as Record<string, unknown> & {
      counts: { projects: { total: number }; bills_of_materials: Record<string, unknown> };
      robot_categories: unknown[];
      licenses: unknown[];
      citation: string;
    };
    expect(body["@type"]).toBe("Dataset");
    expect(typeof body.counts.projects.total).toBe("number");
    expect(Array.isArray(body.robot_categories)).toBe(true);
    expect(Array.isArray(body.licenses)).toBe(true);
    expect(body.citation).toContain("/state-of-open-robotics");
  });

  it("reports the same project count as the live database (no drift)", async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM projects WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public'`,
    ).first<{ n: number }>();
    const res = await serveStateOfOpenRoboticsJson(ctx("/state-of-open-robotics.json"));
    const body = (await res.json()) as { counts: { projects: { total: number } } };
    expect(body.counts.projects.total).toBe(row!.n);
  });

  it("links the JSON twin from the human census page", async () => {
    const res = await serveStateOfOpenRobotics(ctx("/state-of-open-robotics"));
    const html = await res.text();
    expect(html).toContain("/state-of-open-robotics.json");
  });
});
