#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stableId, sqlString } from "../src/lib/physical-design-wave-import";
import { captureWranglerJson, runWrangler } from "./wrangler-cli";

type EnvName = "local" | "production";
type GalleryItem = {
  slug: string; rank: number; index: number; fileId: string; objectKey: string; contentUrl: string; mediaType: string; sizeBytes: number;
  checksumSha256: string; sourceUrl: string; sourcePageUrl: string; sourceKind: string; retrievedAt: string; title: string; altText: string; attribution: string; transform: string;
};
type Mapping = { candidateSlug: string; projectId: string; projectSlug: string; fileId: string };
type CoverItem = { slug: string; contentUrl: string; checksumSha256: string; sourceUrl: string; retrievedAt: string; title: string; altText: string; attribution: string };
type WranglerStatement<T> = { results?: T[] };
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const environment = argument("--env") as EnvName | undefined;
const apply = process.argv.includes("--apply");
if (!environment || !["local", "production"].includes(environment)) throw new Error("Usage: tsx scripts/publish-commercial-galleries.ts --env local|production [--apply]");
if (apply && environment === "production" && process.env.ROBOPARTPICKER_GALLERY_APPLY !== "apply-production-galleries") throw new Error("Refusing production apply without ROBOPARTPICKER_GALLERY_APPLY=apply-production-galleries");
const galleryPayload = JSON.parse(readFileSync(resolve("data/commercial-catalog/media/top-300-gallery-manifest.json"), "utf8")) as { generatedAt: string; items: GalleryItem[] };
const coverPayload = JSON.parse(readFileSync(resolve("data/commercial-catalog/media/top-300-manifest.json"), "utf8")) as { items: CoverItem[] };
const plan = JSON.parse(readFileSync(resolve(`.ingest/commercial-publication/${environment === "production" ? "production" : "local"}/publication-plan.json`), "utf8")) as { mappings: Mapping[] };
const mappings = new Map(plan.mappings.map((mapping) => [mapping.candidateSlug, mapping]));
const covers = new Map(coverPayload.items.map((item) => [item.slug, item]));
if (!galleryPayload.items.length || plan.mappings.length !== 300) throw new Error("Gallery manifest must be non-empty and publication plan must map 300 profiles.");
for (const item of galleryPayload.items) if (!mappings.has(item.slug)) throw new Error(`No publication mapping for ${item.slug}.`);
const outputDirectory = resolve(`.ingest/commercial-gallery-publication/${environment}`); mkdirSync(outputDirectory, { recursive: true });
const wavePaths: string[] = [];
for (let offset = 0; offset < galleryPayload.items.length; offset += 100) {
  const path = join(outputDirectory, `wave-${Math.floor(offset / 100) + 1}-${offset + 1}-${Math.min(offset + 100, galleryPayload.items.length)}.sql`);
  writeFileSync(path, renderSql(galleryPayload.items.slice(offset, offset + 100).flatMap(statementsFor)));
  wavePaths.push(path);
}
const metadataPath = join(outputDirectory, "finalize-gallery-metadata.sql");
writeFileSync(metadataPath, renderSql(plan.mappings.map(metadataStatement)));
const planPath = join(outputDirectory, "publication-plan.json");
writeFileSync(planPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), environment, items: galleryPayload.items.length, profiles: new Set(galleryPayload.items.map((item) => item.slug)).size, waves: wavePaths, metadataPath }, null, 2)}\n`);
console.log(JSON.stringify({ planPath, environment, items: galleryPayload.items.length, waves: wavePaths.length }));
if (apply) {
  for (const path of wavePaths) { runSqlFile(path); console.log(`applied ${path}`); }
  runSqlFile(metadataPath); console.log(`applied ${metadataPath}`);
  const verification = verify(); console.log("VERIFIED", JSON.stringify(verification));
  if (verification.files !== galleryPayload.items.length || verification.attachments !== galleryPayload.items.length || verification.media !== galleryPayload.items.length || verification.projectsWithThree < 300) throw new Error(`Gallery publication verification failed: ${JSON.stringify(verification)}`);
} else console.log("DRY RUN ONLY. Review generated SQL and rerun with --apply.");

function statementsFor(item: GalleryItem): string[] {
  const mapping = mappings.get(item.slug)!; const now = galleryPayload.generatedAt;
  const mediaId = stableId("media", `${mapping.projectId}:${item.fileId}:top300-gallery-v1`);
  const originalName = `gallery-${String(item.index).padStart(2, "0")}.webp`;
  const relativePath = `media/${originalName}`;
  const metadata = { sourceUrl: item.sourceUrl, sourcePageUrl: item.sourcePageUrl, sourceKind: item.sourceKind, retrievedAt: item.retrievedAt, attribution: item.attribution, transform: item.transform, rightsBasis: "manufacturer-attributed product-identification gallery asset; takedown on verified rights-holder request" };
  return [
    `INSERT INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256, owner_user_id, organization_id, visibility, status, kind, metadata_json, created_at, updated_at, deleted_at) VALUES (${sqlString(item.fileId)}, ${sqlString(item.objectKey)}, ${sqlString(originalName)}, 'image/webp', ${item.sizeBytes}, ${sqlString(item.checksumSha256)}, 'robotics-catalog-import', NULL, 'public', 'ready', 'image', ${sqlString(JSON.stringify(metadata))}, ${sqlString(now)}, ${sqlString(now)}, NULL) ON CONFLICT(id) DO UPDATE SET object_key=excluded.object_key, original_name=excluded.original_name, media_type='image/webp', size_bytes=excluded.size_bytes, checksum_sha256=excluded.checksum_sha256, visibility='public', status='ready', metadata_json=excluded.metadata_json, updated_at=excluded.updated_at, deleted_at=NULL`,
    `INSERT INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at) SELECT ${sqlString(mapping.projectId)}, current_version_id, ${sqlString(item.fileId)}, 'media', ${sqlString(relativePath)}, ${sqlString(now)} FROM projects WHERE id=${sqlString(mapping.projectId)} AND owner_user_id='robotics-catalog-import' AND project_kind='commercial_showcase' ON CONFLICT(project_id, file_id) DO UPDATE SET project_version_id=excluded.project_version_id, purpose='media', relative_path=excluded.relative_path`,
    `INSERT INTO project_media (id, project_id, file_id, caption, alt_text, sort_order, created_at) VALUES (${sqlString(mediaId)}, ${sqlString(mapping.projectId)}, ${sqlString(item.fileId)}, ${sqlString(item.title)}, ${sqlString(item.altText)}, ${item.index}, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET file_id=excluded.file_id, caption=excluded.caption, alt_text=excluded.alt_text, sort_order=excluded.sort_order`,
  ];
}
function metadataStatement(mapping: Mapping): string {
  const cover = covers.get(mapping.candidateSlug); if (!cover) throw new Error(`Missing cover metadata for ${mapping.candidateSlug}.`);
  const gallery = galleryPayload.items.filter((item) => item.slug === mapping.candidateSlug).sort((left, right) => left.index - right.index);
  const media = [{ kind: "product_image", sourceUrl: cover.sourceUrl, retrievedAt: cover.retrievedAt, title: cover.title, altText: cover.altText, attribution: cover.attribution, managed_content_url: cover.contentUrl, checksum_sha256: cover.checksumSha256 }, ...gallery.map((item) => ({ kind: "product_image", sourceUrl: item.sourceUrl, retrievedAt: item.retrievedAt, title: item.title, altText: item.altText, attribution: item.attribution, managed_content_url: item.contentUrl, checksum_sha256: item.checksumSha256, source_kind: item.sourceKind }))];
  return `UPDATE project_versions SET rpps_json=json_set(rpps_json, '$.commercial_profile.media', json(${sqlString(JSON.stringify(media))})) WHERE id=(SELECT current_version_id FROM projects WHERE id=${sqlString(mapping.projectId)} AND owner_user_id='robotics-catalog-import' AND project_kind='commercial_showcase')`;
}
function renderSql(statements: string[]): string { return `${statements.map((statement) => `${statement.trim().replace(/;$/u, "")};`).join("\n")}\n`; }
function runSqlFile(path: string): void { const args = environment === "local" ? ["d1", "execute", "DB", "--local", "--file", path] : ["d1", "execute", "DB", "--env", "production", "--remote", "--file", path]; runWrangler(args); }
function verify(): Record<string, number> {
  const fileIds = galleryPayload.items.map((item) => sqlString(item.fileId)).join(","); const projectIds = plan.mappings.map((mapping) => sqlString(mapping.projectId)).join(",");
  const sql = `SELECT COUNT(*) AS count FROM files WHERE id IN (${fileIds}) AND status='ready' AND visibility='public'; SELECT COUNT(*) AS count FROM project_files WHERE file_id IN (${fileIds}) AND purpose='media'; SELECT COUNT(*) AS count FROM project_media WHERE file_id IN (${fileIds}); SELECT COUNT(*) AS count FROM (SELECT project_id FROM project_media WHERE project_id IN (${projectIds}) GROUP BY project_id HAVING COUNT(*) >= 3);`;
  const args = environment === "local" ? ["d1", "execute", "DB", "--local", "--command", sql] : ["d1", "execute", "DB", "--env", "production", "--remote", "--command", sql];
  const counts = captureWranglerJson<Array<WranglerStatement<{ count: number }>>>(args).flatMap((statement) => statement.results ?? []).map((row) => Number(row.count));
  return { files: counts[0] ?? 0, attachments: counts[1] ?? 0, media: counts[2] ?? 0, projectsWithThree: counts[3] ?? 0 };
}
