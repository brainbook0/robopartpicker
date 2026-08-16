/**
 * Replace GitHub opengraph cover images with an actual model photo collected from
 * each physical-design project's repo.
 *
 * Usage: tsx scripts/backfill-cover-photos.ts --env production|preview [--apply]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const targetEnv = envIndex >= 0 ? args[envIndex + 1] : undefined;
const apply = args.includes("--apply");

if (targetEnv !== "production" && targetEnv !== "preview") {
  console.error("Usage: tsx scripts/backfill-cover-photos.ts --env production|preview [--apply]");
  process.exit(2);
}

function sq(value: string): string {
  return value.replace(/'/g, "''");
}

function encodeId(id: string): string {
  return encodeURIComponent(id);
}

async function query<T>(sql: string): Promise<T[]> {
  const { stdout } = await exec("node_modules/.bin/wrangler",
    ["d1", "execute", "DB", "--env", targetEnv!, "--remote", "--json", "--command", sql],
    { env: process.env, maxBuffer: 32 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as Array<{ results?: T[] }>;
  return parsed.flatMap((page) => page.results ?? []);
}

type ImageRow = { slug: string; file_id: string; name: string; size: number };
type ProjectRow = { id: string; slug: string; version_id: string; rpps_json: string };

function scoreImage(name: string, slug: string, size: number): number {
  const lower = name.toLowerCase();
  let score = 0;
  for (const term of ["assembled", "hero", "cover", "render", "photo", "photo", "full", "complete", slug.toLowerCase()]) {
    if (term && lower.includes(term)) score += 3;
  }
  for (const term of ["icon", "logo", "diagram", "schematic", "naming", "banner", "badge", "circuit", "pinout"]) {
    if (lower.includes(term)) score -= 4;
  }
  score += Math.min(3, Math.floor(Math.log2(Math.max(size, 1)) / 8));
  return score;
}

async function main(): Promise<void> {
  const images = await query<ImageRow>(`SELECT p.slug, f.id AS file_id, f.original_name AS name, f.size_bytes AS size
    FROM projects p JOIN project_files pf ON pf.project_id = p.id JOIN files f ON f.id = pf.file_id
    WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL AND f.kind = 'image'`);

  const bySlug = new Map<string, ImageRow[]>();
  for (const row of images) {
    const list = bySlug.get(row.slug) ?? [];
    list.push(row);
    bySlug.set(row.slug, list);
  }

  const projects = await query<ProjectRow>(`SELECT p.id, p.slug, pv.id AS version_id, pv.rpps_json
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL`);

  const statements: string[] = [];
  let updated = 0;
  for (const project of projects) {
    const candidates = bySlug.get(project.slug) ?? [];
    if (candidates.length === 0) continue;
    let rpps: Record<string, unknown>;
    try {
      rpps = JSON.parse(project.rpps_json);
    } catch {
      continue;
    }
    const current = String(rpps.cover_image_url ?? "");
    // Only replace GitHub opengraph / empty covers; keep curated R2 covers.
    if (current && !current.includes("opengraph.githubassets.com")) continue;
    candidates.sort((a, b) => scoreImage(b.name, project.slug, b.size) - scoreImage(a.name, project.slug, a.size));
    const best = candidates[0];
    const contentUrl = `/api/v1/files/content?id=${encodeId(best.file_id)}`;
    const next = { ...(rpps ?? {}), cover_image_url: contentUrl };
    statements.push(`UPDATE project_versions SET rpps_json = '${sq(JSON.stringify(next))}' WHERE id = '${project.version_id}';`);
    updated += 1;
  }

  console.log(`physical designs: ${projects.length}, with images: ${bySlug.size}, replacing opengraph covers: ${updated}`);
  if (!statements.length || !apply) {
    console.log(apply ? "nothing to write" : "DRY RUN ONLY. Add --apply to execute.");
    return;
  }
  const { writeFileSync } = await import("node:fs");
  const sqlPath = `/tmp/backfill-cover-photos-${targetEnv}.sql`;
  writeFileSync(sqlPath, `${statements.join("\n")}\n`);
  const { stdout } = await exec("node_modules/.bin/wrangler",
    ["d1", "execute", "DB", "--env", targetEnv!, "--remote", "--file", sqlPath],
    { env: process.env, maxBuffer: 64 * 1024 * 1024 });
  console.log(stdout.slice(0, 300));
  console.log(`done: replaced ${updated} cover images with model photos`);
}

main().catch((error) => { console.error(error); process.exit(1); });
