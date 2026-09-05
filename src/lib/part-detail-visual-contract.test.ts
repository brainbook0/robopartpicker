import { describe, expect, it } from "vitest";
import partDetailSource from "../pages/PartDetail.tsx?raw";

describe("part detail visual and 3D integration", () => {
  it("uses PartVisual as the primary part image with a category fallback", () => {
    expect(partDetailSource).toContain('import { PartVisual } from "@/components/parts/PartVisual";');
    expect(partDetailSource).toContain('<PartVisual part={part} className="h-44 w-full" />');
  });

  it("renders only the exact component artifact selected by partPreview", () => {
    expect(partDetailSource).toContain("const partPreview = selectPartPreview(files);");
    expect(partDetailSource).toContain('partPreview.kind === "step"');
    expect(partDetailSource).toContain('partPreview.kind === "stl"');
    expect(partDetailSource).toContain('partPreview.kind === "obj"');
    expect(partDetailSource).toContain("exact component geometry");
  });

  it("uses the dedicated ranked alternatives endpoint instead of slicing a catalog page", () => {
    expect(partDetailSource).toContain('import { PartAlternatives } from "@/components/parts/PartAlternatives";');
    expect(partDetailSource).toContain("useComponentAlternatives(part?.id, 5)");
    expect(partDetailSource).toContain("<PartAlternatives");
    expect(partDetailSource).not.toContain("useComponents(");
    expect(partDetailSource).not.toContain("Same-category candidates");
  });

  it("renders the honest identity visual inside an otherwise empty Images panel", () => {
    expect(partDetailSource).toContain('title="Images and source links"');
    expect(partDetailSource).toContain('<PartVisual part={part} className="h-40 w-full" />');
    expect(partDetailSource).toContain("Identity illustration, not a product photograph");
  });
});
