import { describe, expect, it } from "vitest";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";
import bomDetailSource from "../pages/BomDetail.tsx?raw";

describe("Get a quote integration", () => {
  it("adds contact-and-shipping quote intake to project pages", () => {
    expect(projectDetailSource).toContain("<GetQuoteForm projectId={p.id}");
    expect(projectDetailSource).not.toContain("Generate a completed itemized quote");
  });

  it("replaces recipient-only completed quote generation on BOM pages", () => {
    expect(bomDetailSource).toContain("<GetQuoteForm bomId={bom.id}");
    expect(bomDetailSource).not.toContain("Generate completed quote");
    expect(bomDetailSource).not.toContain('aria-label="Quote recipients"');
  });
});
