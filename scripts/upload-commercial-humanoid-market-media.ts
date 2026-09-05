#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runWrangler } from "./wrangler-cli";

type ManifestItem = { slug: string; objectKey: string; localPath: string; mediaType: string };
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const manifestPath = resolve(argument("--manifest") ?? "data/commercial-catalog/market-expansion/media-manifest.json");
const bucket = argument("--bucket") ?? "robopartpicker-files";
const apply = process.argv.includes("--apply");
const payload = JSON.parse(readFileSync(manifestPath, "utf8")) as { profiles: number; items: ManifestItem[]; failures: unknown[] };
if (!payload.items.length || payload.items.length !== payload.profiles || payload.failures.length) throw new Error("Upload requires one validated media item per profile and zero failures.");
console.log(JSON.stringify({ manifestPath, bucket, items: payload.items.length, mode: apply ? "apply" : "dry-run" }));
if (!apply) process.exit(0);
if (process.env.ROBOPARTPICKER_HUMANOID_MARKET_MEDIA_APPLY !== "apply-production-humanoid-market-media") throw new Error("Refusing upload without ROBOPARTPICKER_HUMANOID_MARKET_MEDIA_APPLY=apply-production-humanoid-market-media");
for (const [index, item] of payload.items.entries()) {
  runWrangler(["r2", "object", "put", `${bucket}/${item.objectKey}`, "--file", item.localPath, "--remote", "--content-type", item.mediaType]);
  console.log(`uploaded ${index + 1}/${payload.items.length} ${item.slug}`);
}
