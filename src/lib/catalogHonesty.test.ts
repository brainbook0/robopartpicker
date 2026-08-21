import { describe, expect, it } from "vitest";
import { hasLiveData, isLiveRecord, liveRecords } from "./catalogHonesty";

describe("catalogHonesty", () => {
  it("treats only isDemo === false as real", () => {
    expect(isLiveRecord({ isDemo: false })).toBe(true);
    expect(isLiveRecord({ isDemo: true })).toBe(false);
    expect(isLiveRecord(undefined)).toBe(false);
    expect(isLiveRecord(null)).toBe(false);
  });

  it("keeps only real records and drops demo fixtures", () => {
    const records = [
      { id: "a", isDemo: false },
      { id: "b", isDemo: true },
      { id: "c", isDemo: false },
      { id: "d", isDemo: true },
    ];
    expect(liveRecords(records).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("tolerates undefined and null input", () => {
    expect(liveRecords<{ isDemo: boolean }>(undefined)).toEqual([]);
    expect(liveRecords<{ isDemo: boolean }>(null)).toEqual([]);
    expect(hasLiveData(undefined)).toBe(false);
  });

  it("reports whether any real record exists", () => {
    expect(hasLiveData([{ isDemo: true }, { isDemo: false }])).toBe(true);
    expect(hasLiveData([{ isDemo: true }])).toBe(false);
    expect(hasLiveData([])).toBe(false);
  });
});