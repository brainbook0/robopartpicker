#!/usr/bin/env tsx
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCommercialTrendSnapshot, type CommercialTrendCandidate, type CommercialTrendSourceRecord } from "../src/lib/commercial-trend-score";

type Candidate = CommercialTrendCandidate & Record<string, unknown>;
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function loadCandidates(directory: string): Candidate[] { return readdirSync(directory).filter((name) => name.endsWith(".json")).sort().flatMap((name) => JSON.parse(readFileSync(resolve(directory, name), "utf8")) as Candidate[]); }
function readRecords(path: string): CommercialTrendSourceRecord[] { const value = JSON.parse(readFileSync(resolve(path), "utf8")) as { records?: CommercialTrendSourceRecord[] }; if (!Array.isArray(value.records)) throw new Error(`${path} has no records array`); return value.records; }

const candidateDirectory = argument("--dir") ?? "data/commercial-catalog/candidates";
const officialPath = argument("--official") ?? "data/commercial-catalog/collected/official-pages.json";
const searchPath = argument("--search") ?? "data/commercial-catalog/collected/search-signals.json";
const newsPath = argument("--news") ?? "data/commercial-catalog/collected/news-signals.json";
const videoPath = argument("--video") ?? "data/commercial-catalog/collected/video-signals.json";
const outputPath = resolve(argument("--output") ?? "data/commercial-catalog/collected/trend-snapshot.json");
const capturedAt = argument("--captured-at") ?? new Date().toISOString();
const candidates = loadCandidates(candidateDirectory);
const officialPayload = JSON.parse(readFileSync(resolve(officialPath), "utf8")) as { results?: Array<{ officialActivitySource: CommercialTrendSourceRecord }> };
if (!Array.isArray(officialPayload.results)) throw new Error("Official-page payload has no results array.");
const sourceRecords = [
  ...readRecords(searchPath),
  ...readRecords(newsPath),
  ...readRecords(videoPath),
  ...officialPayload.results.map((result) => result.officialActivitySource),
];
const snapshot = buildCommercialTrendSnapshot(candidates, sourceRecords, {
  methodologyVersion: "commercial-trend-v1-2026-08",
  windowStart: "2025-08-25T00:00:00.000Z",
  windowEnd: "2026-08-25T00:00:00.000Z",
  capturedAt,
  firstPartyTrafficSampleSufficient: false,
  limit: 300,
});
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, candidates: candidates.length, sourceRecords: sourceRecords.length, ranked: snapshot.records.length, excluded: snapshot.excluded.length, exclusionReasons: Object.fromEntries([...new Set(snapshot.excluded.flatMap((item) => item.reasons))].sort().map((reason) => [reason, snapshot.excluded.filter((item) => item.reasons.includes(reason)).length])) }));
