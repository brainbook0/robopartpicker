import { describe, expect, it } from "vitest";
import {
  buildComponentIndex,
  canonicalKey,
  canonicalMakerKey,
  matchComponent,
  resolveLine,
  type ComponentCandidate,
  type ComponentIndex,
} from "./component-match";

function component(overrides: Partial<ComponentCandidate> & { id: string }): ComponentCandidate {
  return { name: overrides.id, ...overrides };
}

function indexOf(components: ComponentCandidate[]): ComponentIndex {
  return buildComponentIndex(components);
}

describe("component matching determinism and identity normalization", () => {
  it("normalizes MPN/SKU tokens to a canonical key without inventing equivalence", () => {
    expect(canonicalKey(" 80-C0603X104K5R3316 ")).toBe("80c0603x104k5r3316");
    expect(canonicalKey("LM358N")).toBe("lm358n");
    expect(canonicalKey("B4B-XH-A(LF)(SN)")).toBe("b4bxhalfsn");
    // Formatting-only collapses; distinct token sequences never merge.
    expect(canonicalKey("AB-CD")).toBe(canonicalKey("ABCD"));
    expect(canonicalKey("AB-CD")).not.toBe(canonicalKey("AB-C-D-E"));
  });

  it("normalizes manufacturer names by removing separators without abbreviating", () => {
    expect(canonicalMakerKey("ST Microelectronics")).toBe("stmicroelectronics");
    expect(canonicalMakerKey("stmicro")).not.toBe("stmicroelectronics");
  });

  it("matches an exact manufacturer + MPN", () => {
    const index = indexOf([component({ id: "c1", manufacturerName: "STMicroelectronics", manufacturerPartNumber: "STM32F103C8T6" })]);
    const decision = matchComponent({ manufacturer: "STMicroelectronics", mpn: "STM32F103C8T6" }, index);
    expect(decision).toMatchObject({ matched: true });
    if (decision.matched) {
      expect(decision.result.kind).toBe("manufacturer-mpn");
      expect(decision.result.confidenceClass).toBe("exact");
      expect(decision.result.confidence).toBe(1);
      expect(decision.result.aliasApplied).toBe(false);
      expect(decision.result.component.id).toBe("c1");
    }
  });

  it("flags a separator/case-normalized manufacturer+mpn alias as high confidence, not exact", () => {
    const index = indexOf([component({ id: "c1", manufacturerName: "ST Microelectronics", manufacturerPartNumber: "STM32F103-C8T6" })]);
    const decision = matchComponent({ manufacturer: "ST-Micro electronics", mpn: "stm32f103c8t6" }, index);
    expect(decision).toMatchObject({ matched: true });
    if (decision.matched) {
      expect(decision.result.kind).toBe("manufacturer-mpn");
      expect(decision.result.confidenceClass).toBe("high");
      expect(decision.result.confidence).toBe(0.98);
      expect(decision.result.aliasApplied).toBe(true);
    }
  });

  it("matches a unique bare MPN with high confidence only", () => {
    const index = indexOf([component({ id: "c1", manufacturerPartNumber: "MG996R" })]);
    const decision = matchComponent({ mpn: "mg996r" }, index);
    expect(decision).toMatchObject({ matched: true });
    if (decision.matched) {
      expect(decision.result.kind).toBe("mpn");
      expect(decision.result.confidenceClass).toBe("high");
      expect(decision.result.confidence).toBe(0.9);
    }
  });

  it("matches a unique supplier SKU", () => {
    const index = indexOf([component({ id: "c1", supplierSkus: ["647-UPM1J121MHD6TO"] })]);
    const decision = matchComponent({ sku: "647-UPM1J121MHD6TO" }, index);
    expect(decision).toMatchObject({ matched: true });
    if (decision.matched) {
      expect(decision.result.kind).toBe("sku");
      expect(decision.result.confidence).toBe(0.9);
    }
  });

  it("rejects a duplicate/ambiguous MPN", () => {
    const index = indexOf([
      component({ id: "c1", manufacturerPartNumber: "DUP" }),
      component({ id: "c2", manufacturerPartNumber: "DUP" }),
    ]);
    expect(matchComponent({ mpn: "DUP" }, index)).toMatchObject({ matched: false, reason: "ambiguous-mpn" });
  });

  it("never matches on the component name", () => {
    const index = indexOf([component({ id: "c1", name: "Raspberry Pi 4 Model B" })]);
    expect(matchComponent({ name: "Raspberry Pi 4 Model B" }, index)).toMatchObject({ matched: false, reason: "no-identity" });
  });

  it("does not cross manufacturers when a manufacturer is declared", () => {
    const index = indexOf([component({ id: "c1", manufacturerName: "Texas Instruments", manufacturerPartNumber: "LM358N" })]);
    const decision = matchComponent({ manufacturer: "STMicroelectronics", mpn: "LM358N" }, index);
    expect(decision).toMatchObject({ matched: false, reason: "no-catalog-match" });
  });

  it("keeps a line with a declared manufacturer but no catalog identity unresolved", () => {
    const index = indexOf([component({ id: "c1", manufacturerName: "Acme", manufacturerPartNumber: "X1" })]);
    expect(matchComponent({ manufacturer: "Acme", mpn: "X2" }, index)).toMatchObject({ matched: false, reason: "no-catalog-match" });
  });

  it("returns deterministic output for a fixed input", () => {
    const components = [
      component({ id: "a", manufacturerName: "Robotis", manufacturerPartNumber: "XM540-W270" }),
      component({ id: "b", manufacturerName: "Unitree", manufacturerPartNumber: "A1" }),
    ];
    const a = indexOf(components);
    const b = indexOf(components);
    expect(JSON.stringify(matchComponent({ manufacturer: "Robotis", mpn: "XM540-W270" }, a)))
      .toBe(JSON.stringify(matchComponent({ manufacturer: "Robotis", mpn: "XM540-W270" }, b)));
  });
});

describe("resolveLine completeness and confidence classes", () => {
  const index = indexOf([
    component({ id: "c1", manufacturerName: "Robotis", manufacturerPartNumber: "XM540-W270" }),
    component({ id: "c2", manufacturerPartNumber: "MG996R" }),
  ]);

  it("marks an exact manufacturer + MPN match complete with confidence 1", () => {
    const resolution = resolveLine({ manufacturer: "Robotis", mpn: "XM540-W270" }, index);
    expect(resolution).toMatchObject({
      resolved: true,
      componentId: "c1",
      completeness: "complete",
      confidence: 1,
      confidenceClass: "exact",
    });
  });

  it("marks an unmatched procurement line explicitly unresolved, never probable", () => {
    const resolution = resolveLine({ mpn: "NO-SUCH-MPN-999" }, index);
    expect(resolution).toMatchObject({
      resolved: false,
      componentId: null,
      completeness: "unresolved",
      confidence: 0.4,
      reason: "no-catalog-match",
    });
  });

  it("leaves a line with no identity unresolved without requiring a match", () => {
    const resolution = resolveLine({ name: "Generic bracket" }, index);
    expect(resolution).toMatchObject({
      resolved: false,
      componentId: null,
      completeness: "unresolved",
      reason: "no-identity",
    });
  });
});