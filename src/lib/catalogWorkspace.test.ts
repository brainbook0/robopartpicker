import { describe, it, expect, beforeEach } from "vitest";
import {
  readCompare, toggleCompare, clearCompare, COMPARE_CAP,
  writeCompare, parseCompareState,
  validateRfqInput, normalizeRfqInput, parseRfqDraft,
  saveRfqDraft, rfqDrafts, deleteRfqDraft,
  upsertPriceAlert, priceAlertForPart, parsePriceAlertDraft,
  __testing,
} from "./catalogWorkspace";

beforeEach(() => {
  window.localStorage.clear();
});

describe("safe parsing of malformed storage", () => {
  it("compare: falls back to empty when JSON is corrupt", () => {
    window.localStorage.setItem(__testing.COMPARE_KEY, "not-json{");
    expect(readCompare()).toEqual({ category: null, ids: [] });
  });
  it("compare: parseCompareState ignores non-string ids and dedupes", () => {
    const s = parseCompareState({ category: "actuator", ids: ["a", "a", 3, null, "b", ""] });
    expect(s.ids).toEqual(["a", "b"]);
    expect(s.category).toBe("actuator");
  });
  it("compare: category dropped when ids empty", () => {
    expect(parseCompareState({ category: "hand", ids: [] })).toEqual({ category: null, ids: [] });
  });
  it("price alert: rejects records missing id / partId", () => {
    expect(parsePriceAlertDraft({ partId: "p" })).toBeNull();
    expect(parsePriceAlertDraft({ id: "x", partId: "p", targetPrice: "abc" })?.targetPrice).toBeNull();
  });
  it("rfq: rejects unusable stored records", () => {
    expect(parseRfqDraft(null)).toBeNull();
    expect(parseRfqDraft({ id: "r1", quantity: 0 })).toBeNull();
    expect(parseRfqDraft({ id: "r1", quantity: 2, manualPartName: "X" })?.manualPartName).toBe("X");
  });
});

describe("compare toggle", () => {
  it("caps at COMPARE_CAP and reports limit-reached", () => {
    for (let i = 0; i < COMPARE_CAP; i++) toggleCompare(`p-${i}`, "actuator");
    const r = toggleCompare("p-extra", "actuator");
    expect(r.kind).toBe("limit-reached");
    expect(r.atCap).toBe(true);
    expect(readCompare().ids).toHaveLength(COMPARE_CAP);
  });
  it("removes a previously-added part", () => {
    toggleCompare("p-1", "actuator");
    toggleCompare("p-2", "actuator");
    const r = toggleCompare("p-1", "actuator");
    expect(r.kind).toBe("removed");
    expect(readCompare().ids).toEqual(["p-2"]);
  });
  it("reports mismatch without mutating when allowReplace is not set", () => {
    toggleCompare("p-1", "actuator");
    const r = toggleCompare("h-1", "hand");
    expect(r.kind).toBe("category-mismatch");
    expect(readCompare()).toEqual({ category: "actuator", ids: ["p-1"] });
  });
  it("replaces the set only when allowReplace is explicitly requested", () => {
    toggleCompare("p-1", "actuator");
    const r = toggleCompare("h-1", "hand", { allowReplace: true });
    expect(r.kind).toBe("replaced-category");
    expect(readCompare()).toEqual({ category: "hand", ids: ["h-1"] });
  });
  it("rejects an empty/invalid part id", () => {
    expect(toggleCompare("", "actuator").kind).toBe("invalid-part");
  });
  it("dedupes duplicate ids via writeCompare", () => {
    const next = writeCompare({ category: "actuator", ids: ["a", "a", "b", "b", "c"] });
    expect(next.ids).toEqual(["a", "b", "c"]);
  });
  it("clear resets everything", () => {
    toggleCompare("p-1", "actuator");
    clearCompare();
    expect(readCompare()).toEqual({ category: null, ids: [] });
  });
});

describe("RFQ normalization / validation", () => {
  it("requires quantity >= 1 and either partId or manualPartName", () => {
    const r = validateRfqInput({ manualPartName: null, quantity: 0, requirements: "" });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.errors.some(e => /quantity/i.test(e))).toBe(true);
      expect(r.errors.some(e => /part/i.test(e))).toBe(true);
    }
  });
  it("rejects negative target lead", () => {
    const r = validateRfqInput({ manualPartName: "X", quantity: 1, targetLeadDays: -3, requirements: "" });
    expect(r.ok).toBe(false);
  });
  it("rejects non-finite quantity", () => {
    const r = validateRfqInput({ manualPartName: "X", quantity: Number.NaN, requirements: "" });
    expect(r.ok).toBe(false);
  });
  it("trims strings, floors quantity, normalizes optional numeric", () => {
    const r = validateRfqInput({ manualPartName: "  RMD-X8  ", quantity: 3.7, targetLeadDays: 14, requirements: "  test  ", supplierId: null, partId: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.manualPartName).toBe("RMD-X8");
      expect(r.value.quantity).toBe(3);
      expect(r.value.targetLeadDays).toBe(14);
      expect(r.value.requirements).toBe("test");
    }
  });
  it("normalizeRfqInput turns empty/whitespace optional strings into null", () => {
    const n = normalizeRfqInput({ manualPartName: "   ", supplierId: "  ", partId: "", quantity: 1, requirements: "" });
    expect(n.manualPartName).toBeNull();
    expect(n.supplierId).toBeNull();
    expect(n.partId).toBeNull();
  });
  it("normalizeRfqInput accepts blank target lead as null", () => {
    const n = normalizeRfqInput({ manualPartName: "X", quantity: 1, targetLeadDays: "" as unknown as number, requirements: "" });
    expect(n.targetLeadDays).toBeNull();
  });
  it("persists and deletes a draft", () => {
    const v = validateRfqInput({ manualPartName: null, partId: "a-1", supplierId: "s-1", quantity: 2, targetLeadDays: 10, requirements: "" });
    if (!v.ok) throw new Error("expected ok");
    const saved = saveRfqDraft(v.value);
    expect(rfqDrafts()).toHaveLength(1);
    deleteRfqDraft(saved.id);
    expect(rfqDrafts()).toHaveLength(0);
  });
});

describe("price alert draft", () => {
  it("upserts a single draft per part", () => {
    upsertPriceAlert("p-1", 500);
    upsertPriceAlert("p-1", 400);
    expect(priceAlertForPart("p-1")?.targetPrice).toBe(400);
  });
  it("coerces non-positive target to null", () => {
    expect(upsertPriceAlert("p-1", 0).targetPrice).toBeNull();
  });
});