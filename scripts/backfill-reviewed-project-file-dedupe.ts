import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildReviewedProjectFileDedupeForwardSql,
  buildReviewedProjectFileDedupeRollbackSql,
  validateReviewedProjectFileDedupeWave,
  type ReviewedProjectFileDedupeDecision,
  type ReviewedProjectFileDedupeWave,
  type ReviewedProjectFileLink,
  type ReviewedProjectMediaRelink,
} from "../src/lib/reviewed-project-file-dedupe";
import { sqlString } from "../src/lib/physical-design-wave-import";

type EnvName = "production" | "preview";
type ProjectRow = { id: string; slug: string; current_version_id: string };
type FileRow = {
  id: string;
  object_key: string;
  original_name: string;
  media_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  kind: string;
  status: string;
  visibility: string;
  deleted_at: string | null;
};
type LinkRow = {
  project_id: string;
  project_version_id: string | null;
  file_id: string;
  purpose: string;
  relative_path: string | null;
  created_at: string;
};
type MediaRow = {
  id: string;
  project_id: string;
  file_id: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
};
type CatalogState = {
  projects: Map<string, ProjectRow>;
  files: Map<string, FileRow>;
  links: LinkRow[];
  media: MediaRow[];
};

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : undefined;
const waveIndex = args.indexOf("--wave");
const wavePath = resolve(waveIndex >= 0 ? args[waveIndex + 1] : "data/project-waves/2026-08-20-reviewed-project-file-dedupe.json");
const apply = args.includes("--apply");
const scratch = process.env.JCODE_SCRATCH_DIR;
if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/backfill-reviewed-project-file-dedupe.ts --env production|preview [--wave path] [--apply]");
  process.exit(2);
}
if (!scratch) {
  console.error("JCODE_SCRATCH_DIR is required so SQL, rollback, and reports stay outside the repository.");
  process.exit(2);
}
if (apply && env === "production" && process.env.ALLOW_PRODUCTION_PROJECT_FILE_DEDUPE !== "1") {
  console.error("Production apply is blocked. Set ALLOW_PRODUCTION_PROJECT_FILE_DEDUPE=1 only after reviewing the checked-in wave, dry run, SQL, and rollback.");
  process.exit(2);
}

const wave = JSON.parse(readFileSync(wavePath, "utf8")) as ReviewedProjectFileDedupeWave;
const validationErrors = validateReviewedProjectFileDedupeWave(wave);
if (validationErrors.length) throw new Error(`Invalid reviewed project file dedupe wave:\n${validationErrors.join("\n")}`);

function credentialsEnvironment(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  try {
    const credentials = readFileSync("/root/.cloudflare/credentials", "utf8");
    for (const line of credentials.split("\n")) {
      const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/u);
      if (match) childEnv[match[1]] = match[2];
    }
  } catch {
    // Wrangler may already have credentials from the caller.
  }
  childEnv.CLOUDFLARE_API_TOKEN ??= childEnv.CF_API_TOKEN;
  childEnv.CLOUDFLARE_ACCOUNT_ID ??= childEnv.CF_ACCOUNT_ID;
  childEnv.CLOUDFLARE_EMAIL ??= childEnv.CF_EMAIL;
  delete childEnv.CF_API_TOKEN;
  delete childEnv.CF_ACCOUNT_ID;
  delete childEnv.CF_EMAIL;
  return childEnv;
}

const childEnv = credentialsEnvironment();
function wranglerRows(command: string): Array<Record<string, unknown>> {
  const output = execFileSync("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env!, "--remote", "--command", command, "--json", "--yes",
  ], {
    cwd: process.cwd(),
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed.flatMap((page) => page.results ?? []);
}

function executeSqlFile(path: string): void {
  execFileSync("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env!, "--remote", "--file", path, "--yes",
  ], {
    cwd: process.cwd(),
    env: childEnv,
    maxBuffer: 64 * 1024 * 1024,
    stdio: "inherit",
  });
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function loadCatalogState(): CatalogState {
  const projectIds = [...new Set(wave.decisions.map((decision) => decision.project_id))];
  const fileIds = [...new Set(wave.decisions.flatMap((decision) => [decision.keep.file_id, decision.drop.file_id]))];
  const projectRows = wranglerRows(`SELECT id, slug, current_version_id FROM projects WHERE deleted_at IS NULL AND id IN (${projectIds.map(sqlString).join(", ")})`) as unknown as ProjectRow[];
  const linkRows = wranglerRows(`SELECT project_id, project_version_id, file_id, purpose, relative_path, created_at FROM project_files WHERE project_id IN (${projectIds.map(sqlString).join(", ")})`) as unknown as LinkRow[];
  const mediaRows = wranglerRows(`SELECT id, project_id, file_id, caption, alt_text, sort_order, created_at FROM project_media WHERE project_id IN (${projectIds.map(sqlString).join(", ")})`) as unknown as MediaRow[];
  const fileRows = chunks(fileIds, 80).flatMap((ids) => wranglerRows(`SELECT id, object_key, original_name, media_type, size_bytes, checksum_sha256, kind, status, visibility, deleted_at FROM files WHERE id IN (${ids.map(sqlString).join(", ")})`)) as unknown as FileRow[];
  return {
    projects: new Map(projectRows.map((row) => [row.id, row])),
    files: new Map(fileRows.map((row) => [row.id, row])),
    links: linkRows,
    media: mediaRows,
  };
}

function exactFile(row: FileRow | undefined, expected: ReviewedProjectFileLink): boolean {
  return Boolean(row)
    && row!.id === expected.file_id
    && row!.object_key === expected.object_key
    && row!.original_name === expected.original_name
    && row!.media_type === expected.media_type
    && Number(row!.size_bytes) === expected.size_bytes
    && row!.checksum_sha256 === expected.checksum_sha256
    && row!.kind === expected.kind
    && row!.status === expected.status
    && row!.visibility === expected.visibility
    && row!.deleted_at === null;
}

function exactLink(row: LinkRow | undefined, expected: ReviewedProjectFileLink): boolean {
  return Boolean(row)
    && row!.project_id === expected.project_id
    && row!.project_version_id === expected.project_version_id
    && row!.file_id === expected.file_id
    && row!.purpose === expected.purpose
    && row!.relative_path === expected.relative_path
    && row!.created_at === expected.created_at;
}

function exactMedia(row: MediaRow | undefined, expected: ReviewedProjectMediaRelink, fileId: string): boolean {
  return Boolean(row)
    && row!.id === expected.id
    && row!.project_id === expected.project_id
    && row!.file_id === fileId
    && row!.caption === expected.caption
    && row!.alt_text === expected.alt_text
    && Number(row!.sort_order) === expected.sort_order
    && row!.created_at === expected.created_at;
}

function decisionState(state: CatalogState, decision: ReviewedProjectFileDedupeDecision): "pristine" | "applied" {
  const project = state.projects.get(decision.project_id);
  if (!project || project.slug !== decision.slug || project.current_version_id !== decision.project_version_id) {
    throw new Error(`${decision.slug}/${decision.path_key}: project identity changed`);
  }
  if (!exactFile(state.files.get(decision.keep.file_id), decision.keep)) throw new Error(`${decision.slug}/${decision.path_key}: canonical file record changed`);
  if (!exactFile(state.files.get(decision.drop.file_id), decision.drop)) throw new Error(`${decision.slug}/${decision.path_key}: redundant file record changed`);
  const pathLinks = state.links.filter((row) => row.project_id === decision.project_id && row.relative_path?.toLowerCase() === decision.path_key);
  const keepLinks = pathLinks.filter((row) => row.file_id === decision.keep.file_id);
  const dropLinks = pathLinks.filter((row) => row.file_id === decision.drop.file_id);
  const unexpected = pathLinks.filter((row) => row.file_id !== decision.keep.file_id && row.file_id !== decision.drop.file_id);
  if (unexpected.length) throw new Error(`${decision.slug}/${decision.path_key}: unexpected third path link`);
  const keepExact = keepLinks.length === 1 && exactLink(keepLinks[0], decision.keep);
  const dropExact = dropLinks.length === 1 && exactLink(dropLinks[0], decision.drop);
  if (!keepExact) throw new Error(`${decision.slug}/${decision.path_key}: canonical project link changed`);
  const mediaRows = state.media.filter((row) => decision.media_relinks.some((media) => media.id === row.id));
  const mediaPristine = decision.media_relinks.every((media) => exactMedia(mediaRows.find((row) => row.id === media.id), media, media.old_file_id));
  const mediaApplied = decision.media_relinks.every((media) => exactMedia(mediaRows.find((row) => row.id === media.id), media, media.new_file_id));
  const otherDropMedia = state.media.filter((row) => row.project_id === decision.project_id && row.file_id === decision.drop.file_id && !decision.media_relinks.some((media) => media.id === row.id));
  if (otherDropMedia.length) throw new Error(`${decision.slug}/${decision.path_key}: unreviewed media reference depends on redundant file`);
  if (dropExact && pathLinks.length === 2 && mediaPristine) return "pristine";
  if (dropLinks.length === 0 && pathLinks.length === 1 && mediaApplied) return "applied";
  throw new Error(`${decision.slug}/${decision.path_key}: state is neither pristine nor exactly applied`);
}

async function verifyPinnedSources(decisions: ReviewedProjectFileDedupeDecision[]): Promise<number> {
  let verified = 0;
  for (const decision of decisions) {
    if (decision.source.mode === "managed_exact_duplicate") {
      verified += 1;
      continue;
    }
    const response = await fetch(`${decision.source.source_url}?verify=${Date.now()}`, { headers: { accept: "application/octet-stream" } });
    if (!response.ok) throw new Error(`${decision.slug}/${decision.path_key}: pinned source returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== decision.source.size_bytes || digest !== decision.source.checksum_sha256) {
      throw new Error(`${decision.slug}/${decision.path_key}: pinned source bytes changed`);
    }
    verified += 1;
  }
  return verified;
}

function globalDuplicateCount(): number {
  const rows = wranglerRows(`SELECT COUNT(*) AS value FROM (
    SELECT pf.project_id, lower(pf.relative_path) AS path_key
    FROM project_files pf JOIN projects p ON p.id = pf.project_id JOIN files f ON f.id = pf.file_id
    WHERE p.deleted_at IS NULL AND f.deleted_at IS NULL AND pf.relative_path IS NOT NULL
      AND (pf.project_version_id IS NULL OR pf.project_version_id = p.current_version_id)
    GROUP BY pf.project_id, lower(pf.relative_path) HAVING COUNT(*) > 1)`);
  return Number(rows[0]?.value ?? -1);
}

function verifyStates(expected: "pristine" | "applied", decisions: ReviewedProjectFileDedupeDecision[]): void {
  const state = loadCatalogState();
  for (const decision of decisions) {
    const actual = decisionState(state, decision);
    if (actual !== expected) throw new Error(`${decision.slug}/${decision.path_key}: expected ${expected}, found ${actual}`);
  }
}

mkdirSync(scratch, { recursive: true });
const now = new Date().toISOString();
const stamp = now.replace(/[:.]/gu, "-");
const initialState = loadCatalogState();
const prepared: ReviewedProjectFileDedupeDecision[] = [];
const alreadyApplied: ReviewedProjectFileDedupeDecision[] = [];
for (const decision of wave.decisions) {
  const state = decisionState(initialState, decision);
  if (state === "pristine") prepared.push(decision);
  else alreadyApplied.push(decision);
}
const sourceVerified = await verifyPinnedSources(wave.decisions);
const decisionBatches = chunks(prepared, 60);
const forwardPaths: string[] = [];
const rollbackPaths: string[] = [];
for (const [index, batch] of decisionBatches.entries()) {
  const suffix = String(index + 1).padStart(3, "0");
  const forwardPath = join(scratch, `reviewed-project-file-dedupe-${env}-${stamp}-part-${suffix}.sql`);
  const rollbackPath = join(scratch, `rollback-reviewed-project-file-dedupe-${env}-${stamp}-part-${suffix}.sql`);
  writeFileSync(forwardPath, buildReviewedProjectFileDedupeForwardSql(batch, wave.wave));
  writeFileSync(rollbackPath, buildReviewedProjectFileDedupeRollbackSql(batch, wave.wave));
  forwardPaths.push(forwardPath);
  rollbackPaths.push(rollbackPath);
}
const reportPath = join(scratch, `reviewed-project-file-dedupe-${env}-${stamp}.json`);
const report = {
  mode: apply ? "apply" : "dry-run",
  env,
  wave: wave.wave,
  reviewedAt: wave.reviewed_at,
  waveDecisions: wave.decisions.length,
  sourceVerified,
  prepared: prepared.length,
  alreadyApplied: alreadyApplied.length,
  mediaRelinks: prepared.reduce((total, decision) => total + decision.media_relinks.length, 0),
  forwardSql: forwardPaths,
  rollbackSql: rollbackPaths,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));

if (!apply) {
  console.log("Dry run complete. Exact project, link, file, checksum, and media guards were generated. No D1 or R2 writes were performed.");
  process.exit(0);
}
if (prepared.length === 0) {
  if (globalDuplicateCount() !== 0) throw new Error("The reviewed wave is applied, but unreviewed duplicate project-file paths remain");
  console.log("The exact reviewed project-file dedupe wave is already applied. No writes were needed.");
  process.exit(0);
}

const attemptedBatches: number[] = [];
try {
  for (const [index, path] of forwardPaths.entries()) {
    attemptedBatches.push(index);
    executeSqlFile(path);
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: forwardPaths.length, unit: "dedupe SQL batches", message: `${Math.min((index + 1) * 60, prepared.length)}/${prepared.length} decisions applied` })}`);
  }
  verifyStates("applied", prepared);
  const remainingDuplicates = globalDuplicateCount();
  if (remainingDuplicates !== 0) throw new Error(`postflight found ${remainingDuplicates} duplicate project-file path groups`);
  console.log(JSON.stringify({ applied: prepared.length, alreadyApplied: alreadyApplied.length, sourceVerified, remainingDuplicates, report: reportPath, rollback: rollbackPaths }, null, 2));
} catch (error) {
  let rollbackError: unknown = null;
  try {
    for (const index of [...attemptedBatches].reverse()) executeSqlFile(rollbackPaths[index]);
    verifyStates("pristine", prepared);
  } catch (caught) {
    rollbackError = caught;
  }
  const originalMessage = error instanceof Error ? error.message : String(error);
  const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : rollbackError ? String(rollbackError) : "rollback verified";
  throw new Error(`Reviewed project-file dedupe failed: ${originalMessage}; ${rollbackMessage}`);
}
