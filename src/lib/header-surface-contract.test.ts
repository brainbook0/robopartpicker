import { describe, expect, it } from "vitest";
import siteHeaderSource from "../components/layout/SiteHeader.tsx?raw";

describe("SiteHeader primary-surface contract", () => {
  it("keeps the compact header through tablet widths", () => {
    expect(siteHeaderSource).toContain('className="hidden lg:flex flex-1 max-w-[380px]');
    expect(siteHeaderSource).toContain('<nav className="hidden lg:flex items-center gap-0.5">');
    expect(siteHeaderSource).toContain('className="rounded border border-border p-1.5 hover:bg-muted lg:hidden"');
    expect(siteHeaderSource).toContain('className="border-t border-border bg-background p-3 lg:hidden"');
  });

  it("does not render secondary category or catalog KPI rails", () => {
    expect(siteHeaderSource).not.toContain("Secondary nav");
    expect(siteHeaderSource).not.toContain("Tertiary KPI ticker");
    expect(siteHeaderSource).not.toContain('className="stat-tile"');
    expect(siteHeaderSource).not.toContain("page exact IDs");
    expect(siteHeaderSource).not.toContain("page spec profiles");
    expect(siteHeaderSource).not.toContain(">Categories</span>");
  });

  it("does not fetch the component catalog only to populate global header chrome", () => {
    expect(siteHeaderSource).not.toContain('import { useComponents } from "@/lib/api/catalog";');
    expect(siteHeaderSource).not.toContain("useComponents({ limit: 100 })");
  });

  it("retains primary and mobile navigation", () => {
    expect(siteHeaderSource).toContain('aria-label="Toggle navigation"');
    expect(siteHeaderSource).toContain('placeholder="Search projects, components, BOMs…"');
    expect(siteHeaderSource).toContain('{navItems.map(n => (');
  });
});
