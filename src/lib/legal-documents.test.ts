import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS, SUPPORT_EMAIL } from "./legal-documents";

const expectedIds = [
  "legal",
  "privacy",
  "terms",
  "cookies",
  "acceptable-use",
  "marketplace-terms",
  "ai-notice",
  "intellectual-property",
  "accessibility",
  "contact",
] as const;

const corpus = () => JSON.stringify(LEGAL_DOCUMENTS);

describe("RoboPartPicker legal document registry", () => {
  it("publishes the complete approved route set with stable dated documents", () => {
    expect(LEGAL_DOCUMENT_IDS).toEqual(expectedIds);
    expect(Object.keys(LEGAL_DOCUMENTS)).toEqual(expectedIds);
    expect(new Set(Object.values(LEGAL_DOCUMENTS).map((document) => document.path)).size).toBe(expectedIds.length);
    for (const document of Object.values(LEGAL_DOCUMENTS)) {
      expect(document.path).toBe(`/${document.id}`);
      expect(document.title.length).toBeGreaterThan(4);
      expect(document.description.length).toBeGreaterThan(40);
      expect(document.effectiveDate).toBe("August 30, 2026");
      expect(document.updatedDate).toBe("August 30, 2026");
      expect(document.sections.length).toBeGreaterThanOrEqual(3);
      expect(new Set(document.sections.map((section) => section.id)).size).toBe(document.sections.length);
    }
  });

  it("uses only the approved brand support identity", () => {
    expect(SUPPORT_EMAIL).toBe("support@robopartpicker.com");
    expect(corpus()).toContain(SUPPORT_EMAIL);
    expect(corpus()).not.toMatch(/luca|romeo|gmail|home address|TBD|TODO|placeholder/iu);
  });

  it("describes the deployed privacy and infrastructure boundaries", () => {
    const privacy = JSON.stringify(LEGAL_DOCUMENTS.privacy);
    expect(privacy).toContain("Cloudflare D1");
    expect(privacy).toContain("Cloudflare R2");
    expect(privacy).toContain("Google OAuth");
    expect(privacy).toContain("essential authentication cookies");
    expect(privacy).toContain("aggregate");
    expect(privacy).toContain("raw IP addresses");
    expect(privacy).toContain("AI provider");
  });

  it("states the actual marketplace, quote, AI, robotics, and licensing limits", () => {
    const text = corpus();
    for (const phrase of [
      "does not process marketplace payments",
      "not a transaction party",
      "nonbinding price snapshot",
      "AI output can be inaccurate",
      "not engineering advice",
      "safe construction and operation",
      "upstream licenses",
      "no registered DMCA agent",
      "WCAG 2.1 AA target",
    ]) expect(text).toContain(phrase);
  });

  it("does not invent legal status or unsupported compliance claims", () => {
    expect(corpus()).not.toMatch(/fully compliant|guaranteed compliant|registered corporation|binding certification|we encrypt all|binding arbitration|street address/iu);
    expect(corpus()).toContain("No governing jurisdiction, registered entity, arbitration forum, or business address is represented");
    expect(corpus()).not.toMatch(/[—–]/u);
  });
});
