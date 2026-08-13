import { describe, expect, it } from "vitest";
import {
  COMPLETENESS_BUCKETS,
  EXTRACTION_METHODS,
  buildBomLine,
  classifyCompleteness,
  resolveQuantity,
  withCompleteness,
} from "./bom";
import type { PortableComponent } from "./portable";

describe("BOM compiler completeness", () => {
  it("keeps every compiled line with all required provenance fields", () => {
    const rows = [
      { name: "NEMA 17 stepper motor", quantity: 4, manufacturer: "StepperOnline", mpn: "17HS19-2004S1" },
      { name: "Lead screw TR8x8", quantity: 2, manufacturer: "Generic", mpn: "TR8X8-500" },
      { name: "3D printed wrist link", quantity: 1, fabricated: true },
      { name: "Mystery bracket" },
      { name: "Some motor mentioned in README" },
    ];
    const lines = rows.map((row, index) => buildBomLine({ ...row, sourcePath: "bom/parts.csv", rowIndex: index }));

    expect(lines).toHaveLength(rows.length);
    for (const line of lines) {
      expect(typeof line.name).toBe("string");
      expect(line.quantity).toBeGreaterThan(0);
      expect(typeof line.evidenceLocator).toBe("string");
      expect(EXTRACTION_METHODS).toContain(line.extractionMethod);
      expect(COMPLETENESS_BUCKETS).toContain(line.completeness);
      expect(line.confidence).toBeGreaterThanOrEqual(0);
      expect(line.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("classifies a clean golden Project A near-completely", () => {
    const verified = buildBomLine({ name: "NEMA 17", quantity: 4, manufacturer: "StepperOnline", mpn: "17HS19-2004S1", sourcePath: "bom.csv", rowIndex: 0 });
    expect(verified.completeness).toBe("verified");
    expect(verified.confidence).toBeCloseTo(0.95);
    const fabricated = buildBomLine({ name: "wrist link", quantity: 1, fabricated: true, sourcePath: "robot.urdf" });
    expect(fabricated.completeness).toBe("custom-fabricated");
    expect(fabricated.extractionMethod).toBe("explicit-bom");
  });

  it("keeps a messy golden Project B partial with explicit uncertainty", () => {
    const missingQty = buildBomLine({ name: "Motor mentioned in README", sourcePath: "README.md", rowIndex: 0 });
    expect(missingQty.completeness).toBe("missing-qty");
    expect(missingQty.quantity).toBe(1);

    const unresolved = buildBomLine({ name: "Mystery bracket", quantity: 2, sourcePath: "bom.csv", rowIndex: 1 });
    expect(unresolved.completeness).toBe("unresolved");
    expect(unresolved.confidence).toBeCloseTo(0.4);

    const probable = buildBomLine({ name: "Servo", quantity: 1, manufacturer: "TowerPro", sourcePath: "bom.csv", rowIndex: 2 });
    expect(probable.completeness).toBe("probable");
  });

  it("resolves quantity without dropping invalid values", () => {
    expect(resolveQuantity(3)).toEqual({ quantity: 3, missing: false });
    expect(resolveQuantity(0).missing).toBe(true);
    expect(resolveQuantity(-2).missing).toBe(true);
    expect(resolveQuantity("4").missing).toBe(false);
    expect(resolveQuantity(undefined).missing).toBe(true);
    expect(resolveQuantity(NaN).missing).toBe(true);
  });

  it("maps extraction methods and fabrication to buckets deterministically", () => {
    expect(classifyCompleteness({ fabricated: true, missingQty: false }, "cad-metadata")).toBe("custom-fabricated");
    expect(classifyCompleteness({ fabricated: false, missingQty: false }, "dependencies")).toBe("non-procurement");
    expect(classifyCompleteness({ fabricated: false, missingQty: false, manufacturer: "M", mpn: "P" }, "explicit-bom")).toBe("verified");
    expect(classifyCompleteness({ fabricated: false, missingQty: false, manufacturer: "M" }, "explicit-bom")).toBe("probable");
    expect(classifyCompleteness({ fabricated: false, missingQty: false }, "explicit-bom")).toBe("unresolved");
  });

  it("fills completeness on parsed components idempotently", () => {
    const bare = {
      id: "component:x",
      name: "Servo",
      quantity: 1,
      unit: "each",
      fabricated: false,
      optional: false,
      artifactRefs: [],
      manufacturer: "TowerPro",
    } as unknown as PortableComponent;
    const enriched = withCompleteness(bare, "bom.csv");
    expect(enriched.completeness).toBe("probable");
    expect(enriched.extractionMethod).toBe("rpps-manifest");
    expect(enriched.evidenceLocator).toBe("bom.csv");
    const again = withCompleteness(enriched);
    expect(again.completeness).toBe(enriched.completeness);
  });
});
