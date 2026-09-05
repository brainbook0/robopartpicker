import { describe, expect, it } from "vitest";
import {
  buildCommercialTrendSnapshot,
  percentileScores,
  validateCommercialTrendInputs,
  type CommercialTrendCandidate,
  type CommercialTrendSourceRecord,
  type CommercialTrendSnapshotOptions,
} from "./commercial-trend-score";

const candidates: CommercialTrendCandidate[] = [
  { slug: "alpha-robot", name: "Alpha Robot", aliases: ["Alpha"] },
  { slug: "beta-robot", name: "Beta Robot", aliases: ["Beta"] },
  { slug: "gamma-robot", name: "Gamma Robot", aliases: ["Gamma"] },
];

const options: CommercialTrendSnapshotOptions = {
  methodologyVersion: "trend-v1",
  windowStart: "2025-08-25T00:00:00.000Z",
  windowEnd: "2026-08-25T00:00:00.000Z",
  capturedAt: "2026-08-25T01:00:00.000Z",
  firstPartyTrafficSampleSufficient: false,
  limit: 3,
};

function record(
  candidateKey: string,
  signal: CommercialTrendSourceRecord["signal"],
  value: number | null,
  status: CommercialTrendSourceRecord["status"] = "ok",
): CommercialTrendSourceRecord {
  return {
    candidateKey,
    signal,
    value,
    status,
    collectedAt: "2026-08-25T00:30:00.000Z",
    sourceUrl: `https://evidence.example/${encodeURIComponent(candidateKey)}/${signal}`,
  };
}

function completeRecords(): CommercialTrendSourceRecord[] {
  return candidates.flatMap((candidate, index) => [
    record(candidate.slug, "searchInterest", 10 + index * 10),
    record(candidate.slug, "newsVelocity", 100 + index * 100),
    record(candidate.slug, "videoViewVelocity", 1000 + index * 1000),
    record(candidate.slug, "officialActivity", 1 + index),
  ]);
}

describe("percentileScores", () => {
  it("normalizes ascending values to 0, 50, and 100", () => {
    expect(percentileScores(new Map([["a", 10], ["b", 20], ["c", 30]]))).toEqual(new Map([["a", 0], ["b", 50], ["c", 100]]));
  });

  it("uses average ranks for ties", () => {
    const scores = percentileScores(new Map([["a", 10], ["b", 10], ["c", 30]]));
    expect(scores.get("a")).toBe(25);
    expect(scores.get("b")).toBe(25);
    expect(scores.get("c")).toBe(100);
  });
});

describe("validateCommercialTrendInputs", () => {
  it("returns errors instead of throwing for malformed JSON-shaped inputs", () => {
    const malformedCandidates = [null, { slug: 7, name: null, aliases: "bad" }] as unknown as CommercialTrendCandidate[];
    const malformedRecords = [null, { candidateKey: 9 }] as unknown as CommercialTrendSourceRecord[];
    expect(() => validateCommercialTrendInputs(malformedCandidates, malformedRecords, options)).not.toThrow();
    expect(validateCommercialTrendInputs(malformedCandidates, malformedRecords, options).length).toBeGreaterThan(0);
  });

  it("rejects duplicate candidate slugs and duplicate aliases within one candidate", () => {
    const duplicateCandidates = [
      { slug: "alpha-robot", name: "Alpha", aliases: ["Shared", " shared "] },
      { slug: "alpha-robot", name: "Alpha duplicate", aliases: [] },
    ];
    const errors = validateCommercialTrendInputs(duplicateCandidates, [], options);
    expect(errors.some((error) => error.includes("duplicate candidate slug"))).toBe(true);
    expect(errors.some((error) => error.includes("duplicate alias"))).toBe(true);
  });

  it("rejects unknown aliases, duplicate signal rows, malformed timestamps, and non-finite values", () => {
    const rows = completeRecords();
    rows.push(record("unknown", "searchInterest", 1));
    rows.push(record("alpha-robot", "searchInterest", 2));
    rows.push({ ...record("beta-robot", "newsVelocity", Number.NaN), collectedAt: "yesterday" });
    const errors = validateCommercialTrendInputs(candidates, rows, options);
    expect(errors.some((error) => error.includes("unknown candidate"))).toBe(true);
    expect(errors.some((error) => error.includes("duplicate"))).toBe(true);
    expect(errors.some((error) => error.includes("collectedAt"))).toBe(true);
    expect(errors.some((error) => error.includes("finite"))).toBe(true);
  });

  it("requires method version and an ordered RFC3339 window", () => {
    const errors = validateCommercialTrendInputs(candidates, completeRecords(), {
      ...options,
      methodologyVersion: " ",
      windowStart: "2026-08-25T00:00:00.000Z",
      windowEnd: "2025-08-25T00:00:00.000Z",
    });
    expect(errors.some((error) => error.includes("methodologyVersion"))).toBe(true);
    expect(errors.some((error) => error.includes("window"))).toBe(true);
  });

  it("requires capture time at or after the window and rejects future collection timestamps", () => {
    const earlyCapture = validateCommercialTrendInputs(candidates, completeRecords(), {
      ...options,
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(earlyCapture.some((error) => error.includes("capturedAt"))).toBe(true);

    const futureRows = completeRecords().map((item, index) => index === 0 ? { ...item, collectedAt: "2026-08-25T02:00:00.000Z" } : item);
    expect(validateCommercialTrendInputs(candidates, futureRows, options).some((error) => error.includes("after capturedAt"))).toBe(true);
  });
});

describe("buildCommercialTrendSnapshot", () => {
  it("resolves source records through candidate aliases", () => {
    const rows = completeRecords().map((row) => ({
      ...row,
      candidateKey: candidates.find((candidate) => candidate.slug === row.candidateKey)?.aliases[0] ?? row.candidateKey,
    }));
    const snapshot = buildCommercialTrendSnapshot(candidates, rows, options);
    expect(snapshot.records.map((item) => item.slug)).toHaveLength(3);
    expect(snapshot.excluded).toEqual([]);
  });

  it("excludes missing or blocked required signals instead of fabricating zero", () => {
    const rows = completeRecords().filter((row) => !(
      (row.candidateKey === "beta-robot" && row.signal === "newsVelocity")
      || (row.candidateKey === "gamma-robot" && row.signal === "videoViewVelocity")
    ));
    rows.push(record("gamma-robot", "videoViewVelocity", null, "blocked"));
    const snapshot = buildCommercialTrendSnapshot(candidates, rows, options);
    expect(snapshot.records.map((item) => item.slug)).toEqual(["alpha-robot"]);
    expect(snapshot.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "beta-robot", reasons: expect.arrayContaining([expect.stringContaining("newsVelocity")]) }),
      expect.objectContaining({ slug: "gamma-robot", reasons: expect.arrayContaining([expect.stringContaining("videoViewVelocity")]) }),
    ]));
  });

  it("ignores first-party values and redistributes their weight when the sample is insufficient", () => {
    const rows = completeRecords();
    rows.push(record("alpha-robot", "firstPartyTraffic", 9999));
    rows.push(record("beta-robot", "firstPartyTraffic", 0));
    rows.push(record("gamma-robot", "firstPartyTraffic", 0));
    const snapshot = buildCommercialTrendSnapshot(candidates, rows, options);
    const alpha = snapshot.records.find((item) => item.slug === "alpha-robot");
    expect(alpha?.firstPartyTraffic).toBeNull();
    expect(alpha?.trafficSampleSufficient).toBe(false);
    expect(snapshot.weights.firstParty).toBe(0);
  });

  it("requires and scores measured first-party traffic when the sample is sufficient", () => {
    const rows = completeRecords();
    rows.push(record("alpha-robot", "firstPartyTraffic", 300));
    rows.push(record("beta-robot", "firstPartyTraffic", 200));
    rows.push(record("gamma-robot", "firstPartyTraffic", 100));
    const snapshot = buildCommercialTrendSnapshot(candidates, rows, {
      ...options,
      firstPartyTrafficSampleSufficient: true,
    });
    expect(snapshot.excluded).toEqual([]);
    expect(snapshot.weights.firstParty).toBe(0.1);
    expect(snapshot.records.find((item) => item.slug === "alpha-robot")?.firstPartyTraffic).toBe(100);
  });

  it("uses deterministic tie-breakers and contiguous ranks", () => {
    const tiedRows = candidates.flatMap((candidate) => [
      record(candidate.slug, "searchInterest", 10),
      record(candidate.slug, "newsVelocity", 10),
      record(candidate.slug, "videoViewVelocity", 10),
      record(candidate.slug, "officialActivity", 10),
    ]);
    const snapshot = buildCommercialTrendSnapshot(candidates, tiedRows, options);
    expect(snapshot.records.map((item) => item.slug)).toEqual(["alpha-robot", "beta-robot", "gamma-robot"]);
    expect(snapshot.records.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it("limits output to 300 while preserving contiguous ranks", () => {
    const largeCandidates = Array.from({ length: 305 }, (_, index) => ({ slug: `robot-${String(index + 1).padStart(3, "0")}`, name: `Robot ${index + 1}`, aliases: [] }));
    const rows = largeCandidates.flatMap((candidate, index) => [
      record(candidate.slug, "searchInterest", index),
      record(candidate.slug, "newsVelocity", index),
      record(candidate.slug, "videoViewVelocity", index),
      record(candidate.slug, "officialActivity", index),
    ]);
    const snapshot = buildCommercialTrendSnapshot(largeCandidates, rows, { ...options, limit: 300 });
    expect(snapshot.records).toHaveLength(300);
    expect(snapshot.records.at(0)?.rank).toBe(1);
    expect(snapshot.records.at(-1)?.rank).toBe(300);
    expect(new Set(snapshot.records.map((item) => item.rank)).size).toBe(300);
  });
});
