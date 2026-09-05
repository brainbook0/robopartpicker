#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { officialActivityValue } from "../src/lib/commercial-source-metadata";

const path = resolve(process.argv[2] ?? "data/commercial-catalog/collected/official-pages.json");
const payload = JSON.parse(readFileSync(path, "utf8")) as { capturedAt: string; results: Array<{ candidate: { slug: string; lifecycle: string; officialProductUrl: string }; fetch: { ok: boolean }; metadata: { activityDate: string | null }; officialActivitySource: Record<string, unknown> }> };
for (const result of payload.results) {
  const value = officialActivityValue(result.metadata.activityDate, payload.capturedAt, result.fetch.ok && result.candidate.lifecycle === "official_catalog_listing");
  result.officialActivitySource = {
    candidateKey: result.candidate.slug,
    signal: "officialActivity",
    value,
    status: value == null ? (result.fetch.ok ? "missing" : "blocked") : "ok",
    collectedAt: payload.capturedAt,
    sourceUrl: result.candidate.officialProductUrl,
  };
}
writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ path, ok: payload.results.filter((item) => item.officialActivitySource.status === "ok").length, missing: payload.results.filter((item) => item.officialActivitySource.status === "missing").length, blocked: payload.results.filter((item) => item.officialActivitySource.status === "blocked").length }));
