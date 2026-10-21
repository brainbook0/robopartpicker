import { describe, expect, it } from "vitest";
import { isKnownAppRoute } from "../../worker/services/app-routes";
import { notFoundDocument } from "../../worker/services/seo";

const origin = "https://example.com";

// These tests exercise routing only: the Worker test environment has no built
// assets, so a fetch through the SPA fallback returns 404 either way. What is
// asserted here is that the *fallback body* (noindex + Page not found) is
// produced for URLs the app does not own, and that the route matcher never
// claims a URL the React router would render.

describe("soft-404 fallback", () => {
  it("builds a noindex not-found document with real internal links", () => {
    const doc = notFoundDocument(origin);
    expect(doc.robots).toBe("noindex,follow");
    expect(doc.canonicalUrl).toBe(`${origin}/`);
    expect(doc.bodyHtml).toContain("Page not found");
    for (const href of ["/projects", "/boms", "/marketplace", "/queries", `${origin}/`]) {
      expect(doc.bodyHtml, href).toContain(href);
    }
  });

  it("keeps serving genuine app routes through the SPA fallback", () => {
    for (const path of ["/auth", "/search", "/builder", "/notifications", "/suppliers", "/marketplace/wanted/new"]) {
      expect(isKnownAppRoute(path), path).toBe(true);
    }
  });

  it("matches every route shape declared in src/App.tsx", () => {
    const appRoutes = [
      "/parts/actuator", "/parts/actuator/sg90", "/parts/compare", "/projects", "/projects/new",
      "/projects/some-robot", "/projects/some-robot/bom", "/boms", "/boms/abc", "/boms/abc/items/def",
      "/community", "/community/new", "/community/c/general", "/community/t/42",
      "/marketplace", "/marketplace/new", "/marketplace/wanted/new", "/marketplace/listing-1",
      "/organizations", "/organizations/org1", "/assistant", "/assistant/thread-1", "/finder/compute",
      "/quotes/q1", "/completed-quotes/q1", "/robots", "/robots/some-robot", "/suppliers", "/suppliers/acme",
      "/admin/analytics", "/admin/project-claims", "/oauth/consent", "/legal", "/privacy", "/terms",
      "/teardowns", "/rpps", "/developers", "/partners", "/about", "/contact", "/notifications", "/auth",
    ];
    for (const path of appRoutes) expect(isKnownAppRoute(path), path).toBe(true);
  });

  it("rejects paths the app does not own", () => {
    expect(isKnownAppRoute("/wp-admin/install.php")).toBe(false);
    expect(isKnownAppRoute("/google-service-account.json")).toBe(false);
    expect(isKnownAppRoute("/parts/actuator/sg90/extra")).toBe(false);
    expect(isKnownAppRoute("/nope")).toBe(false);
    expect(isKnownAppRoute("/api/v1/secret")).toBe(false);
  });

  it("normalises trailing slashes and query strings", () => {
    expect(isKnownAppRoute("/projects/")).toBe(true);
    expect(isKnownAppRoute("/projects?q=servo")).toBe(true);
    expect(isKnownAppRoute("/")).toBe(true);
  });
});
