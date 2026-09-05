#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateCommercialProfile, type CommercialProfile } from "../src/lib/commercial-catalog";
import type { CommercialTrendSnapshot, RankedCommercialTrendRecord } from "../src/lib/commercial-trend-score";

type OfficialResult = {
  candidate: Omit<CommercialProfile, "description" | "useCases" | "specs" | "price" | "trend" | "evidence" | "media">;
  profileDraft: Pick<CommercialProfile, "description" | "useCases" | "specs" | "price" | "evidence" | "media">;
};
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const officialPath = resolve(argument("--official") ?? "data/commercial-catalog/collected/official-pages.json");
const trendPath = resolve(argument("--trend") ?? "data/commercial-catalog/collected/trend-snapshot.json");
const outputPath = resolve(argument("--output") ?? "data/commercial-catalog/profiles/top-300.json");
const official = JSON.parse(readFileSync(officialPath, "utf8")) as { results: OfficialResult[] };
const snapshot = JSON.parse(readFileSync(trendPath, "utf8")) as CommercialTrendSnapshot;
const bySlug = new Map(official.results.map((result) => [result.candidate.slug, result]));
const profiles: CommercialProfile[] = [];
const invalid: Array<{ slug: string; rank: number; errors: string[] }> = [];
for (const ranked of snapshot.records) {
  const result = bySlug.get(ranked.slug);
  if (!result) { invalid.push({ slug: ranked.slug, rank: ranked.rank, errors: ["missing official profile draft"] }); continue; }
  const profile: CommercialProfile = {
    ...result.candidate,
    ...result.profileDraft,
    trend: trendFor(ranked, snapshot),
  };
  const errors = validateCommercialProfile(profile);
  if (errors.length) invalid.push({ slug: ranked.slug, rank: ranked.rank, errors }); else profiles.push(profile);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ generatedAt: snapshot.capturedAt, methodologyVersion: snapshot.methodologyVersion, profiles, invalid }, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, ranked: snapshot.records.length, valid: profiles.length, invalid: invalid.length, invalidByReason: Object.fromEntries([...new Set(invalid.flatMap((item) => item.errors))].sort().map((reason) => [reason, invalid.filter((item) => item.errors.includes(reason)).length])) }));
if (profiles.length !== 300 || invalid.length) process.exitCode = 1;

function trendFor(ranked: RankedCommercialTrendRecord, snapshot: CommercialTrendSnapshot): CommercialProfile["trend"] {
  return {
    rank: ranked.rank,
    searchInterest: ranked.searchInterest,
    newsVelocity: ranked.newsVelocity,
    videoViewVelocity: ranked.videoViewVelocity,
    officialActivity: ranked.officialActivity,
    firstPartyTraffic: ranked.firstPartyTraffic,
    trafficSampleSufficient: ranked.trafficSampleSufficient,
    compositeScore: ranked.compositeScore,
    methodologyVersion: snapshot.methodologyVersion,
    windowStart: snapshot.windowStart,
    windowEnd: snapshot.windowEnd,
    capturedAt: snapshot.capturedAt,
  };
}
