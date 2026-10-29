import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { staticSeo } from "../../worker/services/seo";

const origin = "https://example.com";
const repoUrl = "https://github.com/brainbook0/robopartpicker";

// Agent-side discovery surfaces. These are the documents MCP directories and A2A agent
// crawlers fetch before they will list or route to the server, so a regression here is
// invisible in the UI but costs every machine-readable listing.
describe("agent discovery documents", () => {
  it("serves an A2A agent card at both well-known paths", async () => {
    for (const path of ["/.well-known/agent-card.json", "/.well-known/agent.json"]) {
      const res = await exports.default.fetch(new Request(`${origin}${path}`));
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const card = (await res.json()) as Record<string, unknown>;
      expect(card.protocolVersion).toBe("0.3.0");
      expect(card.url).toBe(`${origin}/mcp`);
      expect(card.provider).toMatchObject({ organization: "RoboPartPicker" });
      const skills = card.skills as Array<{ id: string }>;
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.map((s) => s.id)).toEqual([
        "search_projects",
        "get_project",
        "search_components",
        "compare_components",
        "validate_rpps",
      ]);
    }
  });

  it("answers HEAD on the agent card without a body", async () => {
    const res = await exports.default.fetch(
      new Request(`${origin}/.well-known/agent-card.json`, { method: "HEAD" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("points the MCP server card at a real source repository, not the docs page", async () => {
    const res = await exports.default.fetch(
      new Request(`${origin}/.well-known/mcp/server-card.json`),
    );
    expect(res.status).toBe(200);
    const card = (await res.json()) as Record<string, unknown>;
    expect(card.repository).toBe(repoUrl);
    expect(card.sourceUrl).toBe(repoUrl);
    expect(card.documentation).toBe(`${origin}/developers`);
  });

  it("gives /developers a documentation body instead of a one-line stub", () => {
    const doc = staticSeo("/developers", origin, `${origin}/logo.png`);
    const body = doc.bodyHtml ?? "";
    const words = body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThan(250);
    expect(body).toContain(`${origin}/mcp`);
    expect(body).toContain(repoUrl);
    // Honesty constraint: the docs must keep stating that prices are observations, not quotes.
    expect(body.toLowerCase()).toContain("not quotes");
    expect(body.toLowerCase()).toContain("untrusted data");
  });
});
