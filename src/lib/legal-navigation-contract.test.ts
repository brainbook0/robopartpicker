import { describe, expect, it } from "vitest";
import appSource from "../App.tsx?raw";
import footerSource from "../components/layout/SiteFooter.tsx?raw";
import headerSource from "../components/layout/SiteHeader.tsx?raw";
import authSource from "../pages/Auth.tsx?raw";

const routes = ["legal", "privacy", "terms", "cookies", "acceptable-use", "marketplace-terms", "ai-notice", "intellectual-property", "accessibility", "contact"];

describe("legal route and navigation integration", () => {
  it("mounts all ten public legal and contact routes", () => {
    expect(appSource).toContain('import { LegalCenter } from "./pages/LegalCenter.tsx"');
    expect(appSource).toContain('import { LegalDocumentPage } from "./pages/LegalDocumentPage.tsx"');
    for (const route of routes) expect(appSource).toContain(`path="/${route}"`);
  });

  it("links every policy from the footer and publishes the support email", () => {
    for (const route of routes) expect(footerSource).toContain(`to="/${route}"`);
    expect(footerSource).toContain('import { SUPPORT_EMAIL } from "@/lib/legal-documents"');
    expect(footerSource).toContain("mailto:${SUPPORT_EMAIL}");
  });

  it("adds Legal and Contact to the More menu", () => {
    expect(headerSource).toContain('{ label: "Legal", to: "/legal" }');
    expect(headerSource).toContain('{ label: "Contact", to: "/contact" }');
  });

  it("links Privacy and Terms from account consent copy", () => {
    expect(authSource).toContain('to="/privacy"');
    expect(authSource).toContain('to="/terms"');
    expect(authSource).not.toContain("community guidelines. Be excellent to each other.");
  });
});
