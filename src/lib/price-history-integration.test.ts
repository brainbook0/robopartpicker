import { describe, expect, it } from "vitest";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";
import partDetailSource from "../pages/PartDetail.tsx?raw";

describe("price history detail-page integration", () => {
  it("adds aggregate project price history", () => {
    expect(projectDetailSource).toContain('<PriceHistoryPlaceholder entityName={p.name} kind="project" />');
  });

  it("adds component price history", () => {
    expect(partDetailSource).toContain('<PriceHistoryPlaceholder entityName={part.name} kind="part" />');
  });
});
