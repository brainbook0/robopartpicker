import { describe, expect, it } from "vitest";
import type { Part } from "@/shared/catalog";
import { CATEGORY_REQUIRED_FIELDS, fieldFloorOk, fieldFloorReport, isSyntheticPart, missingRequiredFields } from "./catalogWorkspace";

const base = {
  id: "p1",
  slug: "p1",
  category: "actuator",
  name: "Motor",
  maker: "Maker",
  makerCountry: "US",
  region: "US",
  blurb: "",
  tags: [],
  openSource: false,
  cadAvailable: false,
  rosSupport: "none",
  warrantyMonths: 0,
  priceHistory: [],
  offers: [],
  failures: 0,
  compatibility: [],
  provenanceLabel: "manufacturer",
  freshnessAt: null,
  isDemo: false,
} as const;

describe("catalog field floors", () => {
  it("reports a complete part with no missing required fields", () => {
    const part = { ...base, category: "actuator", peakNm: 2, contNm: 1.5, speedRpm: 120, voltageV: 24 } as unknown as Part;
    expect(missingRequiredFields(part)).toEqual([]);
    expect(fieldFloorOk(part)).toBe(true);
    expect(fieldFloorReport(part).complete).toBe(true);
  });

  it("surfaces missing required fields by category", () => {
    const part = { ...base, category: "actuator", peakNm: 2 } as unknown as Part;
    expect(missingRequiredFields(part)).toEqual(["contNm", "speedRpm", "voltageV"]);
    expect(fieldFloorOk(part)).toBe(false);

    const sensor = { ...base, category: "sensor", type: "lidar" } as unknown as Part;
    expect(missingRequiredFields(sensor)).toEqual(["rangeM"]);
  });

  it("covers every category with an explicit floor", () => {
    for (const category of ["actuator", "hand", "sensor", "compute", "driver", "reducer"] as const) {
      expect(CATEGORY_REQUIRED_FIELDS[category].length).toBeGreaterThan(0);
    }
  });

  it("never flags a finite zero as missing", () => {
    const part = { ...base, category: "actuator", peakNm: 0, contNm: 0, speedRpm: 0, voltageV: 0 } as unknown as Part;
    expect(missingRequiredFields(part)).toEqual([]);
    expect(fieldFloorOk(part)).toBe(true);
  });

  it("classifies synthetic/demo data so it is not presented as live", () => {
    expect(isSyntheticPart({ isDemo: true, provenanceLabel: "manufacturer" } as unknown as Part)).toBe(true);
    expect(isSyntheticPart({ isDemo: false, provenanceLabel: "demo" } as unknown as Part)).toBe(true);
    expect(isSyntheticPart({ isDemo: false, provenanceLabel: "inferred" } as unknown as Part)).toBe(true);
    expect(isSyntheticPart({ isDemo: false, provenanceLabel: "manufacturer" } as unknown as Part)).toBe(false);
  });
});
