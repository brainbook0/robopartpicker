#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { extractOfficialImageCandidates } from "../src/lib/commercial-source-metadata";
import type { CommercialProfile } from "../src/lib/commercial-catalog";

const profilesPath = resolve("data/commercial-catalog/profiles/top-300.json");
const outputPath = resolve("data/commercial-catalog/collected/gallery-candidates.json");
const payload = JSON.parse(readFileSync(profilesPath, "utf8")) as { generatedAt: string; profiles: CommercialProfile[] };
if (payload.profiles.length !== 300) throw new Error(`Expected 300 profiles, got ${payload.profiles.length}.`);

type GalleryResult = {
  slug: string;
  name: string;
  manufacturer: string;
  officialProductUrl: string;
  retrievedAt: string;
  fetch: { ok: boolean; httpStatus: number | null; finalUrl: string; error: string | null };
  sourceUrls: string[];
};

const results: GalleryResult[] = [];
const concurrency = 8;
for (let index = 0; index < payload.profiles.length; index += concurrency) {
  results.push(...await Promise.all(payload.profiles.slice(index, index + concurrency).map(collect)));
  process.stderr.write(`gallery candidates ${Math.min(index + concurrency, payload.profiles.length)}/${payload.profiles.length}\n`);
}
results.sort((left, right) => payload.profiles.findIndex((profile) => profile.slug === left.slug) - payload.profiles.findIndex((profile) => profile.slug === right.slug));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), profiles: results.length, results }, null, 2)}\n`);
const counts = results.map((result) => result.sourceUrls.length);
console.log(JSON.stringify({ outputPath, profiles: results.length, fetched: results.filter((result) => result.fetch.ok).length, withTwo: counts.filter((count) => count >= 2).length, withThree: counts.filter((count) => count >= 3).length, withFour: counts.filter((count) => count >= 4).length, candidates: counts.reduce((sum, count) => sum + count, 0) }));

async function collect(profile: CommercialProfile): Promise<GalleryResult> {
  const sourceUrls: string[] = [];
  const seen = new Set<string>();
  const add = (url: string): void => { if (!seen.has(url)) { seen.add(url); sourceUrls.push(url); } };
  profile.media.forEach((media) => add(media.sourceUrl));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(profile.officialProductUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RoboPartPickerGalleryCollector/1.0; +https://robopartpicker.com/about)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return result(profile, sourceUrls, false, response.status, response.url || profile.officialProductUrl, `HTTP ${response.status}`);
    const html = (await response.text()).slice(0, 4_000_000);
    extractOfficialImageCandidates(html, response.url || profile.officialProductUrl, 10).forEach(add);
    return result(profile, sourceUrls.slice(0, 10), true, response.status, response.url || profile.officialProductUrl, null);
  } catch (cause) {
    return result(profile, sourceUrls, false, null, profile.officialProductUrl, cause instanceof Error ? cause.message : String(cause));
  } finally { clearTimeout(timeout); }
}

function result(profile: CommercialProfile, sourceUrls: string[], ok: boolean, httpStatus: number | null, finalUrl: string, error: string | null): GalleryResult {
  return { slug: profile.slug, name: profile.name, manufacturer: profile.manufacturer, officialProductUrl: profile.officialProductUrl, retrievedAt: profile.retrievedAt, fetch: { ok, httpStatus, finalUrl, error }, sourceUrls };
}
