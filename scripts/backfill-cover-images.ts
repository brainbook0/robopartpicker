/**
 * Backfill cover images for projects that have a GitHub repo but no cover image.
 *
 * Uses GitHub's opengraph image (https://opengraph.githubassets.com/1/<owner>/<repo>)
 * which serves a real, stable image for any public repo. Idempotent: only updates
 * projects whose RPPS JSON lacks a cover_image_url.
 *
 * Usage: tsx scripts/backfill-cover-images.ts --env production|preview [--apply]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const targetEnv = envIndex >= 0 ? args[envIndex + 1] : undefined;
const apply = args.includes("--apply");

if (targetEnv !== "production" && targetEnv !== "preview") {
  console.error("Usage: tsx scripts/backfill-cover-images.ts --env production|preview [--apply]");
  process.exit(2);
}

function sq(value: string): string {
  return value.replace(/'/g, "''");
}

function opengraphImage(repoUrl: string): string | null {
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/u);
  if (!match) return null;
  return `https://opengraph.githubassets.com/1/${match[1]}/${match[2]}`;
}

async function query<T>(sql: string): Promise<T[]> {
  const { stdout } = await exec("node_modules/.bin/wrangler",
    ["d1", "execute", "DB", "--env", targetEnv!, "--remote", "--json", "--command", sql],
    { env: process.env, maxBuffer: 32 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as Array<{ results?: T[] }>;
  return parsed.flatMap((page) => page.results ?? []);
}

type Row = { id: string; slug: string; repository_url: string | null; version_id: string; rpps_json: string };

async function main(): Promise<void> {
  const rows = await query<Row>(`SELECT p.id, p.slug, p.repository_url, pv.id AS version_id, pv.rpps_json
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.deleted_at IS NULL AND p.repository_url LIKE 'https://github.com/%'`);

  const statements: string[] = [];
  let updated = 0;
  for (const row of rows) {
    if (!row.repository_url) continue;
    let rpps: Record<string, unknown>;
    try {
      rpps = JSON.parse(row.rpps_json);
    } catch {
      continue;
    }
    if (rpps && typeof rpps === "object" && (rpps.cover_image_url as string | undefined | null)) continue;
    const image = opengraphImage(row.repository_url);
    if (!image) continue;
    const next = { ...(rpps ?? {}), cover_image_url: image };
    statements.push(`UPDATE project_versions SET rpps_json = '${sq(JSON.stringify(next))}' WHERE id = '${row.version_id}';`);
    updated += 1;
  }

  console.log(`projects with repo: ${rows.length}, missing cover image: ${updated}`);
  if (!statements.length) {
    console.log("nothing to write");
    return;
  }
  if (!apply) {
    console.log(`DRY RUN ONLY. ${statements.length} statements would update ${updated} projects. Add --apply to execute.`);
    return;
  }
  const { stdout, stderr } = await exec("node_modules/.bin/wrangler",
    ["d1", "execute", "DB", "--env", targetEnv!, "--remote", "--command", statements.join("\n")],
    { env: process.env, maxBuffer: 64 * 1024 * 1024 });
  console.log(stdout.slice(0, 400));
  if (stderr) console.log("stderr:", stderr.slice(0, 400));
  console.log(`done: backfilled ${updated} cover images`);
}

main().catch((error) => { console.error(error); process.exit(1); });
