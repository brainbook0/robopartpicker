#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Override = { sourceUrl: string; pageUrl: string; retrievedAt: string; title: string; altText: string; attribution: string; method: string };
type Result = { candidate: { slug: string }; metadata: { imageUrl: string | null }; profileDraft: { media: unknown[]; evidence: unknown[] } };
const payloadPath = resolve(process.argv[2] ?? "data/commercial-catalog/collected/official-pages.json");
const overridesPath = resolve(process.argv[3] ?? "data/commercial-catalog/media-overrides.json");
const payload = JSON.parse(readFileSync(payloadPath, "utf8")) as { results: Result[] };
const overrides = JSON.parse(readFileSync(overridesPath, "utf8")) as Record<string, Override>;
const bySlug = new Map(payload.results.map((result) => [result.candidate.slug, result]));
for (const [slug, override] of Object.entries(overrides)) {
  const result = bySlug.get(slug);
  if (!result) throw new Error(`Unknown media override candidate: ${slug}`);
  for (const value of [override.sourceUrl, override.pageUrl]) { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Invalid media override URL for ${slug}`); }
  result.metadata.imageUrl = override.sourceUrl;
  result.profileDraft.media = [{ kind: "product_image", sourceUrl: override.sourceUrl, retrievedAt: override.retrievedAt, title: override.title, altText: override.altText, attribution: override.attribution }];
  const evidence = { title: override.title, sourceType: "official_product_page_render", sourceUrl: override.pageUrl, retrievedAt: override.retrievedAt, confidence: 0.9, method: override.method };
  if (!result.profileDraft.evidence.some((item) => item && typeof item === "object" && (item as { sourceUrl?: unknown }).sourceUrl === override.pageUrl && (item as { sourceType?: unknown }).sourceType === "official_product_page_render")) result.profileDraft.evidence.push(evidence);
}
writeFileSync(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ payloadPath, applied: Object.keys(overrides).length, images: payload.results.filter((result) => result.metadata.imageUrl).length }));
