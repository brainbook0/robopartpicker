#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { commercialMediaIdentity } from "../src/lib/commercial-media";
import type { CommercialProfile } from "../src/lib/commercial-catalog";

type GalleryCandidate = { slug: string; officialProductUrl: string; sourceUrls: string[]; screenshotPath?: string; screenshotPaths?: string[] };
type GalleryOverride = { sourcePageUrl?: string; sourceUrls?: string[]; screenshotPaths?: string[] };
type CoverItem = { slug: string; checksumSha256: string; sourceUrl: string };
type GalleryItem = {
  slug: string; rank: number; index: number; fileId: string; objectKey: string; contentUrl: string; localPath: string;
  mediaType: "image/webp"; sizeBytes: number; checksumSha256: string; perceptualHash: string; width: number; height: number;
  sourceUrl: string; sourcePageUrl: string; sourceKind: "official_product_image" | "official_press_image" | "official_page_screenshot";
  retrievedAt: string; title: string; altText: string; attribution: string; transform: string;
};
const profilePayload = JSON.parse(readFileSync(resolve("data/commercial-catalog/profiles/top-300.json"), "utf8")) as { profiles: CommercialProfile[] };
const candidatePayload = JSON.parse(readFileSync(resolve("data/commercial-catalog/collected/gallery-candidates.json"), "utf8")) as { results: GalleryCandidate[] };
const coverPayload = JSON.parse(readFileSync(resolve("data/commercial-catalog/media/top-300-manifest.json"), "utf8")) as { items: CoverItem[] };
const overrides = JSON.parse(readFileSync(resolve("data/commercial-catalog/gallery-overrides.json"), "utf8")) as Record<string, GalleryOverride>;
const outputDirectory = resolve(".ingest/commercial-media/top-300-gallery");
const manifestPath = resolve("data/commercial-catalog/media/top-300-gallery-manifest.json");
if (profilePayload.profiles.length !== 300 || candidatePayload.results.length !== 300 || coverPayload.items.length !== 300) throw new Error("Gallery mirror inputs must each contain exactly 300 profiles.");
rmSync(outputDirectory, { recursive: true, force: true }); mkdirSync(outputDirectory, { recursive: true });
const candidates = new Map(candidatePayload.results.map((item) => [item.slug, item]));
const covers = new Map(coverPayload.items.map((item) => [item.slug, item]));
const items: GalleryItem[] = []; const failures: Array<{ slug: string; error: string }> = [];
const concurrency = 4;
for (let offset = 0; offset < profilePayload.profiles.length; offset += concurrency) {
  const results = await Promise.all(profilePayload.profiles.slice(offset, offset + concurrency).map(mirrorProfile));
  for (const result of results) { items.push(...result.items); if (result.error) failures.push({ slug: result.slug, error: result.error }); }
  process.stderr.write(`gallery media ${Math.min(offset + concurrency, profilePayload.profiles.length)}/${profilePayload.profiles.length}\n`);
}
items.sort((left, right) => left.rank - right.rank || left.index - right.index);
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), profiles: profilePayload.profiles.length, items, failures }, null, 2)}\n`);
const grouped = new Map<string, number>(); for (const item of items) grouped.set(item.slug, (grouped.get(item.slug) ?? 0) + 1);
console.log(JSON.stringify({ manifestPath, outputDirectory, items: items.length, profilesWithExtra: grouped.size, withThreeExtra: [...grouped.values()].filter((count) => count >= 3).length, failures: failures.length, totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0) }));
if (grouped.size !== 300) process.exitCode = 1;

async function mirrorProfile(profile: CommercialProfile): Promise<{ slug: string; items: GalleryItem[]; error: string | null }> {
  const declaration = candidates.get(profile.slug); const cover = covers.get(profile.slug);
  if (!declaration || !cover) return { slug: profile.slug, items: [], error: "missing candidate or cover manifest" };
  const hashes = new Set([cover.checksumSha256]); const perceptualHashes: string[] = [];
  const coverPath = resolve(".ingest/commercial-media/top-300", profile.slug, "cover.webp");
  try { perceptualHashes.push(perceptualHash(coverPath)); } catch { /* exact checksum still protects the cover */ }
  const override = overrides[profile.slug];
  const sourcePageUrl = override?.sourcePageUrl ?? profile.officialProductUrl;
  const sources: Array<{ value: string; kind: GalleryItem["sourceKind"]; sourcePageUrl: string }> = (override?.sourceUrls ?? declaration.sourceUrls).filter((url) => url !== cover.sourceUrl).map((value) => ({ value, kind: override?.sourceUrls ? "official_press_image" : "official_product_image", sourcePageUrl }));
  for (const screenshotPath of override?.screenshotPaths ?? declaration.screenshotPaths ?? (declaration.screenshotPath ? [declaration.screenshotPath] : [])) sources.push({ value: screenshotPath, kind: "official_page_screenshot", sourcePageUrl });
  const accepted: GalleryItem[] = []; const errors: string[] = [];
  for (let sourceIndex = 0; sourceIndex < sources.length && accepted.length < 3; sourceIndex++) {
    const source = sources[sourceIndex]; const galleryIndex = accepted.length + 1; const identity = commercialMediaIdentity(profile.slug, galleryIndex);
    const sourcePath = resolve(outputDirectory, `${profile.slug}-${sourceIndex}.source`); const targetPath = resolve(outputDirectory, identity.objectKey.replace(/^commercial-catalog\/top-300\//u, ""));
    try {
      const bytes = source.kind === "official_page_screenshot" ? readFileSync(source.value) : await download(source.value, profile.officialProductUrl);
      if (bytes.length < 1_024 || bytes.length > 25 * 1_024 * 1_024) throw new Error(`source size ${bytes.length} outside 1KiB-25MiB bounds`);
      writeFileSync(sourcePath, bytes); mkdirSync(dirname(targetPath), { recursive: true });
      execFileSync("convert", [`${sourcePath}[0]`, "-auto-orient", "-thumbnail", "1200x1200>", "-strip", "-quality", "82", targetPath], { timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
      const transformed = readFileSync(targetPath); const checksum = createHash("sha256").update(transformed).digest("hex");
      if (transformed.length < 1_024 || transformed.subarray(0, 4).toString("ascii") !== "RIFF" || transformed.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error("invalid transformed WebP");
      const [width, height] = identify(targetPath); if (width < 240 || height < 180) throw new Error(`transformed dimensions ${width}x${height} too small`);
      const pHash = perceptualHash(targetPath); if (hashes.has(checksum) || perceptualHashes.some((known) => hammingDistance(known, pHash) <= 5)) throw new Error("duplicate or near-duplicate image");
      hashes.add(checksum); perceptualHashes.push(pHash);
      const number = accepted.length + 2;
      accepted.push({ slug: profile.slug, rank: profile.trend.rank, index: galleryIndex, ...identity, localPath: targetPath, mediaType: "image/webp", sizeBytes: statSync(targetPath).size, checksumSha256: checksum, perceptualHash: pHash, width, height, sourceUrl: source.kind === "official_page_screenshot" ? source.sourcePageUrl : source.value, sourcePageUrl: source.sourcePageUrl, sourceKind: source.kind, retrievedAt: profile.retrievedAt, title: source.kind === "official_page_screenshot" ? `Official ${profile.name} product page` : `Official ${profile.name} product image ${number}`, altText: source.kind === "official_page_screenshot" ? `${profile.manufacturer} ${profile.name} official product page` : `${profile.manufacturer} ${profile.name} product image ${number}`, attribution: profile.manufacturer, transform: "first frame; auto-orient; max 1200x1200; metadata stripped; WebP quality 82; perceptual dedupe" });
    } catch (cause) { rmSync(targetPath, { force: true }); errors.push(`${source.value}: ${cause instanceof Error ? cause.message : String(cause)}`); }
    finally { rmSync(sourcePath, { force: true }); }
  }
  return { slug: profile.slug, items: accepted, error: accepted.length ? null : errors.slice(0, 3).join(" | ") || "no additional official image candidates" };
}

async function download(url: string, referer: string): Promise<Buffer> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; RoboPartPickerGalleryMirror/1.0; +https://robopartpicker.com/about)", Referer: referer, Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`); return Buffer.from(await response.arrayBuffer());
  } finally { clearTimeout(timeout); }
}
function identify(path: string): [number, number] { const value = execFileSync("identify", ["-format", "%w %h", path], { encoding: "utf8", timeout: 30_000 }); const [width, height] = value.trim().split(/\s+/u).map(Number); return [width, height]; }
function perceptualHash(path: string): string { const bytes = execFileSync("convert", [path, "-resize", "9x8!", "-colorspace", "gray", "-depth", "8", "gray:-"], { timeout: 30_000 }); let bits = ""; for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) bits += bytes[row * 9 + column] > bytes[row * 9 + column + 1] ? "1" : "0"; return BigInt(`0b${bits}`).toString(16).padStart(16, "0"); }
function hammingDistance(left: string, right: string): number { let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`); let count = 0; while (value) { count += Number(value & 1n); value >>= 1n; } return count; }
