#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOfficialPageMetadata } from "../src/lib/commercial-source-metadata";

type Result = { candidate: { name: string; manufacturer: string; model: string; officialProductUrl: string }; fetch: { ok: boolean; httpStatus: number | null; finalUrl: string; error: string | null }; metadata: { description: string | null; imageUrl: string | null; activityDate: string | null }; profileDraft: { media: unknown[] } };
async function fetchImage(result: Result, capturedAt: string): Promise<void> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(result.candidate.officialProductUrl, { redirect: "follow", signal: controller.signal, headers: { "User-Agent": "RoboPartPickerEvidenceCollector/1.0 (+https://robopartpicker.com/about)", Accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) return;
    const metadata = parseOfficialPageMetadata((await response.text()).slice(0, 2_000_000), response.url || result.candidate.officialProductUrl, response.headers.get("last-modified"));
    if (!metadata.imageUrl) return;
    result.metadata.imageUrl = metadata.imageUrl;
    result.profileDraft.media = [{ kind: "product_image", sourceUrl: metadata.imageUrl, retrievedAt: capturedAt, title: `Official product image for ${result.candidate.name}`, altText: `${result.candidate.manufacturer} ${result.candidate.model} product image`, attribution: result.candidate.manufacturer }];
  } catch { /* original fail-closed result remains */ }
  finally { clearTimeout(timeout); }
}
async function main() {
  const path = resolve(process.argv[2] ?? "data/commercial-catalog/collected/official-pages.json");
  const payload = JSON.parse(readFileSync(path, "utf8")) as { capturedAt: string; results: Result[] };
  const missing = payload.results.filter((result) => !result.metadata.imageUrl); const concurrency = 12;
  for (let index = 0; index < missing.length; index += concurrency) {
    await Promise.all(missing.slice(index, index + concurrency).map((result) => fetchImage(result, payload.capturedAt)));
    process.stderr.write(`missing media ${Math.min(index + concurrency, missing.length)}/${missing.length}\n`);
  }
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ path, attempted: missing.length, images: payload.results.filter((result) => result.metadata.imageUrl).length, remaining: payload.results.filter((result) => !result.metadata.imageUrl).length }));
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
