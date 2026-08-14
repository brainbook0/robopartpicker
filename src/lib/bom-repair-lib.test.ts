import { describe, expect, it } from "vitest";
import {
  buildComponentMatcher,
  isFalsePartitionTableBom,
  normalizeName,
  normalizeToken,
  pairSnapshotItemsWithNormalizedLines,
  repairBomItems,
} from "../../scripts/bom-repair-lib";

describe("bom repair pure functions", () => {
  it("normalizes MPN tokens conservatively", () => {
    expect(normalizeToken(" 80-C0603X104K5R3316 ")).toBe("80c0603x104k5r3316");
    expect(normalizeToken("ABC-123/Rev A")).toBe("abc123reva");
  });

  it("normalizes exact names without inventing fuzzy equivalence", () => {
    expect(normalizeName("Servo & Bracket,  25T")).toBe("servo and bracket 25t");
    expect(normalizeName("Servo Bracket 25T")).not.toBe(normalizeName("Servo & Bracket, 25T"));
  });

  it("flags partition-table entries by quality predicate", () => {
    expect(isFalsePartitionTableBom([
      { name: "nvs", qty: 1 },
      { name: "phy_init", qty: 1 },
      { name: "factory", qty: 1 },
      { name: "storage", qty: 1 },
    ])).toBe(true);
    expect(isFalsePartitionTableBom([
      { name: "# Note: if you have increased the bootloader size", qty: 1 },
      { name: "nvs", qty: 1 },
      { name: "phy_init", qty: 1 },
      { name: "factory", qty: 1 },
      { name: "www", qty: 1 },
    ])).toBe(true);
  });

  it("does not flag real BOMs or MPN-bearing lines as partition tables", () => {
    expect(isFalsePartitionTableBom([
      { name: "nvs", mpn: "ACTUAL-NVS-PART", qty: 1 },
      { name: "factory", qty: 1 },
      { name: "storage", qty: 1 },
    ])).toBe(false);
    expect(isFalsePartitionTableBom([
      { name: "Raspberry Pi 4", qty: 1 },
      { name: "M3 screw", qty: 12 },
      { name: "MG996R Servo", qty: 2 },
    ])).toBe(false);
  });

  it("matches unique exact normalized MPN first", () => {
    const match = buildComponentMatcher([
      { id: "c1", name: "Capacitor", manufacturer_part_number: "ABC-123", offer_count: 1 },
    ], { allowNameMatch: true });
    expect(match({ name: "Capacitor", mpn: "abc 123" })).toEqual({
      kind: "mpn",
      component: { id: "c1", name: "Capacitor", manufacturer_part_number: "ABC-123", offer_count: 1 },
    });
  });

  it("rejects duplicate MPNs and duplicate name matches", () => {
    const match = buildComponentMatcher([
      { id: "c1", name: "Same Name", manufacturer_part_number: "DUP" },
      { id: "c2", name: "Same Name", manufacturer_part_number: "DUP" },
    ], { allowNameMatch: true });
    expect(match({ name: "anything", mpn: "dup" })).toBeNull();
    expect(match({ name: "same name" })).toBeNull();
  });

  it("pairs snapshot items to normalized lines by exact name and occurrence", () => {
    const pairs = pairSnapshotItemsWithNormalizedLines(
      [{ name: "M3 screw" }, { name: "Servo" }, { name: "M3 screw" }, { name: "Not materialized" }],
      [
        { id: "line-2", description: "M3 screw", sort_order: 2 },
        { id: "line-1", description: "Servo", sort_order: 1 },
        { id: "line-0", description: "M3 screw", sort_order: 0 },
      ],
    );
    expect(pairs.map(({ line }) => line.id)).toEqual(["line-0", "line-1", "line-2"]);
  });

  it("sets component_id and completeness only for high-confidence unique matches", () => {
    const match = buildComponentMatcher([
      { id: "c1", name: "Exact Name", manufacturer_part_number: null, offer_count: 1 },
    ], { allowNameMatch: true });
    const repaired = repairBomItems([{ name: "Exact Name", qty: 2 }, { name: "Unknown", qty: 1 }], match);
    expect(repaired).toMatchObject({ mpnMatches: 0, nameMatches: 1, pricedLines: 1 });
    expect(repaired.items[0]).toMatchObject({ component_id: "c1", completeness: "complete" });
    expect(repaired.items[1]).toEqual({ name: "Unknown", qty: 1 });
  });
});
