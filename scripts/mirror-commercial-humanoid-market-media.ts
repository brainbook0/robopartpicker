#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { commercialHumanoidMarketMediaIdentity } from "../src/lib/commercial-media";
import type { CommercialProfile } from "../src/lib/commercial-catalog";

type MarketProfile = CommercialProfile & { marketStatus: string; availabilityEvidenceUrl: string };
type MediaOverride = string | { kind?: "product_image" | "identity_illustration"; sourceUrl: string; localPath?: string; transform?: string };
type ManifestItem = {
  slug: string; index: number; fileId: string; objectKey: string; contentUrl: string; localPath: string;
  mediaType: "image/webp"; sizeBytes: number; checksumSha256: string; width: number; height: number;
  sourceUrl: string; sourcePageUrl: string; retrievedAt: string; title: string; altText: string; attribution: string; transform: string;
  sourceKind: "official_product_image" | "identity_illustration";
};
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const profilesPath = resolve(argument("--profiles") ?? "data/commercial-catalog/market-expansion/profiles.json");
const outputDirectory = resolve(argument("--output-dir") ?? ".ingest/commercial-media/humanoid-market-2026-08");
const manifestPath = resolve(argument("--manifest") ?? "data/commercial-catalog/market-expansion/media-manifest.json");
const concurrency = Math.min(8, Math.max(1, Number(argument("--concurrency") ?? 4)));
const payload = JSON.parse(readFileSync(profilesPath, "utf8")) as { profiles: MarketProfile[]; invalid: unknown[] };
const mediaOverrides = JSON.parse(readFileSync(resolve("data/commercial-catalog/market-expansion/media-overrides.json"), "utf8")) as Record<string, MediaOverride>;
if (!payload.profiles.length || payload.invalid.length) throw new Error("Market media mirror requires validated profiles and zero profile failures.");
rmSync(outputDirectory, { recursive: true, force: true }); mkdirSync(outputDirectory, { recursive: true });
const items: ManifestItem[] = []; const failures: Array<{ slug: string; error: string }> = [];
for (let index = 0; index < payload.profiles.length; index += concurrency) {
  const results = await Promise.all(payload.profiles.slice(index, index + concurrency).map(downloadAndTransform));
  for (const result of results) {
    if (result.ok) items.push(result.item);
    else failures.push(result.failure);
  }
  process.stderr.write(`humanoid market media ${Math.min(index + concurrency, payload.profiles.length)}/${payload.profiles.length}\n`);
}
items.sort((left, right) => left.slug.localeCompare(right.slug));
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), profiles: payload.profiles.length, items, failures }, null, 2)}\n`);
console.log(JSON.stringify({ manifestPath, outputDirectory, profiles: payload.profiles.length, items: items.length, failures: failures.length, failureRecords: failures, totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0) }, null, 2));
if (items.length !== payload.profiles.length || failures.length) process.exitCode = 1;

async function downloadAndTransform(profile: MarketProfile): Promise<{ ok: true; item: ManifestItem } | { ok: false; failure: { slug: string; error: string } }> {
  const declaration = profile.media[0]; const identity = commercialHumanoidMarketMediaIdentity(profile.slug);
  const override = mediaOverrides[profile.slug];
  const localOverride = typeof override === "object" && override.localPath ? resolve(override.localPath) : null;
  const sourcePath = resolve(outputDirectory, `${profile.slug}.source`); const targetPath = resolve(outputDirectory, profile.slug, "cover.webp");
  try {
    let source: Buffer;
    if (localOverride) source = readFileSync(localOverride);
    else {
      const response = await fetch(declaration.sourceUrl, { redirect: "follow", signal: AbortSignal.timeout(45_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; RoboPartPickerMediaMirror/1.0; +https://robopartpicker.com/about)", Referer: profile.officialProductUrl, Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      source = Buffer.from(await response.arrayBuffer());
    }
    if (source.length < 1_024 || source.length > 25 * 1_024 * 1_024) throw new Error(`source size ${source.length} outside 1KiB-25MiB bounds`);
    writeFileSync(sourcePath, source); mkdirSync(dirname(targetPath), { recursive: true });
    const [sourceWidth, sourceHeight] = identify(sourcePath);
    const transformArgs = sourceHeight > sourceWidth * 8
      ? [`${sourcePath}[0]`, "-crop", `${sourceWidth}x${sourceWidth}+0+0`, "+repage", "-auto-orient", "-thumbnail", "1200x1200>", "-strip", "-quality", "82", targetPath]
      : [`${sourcePath}[0]`, "-auto-orient", "-thumbnail", "1200x1200>", "-strip", "-quality", "82", targetPath];
    execFileSync("convert", transformArgs, { timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
    const transformed = readFileSync(targetPath);
    if (transformed.length < 1_024 || transformed.subarray(0, 4).toString("ascii") !== "RIFF" || transformed.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error("transformed output is not a valid non-empty WebP container");
    const [width, height] = identify(targetPath);
    if (width < 240 || height < 180) throw new Error(`transformed dimensions ${width}x${height} too small`);
    rmSync(sourcePath, { force: true });
    return { ok: true, item: {
      slug: profile.slug, index: 0, ...identity, localPath: targetPath, mediaType: "image/webp", sizeBytes: statSync(targetPath).size,
      checksumSha256: createHash("sha256").update(transformed).digest("hex"), width, height,
      sourceUrl: declaration.sourceUrl, sourcePageUrl: profile.officialProductUrl, retrievedAt: declaration.retrievedAt,
      title: declaration.title, altText: declaration.altText, attribution: declaration.attribution,
      sourceKind: declaration.kind === "identity_illustration" ? "identity_illustration" : "official_product_image",
      transform: `${typeof override === "object" && override.transform ? `${override.transform}; ` : sourceHeight > sourceWidth * 8 ? "first square sprite frame; " : "first frame; "}auto-orient; max 1200x1200; metadata stripped; WebP quality 82`,
    } };
  } catch (cause) {
    rmSync(sourcePath, { force: true }); rmSync(targetPath, { force: true });
    return { ok: false, failure: { slug: profile.slug, error: cause instanceof Error ? cause.message : String(cause) } };
  }
}
function identify(path: string): [number, number] { const value = execFileSync("identify", ["-format", "%w %h", path], { encoding: "utf8", timeout: 30_000 }); const [width, height] = value.trim().split(/\s+/u).map(Number); return [width, height]; }
