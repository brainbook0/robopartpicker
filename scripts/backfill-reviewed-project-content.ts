import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stableId as entityStableId, sqlString } from "../src/lib/physical-design-wave-import";
import {
  buildReviewedProjectContentForwardSql,
  buildReviewedProjectContentRollbackSql,
  canonicalRepo,
  immutableBlobUrl,
  prepareProjectSteps,
  reviewedCoverFileId,
  reviewedMediaId,
  validateReviewedProjectContentWave,
  type PreparedReviewedProjectContent,
  type ReviewedProjectContentDefinition,
  type ReviewedProjectContentRow,
  type ReviewedProjectContentWave,
} from "../src/lib/reviewed-project-content";
import { validateRpps, type RppsPackage } from "../src/lib/rpps/schema";

type EnvName = "production" | "preview";
type CatalogRow = ReviewedProjectContentRow & {
  project_kind: string;
  step_count: number;
  media_count: number;
};
type CoverFileRow = {
  id: string;
  project_id: string;
  project_version_id: string | null;
  relative_path: string | null;
  media_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  visibility: string;
  status: string;
  kind: string;
};

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : undefined;
const waveIndex = args.indexOf("--wave");
const wavePath = waveIndex >= 0 ? args[waveIndex + 1] : "data/project-waves/2026-08-14-reviewed-content-wave1.json";
const apply = args.includes("--apply");
const scratch = process.env.JCODE_SCRATCH_DIR;

if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/backfill-reviewed-project-content.ts --env production|preview [--wave data/project-waves/2026-08-14-reviewed-content-wave1.json] [--apply]");
  process.exit(2);
}
if (!scratch) {
  console.error("JCODE_SCRATCH_DIR is required so generated SQL and rollback files remain reviewable outside the repository.");
  process.exit(2);
}
if (apply && env === "production" && process.env.ALLOW_PRODUCTION_REVIEWED_PROJECT_CONTENT !== "1") {
  console.error("Production apply is blocked. Set ALLOW_PRODUCTION_REVIEWED_PROJECT_CONTENT=1 only after reviewing the dry run and generated SQL.");
  process.exit(2);
}

const wave = JSON.parse(readFileSync(resolve(wavePath), "utf8")) as ReviewedProjectContentWave;
const definitionErrors = validateReviewedProjectContentWave(wave);
if (definitionErrors.length) throw new Error(`Invalid reviewed project content wave:\n${definitionErrors.join("\n")}`);

function credentialsEnvironment(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  try {
    const credentials = readFileSync("/root/.cloudflare/credentials", "utf8");
    for (const line of credentials.split("\n")) {
      const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/u);
      if (match) childEnv[match[1]] = match[2];
    }
  } catch {
    // Wrangler may already have credentials through the caller's environment.
  }
  childEnv.CLOUDFLARE_API_TOKEN ??= childEnv.CF_API_TOKEN;
  childEnv.CLOUDFLARE_ACCOUNT_ID ??= childEnv.CF_ACCOUNT_ID;
  return childEnv;
}

const childEnv = credentialsEnvironment();

function wrangler(command: string): Array<Record<string, unknown>> {
  const output = execFileSync("node_modules/.bin/wrangler", ["d1", "execute", "DB", "--env", env!, "--remote", "--command", command, "--json"], {
    cwd: process.cwd(),
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed.flatMap((page) => page.results ?? []);
}

function loadCatalogRows(): CatalogRow[] {
  const slugs = wave.projects.map((project) => sqlString(project.project_id)).join(", ");
  const sql = `SELECT p.id, p.slug, p.name, p.summary, p.description, p.repository_url, p.revision, p.updated_at, p.current_version_id, p.project_kind, pv.rpps_json,
    (SELECT COUNT(*) FROM project_steps ps WHERE ps.project_version_id = p.current_version_id) AS step_count,
    (SELECT COUNT(*) FROM project_media pm WHERE pm.project_id = p.id) AS media_count
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.deleted_at IS NULL AND p.slug IN (${slugs}) ORDER BY p.slug`;
  return wrangler(sql) as unknown as CatalogRow[];
}

function loadCoverFile(definition: ReviewedProjectContentDefinition, row: CatalogRow): CoverFileRow {
  const fileId = reviewedCoverFileId(definition);
  const result = wrangler(`SELECT f.id, pf.project_id, pf.project_version_id, pf.relative_path, f.media_type, f.size_bytes, f.checksum_sha256, f.visibility, f.status, f.kind
    FROM files f JOIN project_files pf ON pf.file_id = f.id
    WHERE f.id = ${sqlString(fileId)} AND pf.project_id = ${sqlString(row.id)} AND f.deleted_at IS NULL`);
  if (result.length !== 1) throw new Error(`${definition.project_id}: reviewed cover artifact ${fileId} is not linked exactly once; apply the catalog completeness manifest first`);
  return result[0] as unknown as CoverFileRow;
}

function cloneAndVerify(definition: ReviewedProjectContentDefinition, root: string): Map<string, Uint8Array> {
  const directory = join(root, definition.project_id.replace(/[^a-z0-9._-]/giu, "-"));
  execFileSync("git", ["clone", "--mirror", "--filter=blob:none", "--quiet", definition.repo_url, directory], { stdio: "inherit" });
  const actualRevision = execFileSync("git", ["-C", directory, "rev-parse", definition.revision], { encoding: "utf8" }).trim();
  if (actualRevision.toLowerCase() !== definition.revision.toLowerCase()) throw new Error(`${definition.project_id}: revision mismatch ${actualRevision}`);
  const expected = new Map<string, string>([
    [definition.docs_path, definition.docs_sha256],
    [definition.assembly_source.path, definition.assembly_source.sha256],
    [definition.cover.path, definition.cover.sha256],
  ]);
  const files = new Map<string, Uint8Array>();
  for (const [path, sha256] of expected) {
    const bytes = execFileSync("git", ["-C", directory, "show", `${definition.revision}:${path}`]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== sha256) throw new Error(`${definition.project_id}/${path}: sha256 ${digest} != ${sha256}`);
    files.set(path, new Uint8Array(bytes));
  }
  const cover = files.get(definition.cover.path);
  if (cover?.byteLength !== definition.cover.size_bytes) throw new Error(`${definition.project_id}/${definition.cover.path}: size ${cover?.byteLength ?? 0} != ${definition.cover.size_bytes}`);
  return files;
}

function publicOrigin(environment: EnvName): string {
  return environment === "production"
    ? "https://robopartpicker-production.ludomi2502.workers.dev"
    : "https://robopartpicker-preview.ludomi2502.workers.dev";
}

function prepareProject(
  definition: ReviewedProjectContentDefinition,
  row: CatalogRow,
  files: Map<string, Uint8Array>,
  retrievedAt: string,
): PreparedReviewedProjectContent {
  if (row.slug !== definition.project_id) throw new Error(`${definition.project_id}: slug mismatch`);
  if (row.project_kind !== "physical_design") throw new Error(`${definition.project_id}: expected physical_design, found ${row.project_kind}`);
  if (!row.current_version_id || !row.rpps_json) throw new Error(`${definition.project_id}: missing current version manifest`);
  if (canonicalRepo(row.repository_url ?? "") !== canonicalRepo(definition.repo_url)) throw new Error(`${definition.project_id}: repository mismatch ${row.repository_url}`);
  if ((row.revision ?? "").toLowerCase() !== definition.revision.toLowerCase()) throw new Error(`${definition.project_id}: catalog revision ${row.revision} does not match ${definition.revision}`);
  if (Number(row.step_count) !== 0) throw new Error(`${definition.project_id}: ${row.step_count} normalized project steps already exist; refusing to overwrite`);
  if (Number(row.media_count) !== 0) throw new Error(`${definition.project_id}: ${row.media_count} project media rows already exist; refusing to overwrite`);

  const coverFile = loadCoverFile(definition, row);
  if (coverFile.project_version_id !== row.current_version_id) throw new Error(`${definition.project_id}: cover is linked to unexpected project version ${coverFile.project_version_id}`);
  if (coverFile.relative_path !== definition.cover.path) throw new Error(`${definition.project_id}: cover relative path mismatch ${coverFile.relative_path}`);
  if (coverFile.media_type !== "image/png" || coverFile.kind !== "image") throw new Error(`${definition.project_id}: cover must be a PNG image artifact`);
  if (coverFile.status !== "ready" || coverFile.visibility !== "public") throw new Error(`${definition.project_id}: cover artifact must be public and ready`);
  if (Number(coverFile.size_bytes) !== definition.cover.size_bytes || coverFile.checksum_sha256 !== definition.cover.sha256) throw new Error(`${definition.project_id}: cover artifact bytes do not match reviewed source`);

  const assemblyBytes = files.get(definition.assembly_source.path);
  if (!assemblyBytes) throw new Error(`${definition.project_id}: assembly source was not loaded`);
  const steps = prepareProjectSteps(wave, definition, new TextDecoder().decode(assemblyBytes));
  const coverFileId = reviewedCoverFileId(definition);
  const coverUrl = `${publicOrigin(env!)}/api/v1/files/${encodeURIComponent(coverFileId)}/content`;
  const original = JSON.parse(row.rpps_json) as RppsPackage;
  if (canonicalRepo(original.repo_url ?? "") !== canonicalRepo(definition.repo_url)) throw new Error(`${definition.project_id}: portable manifest repository mismatch ${original.repo_url}`);
  const priorEvidence = Array.isArray(original.evidence) ? original.evidence : [];
  const nextRpps = {
    ...original,
    name: definition.name,
    summary: definition.summary,
    description: definition.description,
    docs_url: immutableBlobUrl(definition, definition.docs_path),
    cover_image_url: coverUrl,
    assembly: steps.map((step) => ({ id: step.step_key, title: step.title, body: step.body })),
    evidence: [
      ...priorEvidence,
      {
        claim: `Project overview and identity were reviewed against ${definition.docs_path} at immutable revision ${definition.revision}.`,
        source_type: "repo" as const,
        source_url: immutableBlobUrl(definition, definition.docs_path),
        retrieved_at: retrievedAt,
        confidence: 0.98,
      },
      {
        claim: `${steps.length} assembly sections were extracted from the official assembly guide at immutable revision ${definition.revision}.`,
        source_type: "repo" as const,
        source_url: immutableBlobUrl(definition, definition.assembly_source.path),
        retrieved_at: retrievedAt,
        confidence: 0.98,
      },
      {
        claim: `The project cover is an official repository image verified by SHA-256 ${definition.cover.sha256}.`,
        source_type: "repo" as const,
        source_url: immutableBlobUrl(definition, definition.cover.path),
        retrieved_at: retrievedAt,
        confidence: 0.98,
      },
    ],
  };
  const validation = validateRpps(nextRpps);
  if (!validation.ok) throw new Error(`${definition.project_id}: generated RPPS failed validation: ${validation.errors.join("; ")}`);

  return {
    definition,
    row,
    nextRppsJson: JSON.stringify(validation.data),
    coverFileId,
    coverUrl,
    mediaId: reviewedMediaId(row.id, coverFileId, wave.wave),
    evidenceId: entityStableId("evidence", `${row.id}:${definition.revision}:${definition.assembly_source.path}:content`),
    evidenceClaimId: entityStableId("eclaim", `${row.id}:${definition.revision}:${definition.assembly_source.path}:content-source`),
    steps,
  };
}

function writeArtifacts(projects: PreparedReviewedProjectContent[], now: string): { sqlPath: string; rollbackPath: string; reportPath: string } {
  const stamp = now.replace(/[:.]/gu, "-");
  const sqlPath = join(scratch!, `reviewed-project-content-${env}-${stamp}.sql`);
  const rollbackPath = join(scratch!, `rollback-reviewed-project-content-${env}-${stamp}.sql`);
  const reportPath = join(scratch!, `reviewed-project-content-${env}-${stamp}.json`);
  writeFileSync(sqlPath, buildReviewedProjectContentForwardSql(projects, wave.wave, now));
  writeFileSync(rollbackPath, buildReviewedProjectContentRollbackSql(projects, wave.wave, now));
  writeFileSync(reportPath, `${JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    env,
    wave: wave.wave,
    projects: projects.map((project) => ({
      slug: project.row.slug,
      priorName: project.row.name,
      nextName: project.definition.name,
      coverFileId: project.coverFileId,
      coverUrl: project.coverUrl,
      steps: project.steps.length,
      docsUrl: immutableBlobUrl(project.definition, project.definition.docs_path),
      assemblySource: immutableBlobUrl(project.definition, project.definition.assembly_source.path),
    })),
    sql: sqlPath,
    rollback: rollbackPath,
  }, null, 2)}\n`);
  return { sqlPath, rollbackPath, reportPath };
}

function executeSqlFile(path: string): void {
  execFileSync("node_modules/.bin/wrangler", ["d1", "execute", "DB", "--env", env!, "--remote", "--file", path], {
    cwd: process.cwd(),
    env: childEnv,
    maxBuffer: 64 * 1024 * 1024,
    stdio: "inherit",
  });
}

function verifyApplied(projects: PreparedReviewedProjectContent[], now: string): void {
  for (const project of projects) {
    const result = wrangler(`SELECT p.name, p.summary, p.description, p.updated_at, pv.rpps_json,
      (SELECT COUNT(*) FROM project_steps ps WHERE ps.project_version_id = p.current_version_id) AS step_count,
      (SELECT COUNT(*) FROM project_media pm WHERE pm.project_id = p.id AND pm.id = ${sqlString(project.mediaId)} AND pm.file_id = ${sqlString(project.coverFileId)}) AS media_count,
      (SELECT COUNT(*) FROM evidence e WHERE e.id = ${sqlString(project.evidenceId)} AND e.created_at = ${sqlString(now)}) AS evidence_count,
      (SELECT COUNT(*) FROM evidence_claims ec WHERE ec.id = ${sqlString(project.evidenceClaimId)} AND ec.evidence_id = ${sqlString(project.evidenceId)}) AS claim_count
      FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(project.row.id)}`);
    if (result.length !== 1) throw new Error(`${project.row.slug}: postflight project row missing`);
    const row = result[0];
    if (row.name !== project.definition.name || row.summary !== project.definition.summary || row.description !== project.definition.description || row.updated_at !== now) {
      throw new Error(`${project.row.slug}: postflight project content mismatch`);
    }
    if (row.rpps_json !== project.nextRppsJson) throw new Error(`${project.row.slug}: postflight RPPS mismatch`);
    if (Number(row.step_count) !== project.steps.length || Number(row.media_count) !== 1 || Number(row.evidence_count) !== 1 || Number(row.claim_count) !== 1) {
      throw new Error(`${project.row.slug}: postflight normalized counts mismatch`);
    }
  }
}

mkdirSync(scratch, { recursive: true });
const now = new Date().toISOString();
const tempRoot = mkdtempSync(join(scratch, "reviewed-project-content-"));
try {
  const rows = loadCatalogRows();
  if (rows.length !== wave.projects.length) {
    const found = new Set(rows.map((row) => row.slug));
    throw new Error(`Expected ${wave.projects.length} catalog projects, found ${rows.length}; missing ${wave.projects.filter((project) => !found.has(project.project_id)).map((project) => project.project_id).join(", ")}`);
  }
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const prepared = wave.projects.map((definition) => {
    const row = bySlug.get(definition.project_id);
    if (!row) throw new Error(`${definition.project_id}: project not found`);
    return prepareProject(definition, row, cloneAndVerify(definition, tempRoot), now);
  });
  const artifacts = writeArtifacts(prepared, now);
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    env,
    wave: wave.wave,
    totals: { projects: prepared.length, steps: prepared.reduce((sum, project) => sum + project.steps.length, 0), media: prepared.length },
    ...artifacts,
  }, null, 2));
  if (!apply) {
    console.log("Dry run only. No D1 writes were performed.");
  } else {
    executeSqlFile(artifacts.sqlPath);
    verifyApplied(prepared, now);
    console.log(JSON.stringify({ applied: true, verifiedProjects: prepared.length, rollback: artifacts.rollbackPath }, null, 2));
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
