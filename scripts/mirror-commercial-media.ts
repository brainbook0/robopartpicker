#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { commercialMediaIdentity } from "../src/lib/commercial-media";
import type { CommercialProfile } from "../src/lib/commercial-catalog";

type ManifestItem = {
  slug: string;
  rank: number;
  fileId: string;
  objectKey: string;
  contentUrl: string;
  localPath: string;
  mediaType: "image/webp";
  sizeBytes: number;
  checksumSha256: string;
  sourceUrl: string;
  sourcePageUrl: string;
  retrievedAt: string;
  title: string;
  altText: string;
  attribution: string;
  transform: string;
};
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const profilesPath = resolve(argument("--profiles") ?? "data/commercial-catalog/profiles/top-300.json");
const outputDirectory = resolve(argument("--output-dir") ?? ".ingest/commercial-media/top-300");
const manifestPath = resolve(argument("--manifest") ?? "data/commercial-catalog/media/top-300-manifest.json");
const payload = JSON.parse(readFileSync(profilesPath, "utf8")) as { profiles: CommercialProfile[] };
if (payload.profiles.length !== 300) throw new Error(`Expected 300 validated profiles, got ${payload.profiles.length}.`);
rmSync(outputDirectory, { recursive: true, force: true }); mkdirSync(outputDirectory, { recursive: true });
const manifest: ManifestItem[] = []; const failures: Array<{ slug: string; error: string }> = [];
const concurrency = 6;
for (let index = 0; index < payload.profiles.length; index += concurrency) {
  const results = await Promise.all(payload.profiles.slice(index, index + concurrency).map(downloadAndTransform));
  for (const result of results) {
    if (result.ok) manifest.push(result.item);
    else failures.push(result.failure);
  }
  process.stderr.write(`media ${Math.min(index + concurrency, payload.profiles.length)}/${payload.profiles.length}\n`);
}
manifest.sort((left, right) => left.rank - right.rank);
mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), profiles: payload.profiles.length, items: manifest, failures }, null, 2)}\n`);
console.log(JSON.stringify({ manifestPath, outputDirectory, items: manifest.length, failures: failures.length, totalBytes: manifest.reduce((sum, item) => sum + item.sizeBytes, 0) }));
if (manifest.length !== 300 || failures.length) process.exitCode = 1;

async function downloadAndTransform(profile: CommercialProfile): Promise<{ ok: true; item: ManifestItem } | { ok: false; failure: { slug: string; error: string } }> {
  const declaration = profile.media[0]; const identity = commercialMediaIdentity(profile.slug);
  const sourcePath = resolve(outputDirectory, `${profile.slug}.source`); const targetPath = resolve(outputDirectory, identity.objectKey.replace(/^commercial-catalog\/top-300\//u, ""));
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try { response = await fetch(declaration.sourceUrl, { redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; RoboPartPickerMediaMirror/1.0; +https://robopartpicker.com/about)", Referer: profile.officialProductUrl, Accept: "image/avif,image/webp,image/png,image/jpeg,image/*" } }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = Buffer.from(await response.arrayBuffer());
    if (source.length < 1_024 || source.length > 25 * 1_024 * 1_024) throw new Error(`source size ${source.length} outside 1KiB-25MiB bounds`);
    writeFileSync(sourcePath, source); mkdirSync(dirname(targetPath), { recursive: true });
    execFileSync("convert", [`${sourcePath}[0]`, "-auto-orient", "-thumbnail", "1200x1200>", "-strip", "-quality", "82", targetPath], { timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
    const transformed = readFileSync(targetPath);
    if (transformed.length < 1_024 || transformed.subarray(0, 4).toString("ascii") !== "RIFF" || transformed.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error("transformed output is not a valid non-empty WebP container");
    rmSync(sourcePath, { force: true });
    return { ok: true, item: {
      slug: profile.slug, rank: profile.trend.rank, ...identity, localPath: targetPath, mediaType: "image/webp", sizeBytes: statSync(targetPath).size,
      checksumSha256: createHash("sha256").update(transformed).digest("hex"), sourceUrl: declaration.sourceUrl, sourcePageUrl: profile.officialProductUrl,
      retrievedAt: declaration.retrievedAt, title: declaration.title, altText: declaration.altText, attribution: declaration.attribution,
      transform: "first frame; auto-orient; max 1200x1200; metadata stripped; WebP quality 82",
    } };
  } catch (cause) {
    rmSync(sourcePath, { force: true }); rmSync(targetPath, { force: true });
    return { ok: false, failure: { slug: profile.slug, error: cause instanceof Error ? cause.message : String(cause) } };
  }
}
