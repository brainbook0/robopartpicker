import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { isKnownAppRoute } from "../../worker/services/app-routes";
import { notFoundDocument, resolveSeoDocument } from "../../worker/services/seo";

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

  it("marks the not-found document as a 404 so a dead record is not a 200", () => {
    expect(notFoundDocument(origin).httpStatus).toBe(404);
  });

  it("404s a known route shape whose record does not exist", async () => {
    // /projects/:slug is a route the app owns, but this slug is not in the catalog.
    // Before the fix resolveSeoDocument returned "Page not found" with no status, so
    // serveSeoAsset answered 200 and crawlers kept the URL as a valid thin page.
    const doc = await resolveSeoDocument(env.DB, "/projects/definitely-not-a-real-project-xyz", origin);
    expect(doc.httpStatus).toBe(404);
    expect(doc.robots).toBe("noindex,follow");
  });

  it("does not mark a real route's document as 404", async () => {
    // /about is served from staticSeo(); /queries has its own router entry and never
    // reaches resolveSeoDocument, so it is the wrong control for this assertion.
    const doc = await resolveSeoDocument(env.DB, "/about", origin);
    expect(doc.httpStatus).toBeUndefined();
    expect(doc.title).not.toContain("Page not found");
  });

  it("normalises trailing slashes and query strings", () => {
    expect(isKnownAppRoute("/projects/")).toBe(true);
    expect(isKnownAppRoute("/projects?q=servo")).toBe(true);
    expect(isKnownAppRoute("/")).toBe(true);
  });
});
