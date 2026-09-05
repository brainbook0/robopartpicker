import { describe, expect, it } from "vitest";
import analyticsRoute from "../../worker/routes/analytics.ts?raw";
import migration from "../../migrations/0033_privacy_safe_interaction_analytics.sql?raw";
import appSource from "@/App.tsx?raw";
import dashboardSource from "@/pages/AdminAnalytics.tsx?raw";

describe("privacy-safe admin analytics contract", () => {
  it("stores only daily aggregate interaction dimensions", () => {
    expect(migration).toContain("CREATE TABLE analytics_daily_events");
    expect(migration).toContain("events INTEGER NOT NULL DEFAULT 0");
    expect(migration).not.toMatch(/user_id|email|ip_address|fingerprint|session_id/iu);
    expect(analyticsRoute).toContain("DO UPDATE SET events = events + 1");
    expect(analyticsRoute).toContain("private_route");
    expect(analyticsRoute).toContain("reason: \"bot\"");
  });

  it("strictly allowlists interaction names and excludes raw search text", () => {
    expect(analyticsRoute).toContain('event: z.enum(["project_preview_click"');
    expect(analyticsRoute).toContain('dimensionKey: z.enum(["filter", "sort", "mode", "result_bucket", "query_length_bucket"');
    expect(analyticsRoute).not.toContain("searchText");
    expect(analyticsRoute).not.toContain("queryText");
  });

  it("protects every admin analytics endpoint with the platform role middleware", () => {
    expect(analyticsRoute).toContain('analyticsRoutes.use("/admin/analytics/*", loadAuthSession, requireAuth, requirePlatformRole("moderator", "administrator"))');
    for (const endpoint of ["summary", "content", "discovery", "acquisition", "catalog-health", "operations", "export.csv"]) expect(analyticsRoute).toContain(`/admin/analytics/${endpoint}`);
  });

  it("exposes a no-index admin dashboard with explicit forbidden handling", () => {
    expect(appSource).toContain('<Route path="/admin/analytics" element={<AdminAnalytics />} />');
    expect(dashboardSource).toContain("Administrator access required");
    expect(dashboardSource).toContain("No IPs, cookies, fingerprints, user identities, raw search text or per-person history");
    expect(dashboardSource).toContain("noIndex");
  });
});
