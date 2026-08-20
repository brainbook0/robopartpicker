import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  buildReviewedProjectArtifactForwardSql,
  buildReviewedProjectArtifactRollbackSql,
  reviewedArtifactContentUrl,
  reviewedArtifactEvidenceClaimId,
  reviewedArtifactEvidenceId,
  reviewedArtifactFileId,
  reviewedArtifactObjectKey,
  reviewedArtifactSourceDownloadUrl,
  reviewedArtifactSourcePageUrl,
  serializeReviewedProjectArtifactRpps,
  validateReviewedProjectArtifactWave,
  type PreparedReviewedProjectArtifact,
  type ReviewedProjectArtifactDefinition,
  type ReviewedProjectArtifactRow,
  type ReviewedProjectArtifactWave,
} from "../src/lib/reviewed-project-artifacts";
import { sqlString } from "../src/lib/physical-design-wave-import";
import { normalizeRppsForWrite, type RppsPackage } from "../src/lib/rpps/schema";

type EnvName = "production" | "preview";
type ExactState = {
  file_count: number;
  project_file_count: number;
  evidence_count: number;
  claim_count: number;
  path_conflict_count: number;
};
type VerifiedSource = { definition: ReviewedProjectArtifactDefinition; path: string };
type R2Head = { size: number; sha256: string | null; contentType: string | null };

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : undefined;
const waveIndex = args.indexOf("--wave");
const wavePath = waveIndex >= 0 ? args[waveIndex + 1] : "data/project-waves/2026-08-20-reviewed-project-artifacts.json";
const apply = args.includes("--apply");
const scratch = process.env.JCODE_SCRATCH_DIR;
const r2Python = process.env.R2_PYTHON ?? "/root/.jcode/scratch/r2-venv/bin/python";
const buckets: Record<EnvName, string> = {
  production: "robopartpicker-files",
  preview: "robopartpicker-preview-files",
};

if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/backfill-reviewed-project-artifacts.ts --env production|preview [--wave data/project-waves/2026-08-20-reviewed-project-artifacts.json] [--apply]");
  process.exit(2);
}
if (!scratch) {
  console.error("JCODE_SCRATCH_DIR is required so generated SQL, rollback, and verification artifacts stay outside the repository.");
  process.exit(2);
}
if (apply && env === "production" && process.env.ALLOW_PRODUCTION_PROJECT_ARTIFACTS !== "1") {
  console.error("Production apply is blocked. Set ALLOW_PRODUCTION_PROJECT_ARTIFACTS=1 only after reviewing the dry run, source hashes, SQL, and rollback.");
  process.exit(2);
}

const wave = JSON.parse(readFileSync(resolve(wavePath), "utf8")) as ReviewedProjectArtifactWave;
const waveErrors = validateReviewedProjectArtifactWave(wave);
if (waveErrors.length) throw new Error(`Invalid reviewed project artifact wave:\n${waveErrors.join("\n")}`);

function credentialsEnvironment(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  try {
    const credentials = readFileSync("/root/.cloudflare/credentials", "utf8");
    for (const line of credentials.split("\n")) {
      const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/u);
      if (match) childEnv[match[1]] = match[2];
    }
  } catch {
    // Wrangler and the R2 helper may already have credentials from the caller.
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

function publicOrigin(environment: EnvName): string {
  return environment === "production"
    ? "https://robopartpicker-production.ludomi2502.workers.dev"
    : "https://robopartpicker-preview.ludomi2502.workers.dev";
}

function canonicalRepository(value: string): string {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\.git$/iu, "").replace(/\/+$/u, "").toLowerCase()}`;
}

function artifactKey(definition: ReviewedProjectArtifactDefinition): string {
  return `${definition.slug}\0${definition.path}`;
}

function loadCatalogRows(): ReviewedProjectArtifactRow[] {
  const slugs = [...new Set(wave.artifacts.map((artifact) => artifact.slug))];
  const rows = wranglerRows(`SELECT p.id, p.slug, p.owner_user_id, p.organization_id, p.visibility, p.status, p.project_kind, p.repository_url, p.revision, p.updated_at, p.current_version_id, pv.rpps_json
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.deleted_at IS NULL AND p.slug IN (${slugs.map(sqlString).join(", ")}) ORDER BY p.slug`);
  return rows as unknown as ReviewedProjectArtifactRow[];
}

function exactState(row: ReviewedProjectArtifactRow, definition: ReviewedProjectArtifactDefinition): ExactState {
  const fileId = reviewedArtifactFileId(wave.wave, definition);
  const evidenceId = reviewedArtifactEvidenceId(wave.wave, row.id, definition);
  const claimId = reviewedArtifactEvidenceClaimId(wave.wave, row.id, definition);
  const objectKey = reviewedArtifactObjectKey(wave.wave, definition);
  const result = wranglerRows(`SELECT
    (SELECT COUNT(*) FROM files f WHERE f.id = ${sqlString(fileId)} AND f.object_key = ${sqlString(objectKey)} AND f.checksum_sha256 = ${sqlString(definition.sha256)} AND f.media_type = ${sqlString(definition.media_type)} AND f.size_bytes = ${definition.size_bytes} AND f.visibility = 'public' AND f.status = 'ready' AND f.kind = ${sqlString(definition.file_kind)} AND f.deleted_at IS NULL) AS file_count,
    (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = ${sqlString(row.id)} AND pf.project_version_id = ${sqlString(row.current_version_id)} AND pf.file_id = ${sqlString(fileId)} AND pf.purpose = ${sqlString(definition.purpose)} AND pf.relative_path = ${sqlString(definition.path)}) AS project_file_count,
    (SELECT COUNT(*) FROM evidence e WHERE e.id = ${sqlString(evidenceId)} AND e.file_id = ${sqlString(fileId)} AND e.source_url = ${sqlString(reviewedArtifactSourcePageUrl(definition))} AND e.content_hash = ${sqlString(`sha256:${definition.sha256}`)}) AS evidence_count,
    (SELECT COUNT(*) FROM evidence_claims ec WHERE ec.id = ${sqlString(claimId)} AND ec.evidence_id = ${sqlString(evidenceId)} AND ec.entity_type = 'project' AND ec.entity_id = ${sqlString(row.id)} AND ec.claim_key = 'artifact.source') AS claim_count,
    (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = ${sqlString(row.id)} AND lower(pf.relative_path) = lower(${sqlString(definition.path)}) AND pf.file_id <> ${sqlString(fileId)}) AS path_conflict_count`);
  if (result.length !== 1) throw new Error(`${definition.slug}/${definition.path}: failed to inspect deterministic artifact state`);
  return result[0] as unknown as ExactState;
}

function prepareArtifact(
  definition: ReviewedProjectArtifactDefinition,
  row: ReviewedProjectArtifactRow,
  retrievedAt: string,
): { project: PreparedReviewedProjectArtifact | null; alreadyApplied: boolean } {
  if (row.slug !== definition.slug) throw new Error(`${definition.slug}: slug mismatch`);
  if (row.project_kind !== "physical_design") throw new Error(`${definition.slug}: expected physical_design, found ${row.project_kind}`);
  if (row.visibility !== "public" || row.status !== "published") throw new Error(`${definition.slug}: project must be public and published`);
  if (!row.current_version_id || !row.rpps_json) throw new Error(`${definition.slug}: missing current project version`);
  if (!row.owner_user_id && !row.organization_id) throw new Error(`${definition.slug}: project has no owner or organization for managed file ownership`);
  if (!row.repository_url || canonicalRepository(row.repository_url) !== canonicalRepository(definition.repository_url)) throw new Error(`${definition.slug}: repository identity changed`);
  if (row.revision !== definition.revision) throw new Error(`${definition.slug}: revision changed from ${definition.revision} to ${row.revision ?? "null"}`);

  const fileId = reviewedArtifactFileId(wave.wave, definition);
  const evidenceId = reviewedArtifactEvidenceId(wave.wave, row.id, definition);
  const evidenceClaimId = reviewedArtifactEvidenceClaimId(wave.wave, row.id, definition);
  const objectKey = reviewedArtifactObjectKey(wave.wave, definition);
  const originalName = basename(definition.path);
  const contentUrl = reviewedArtifactContentUrl(publicOrigin(env!), fileId);
  const sourcePageUrl = reviewedArtifactSourcePageUrl(definition);
  const sourceDownloadUrl = reviewedArtifactSourceDownloadUrl(definition);
  const state = exactState(row, definition);
  const exactApplied = [state.file_count, state.project_file_count, state.evidence_count, state.claim_count].every((count) => Number(count) === 1)
    && Number(state.path_conflict_count) === 0;
  const pristine = [state.file_count, state.project_file_count, state.evidence_count, state.claim_count, state.path_conflict_count].every((count) => Number(count) === 0);
  const current = normalizeRppsForWrite(
    JSON.parse(row.rpps_json),
    publicOrigin(env!),
  ) as RppsPackage & Record<string, unknown>;
  const currentFiles = Array.isArray(current.files) ? current.files : [];
  const matchingFile = currentFiles.find((file) => file.path.toLowerCase() === definition.path.toLowerCase());

  if (exactApplied && matchingFile?.url === contentUrl && matchingFile.kind === definition.rpps_kind) {
    return { project: null, alreadyApplied: true };
  }
  if (!pristine) throw new Error(`${definition.slug}/${definition.path}: artifact state is neither pristine nor the exact reviewed wave (${JSON.stringify(state)})`);
  if (matchingFile) throw new Error(`${definition.slug}/${definition.path}: RPPS already contains a conflicting artifact path`);

  const currentEvidence = Array.isArray(current.evidence) ? current.evidence : [];
  const nextRpps = {
    ...current,
    files: [
      ...currentFiles,
      { path: definition.path, kind: definition.rpps_kind, url: contentUrl, description: definition.description },
    ],
    evidence: [
      ...currentEvidence,
      {
        claim: `${definition.description} The artifact is pinned to revision ${definition.revision} and verified by SHA-256 ${definition.sha256}.`,
        source_type: "repo" as const,
        source_url: sourcePageUrl,
        retrieved_at: retrievedAt,
        confidence: 1,
      },
    ],
  };
  const nextRppsJson = serializeReviewedProjectArtifactRpps(nextRpps as unknown as Record<string, unknown>);
  const metadataJson = JSON.stringify({
    wave: wave.wave,
    reviewed: true,
    repositoryUrl: definition.repository_url,
    revision: definition.revision,
    sourcePath: definition.path,
    sourcePageUrl,
    sourceDownloadUrl,
    sha256: definition.sha256,
  });
  return {
    alreadyApplied: false,
    project: {
      definition,
      row,
      nextRppsJson,
      fileId,
      evidenceId,
      evidenceClaimId,
      objectKey,
      originalName,
      contentUrl,
      sourcePageUrl,
      sourceDownloadUrl,
      metadataJson,
    },
  };
}

async function verifySources(tempRoot: string): Promise<Map<string, VerifiedSource>> {
  const verified = new Map<string, VerifiedSource>();
  const errors: string[] = [];
  for (const [index, definition] of wave.artifacts.entries()) {
    try {
      const sourceDownloadUrl = reviewedArtifactSourceDownloadUrl(definition);
      const response = await fetch(sourceDownloadUrl, {
        headers: { "user-agent": "RoboPartPicker reviewed project artifact verifier" },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== definition.size_bytes) throw new Error(`size ${bytes.byteLength} != ${definition.size_bytes}`);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== definition.sha256) throw new Error(`sha256 ${digest} != ${definition.sha256}`);
      const path = join(tempRoot, `${definition.slug}-${basename(definition.path)}`);
      writeFileSync(path, bytes);
      verified.set(artifactKey(definition), { definition, path });
      console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: wave.artifacts.length, unit: "artifacts", message: `${definition.slug}/${definition.path}: pinned source hash verified` })}`);
    } catch (error) {
      const message = `${definition.slug}/${definition.path}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: wave.artifacts.length, unit: "artifacts", message })}`);
    }
  }
  if (errors.length) throw new Error(`Reviewed artifact source verification failed:\n${errors.join("\n")}`);
  return verified;
}

function r2Head(bucket: string, key: string): R2Head | null {
  const code = `import sys, json, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\ns3=r2.get_client()\ntry:\n o=s3.head_object(Bucket=sys.argv[1], Key=sys.argv[2]); print(json.dumps({'size': o.get('ContentLength',-1), 'sha256': o.get('Metadata',{}).get('sha256'), 'contentType': o.get('ContentType')}))\nexcept Exception:\n sys.exit(3)\n`;
  const result = spawnSync(r2Python, ["-c", code, bucket, key], { encoding: "utf8", env: childEnv });
  if (result.status !== 0) return null;
  return JSON.parse(result.stdout) as R2Head;
}

function r2Put(bucket: string, project: PreparedReviewedProjectArtifact, sourcePath: string): void {
  const code = `import sys, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\ns3=r2.get_client()\ns3.upload_file(sys.argv[3], sys.argv[1], sys.argv[2], ExtraArgs={'Metadata': {'sha256': sys.argv[4], 'fileid': sys.argv[5], 'wave': sys.argv[6], 'revision': sys.argv[7]}, 'ContentType': sys.argv[8], 'CacheControl': 'public, max-age=31536000, immutable'})\n`;
  execFileSync(r2Python, [
    "-c", code, bucket, project.objectKey, sourcePath, project.definition.sha256, project.fileId, wave.wave, project.definition.revision, project.definition.media_type,
  ], { stdio: "inherit", env: childEnv });
}

function r2Delete(bucket: string, key: string): void {
  execFileSync(r2Python, ["/root/.cloudflare/r2.py", "rm", bucket, key], { stdio: "inherit", env: childEnv });
}

function uploadSources(projects: PreparedReviewedProjectArtifact[], sources: Map<string, VerifiedSource>): string[] {
  const newlyUploaded: string[] = [];
  for (const [index, project] of projects.entries()) {
    const source = sources.get(artifactKey(project.definition));
    if (!source) throw new Error(`${project.definition.slug}/${project.definition.path}: verified source file missing`);
    const existing = r2Head(buckets[env!], project.objectKey);
    if (existing) {
      if (existing.size !== project.definition.size_bytes || existing.sha256 !== project.definition.sha256 || existing.contentType !== project.definition.media_type) {
        throw new Error(`${project.definition.slug}/${project.definition.path}: refusing to overwrite mismatched R2 object ${project.objectKey}`);
      }
    } else {
      r2Put(buckets[env!], project, source.path);
      newlyUploaded.push(project.objectKey);
    }
    const verified = r2Head(buckets[env!], project.objectKey);
    if (verified?.size !== project.definition.size_bytes || verified.sha256 !== project.definition.sha256 || verified.contentType !== project.definition.media_type) {
      throw new Error(`${project.definition.slug}/${project.definition.path}: R2 HEAD verification failed for ${project.objectKey}`);
    }
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: projects.length, unit: "r2 objects", message: `${project.definition.slug}/${project.definition.path}: managed object verified` })}`);
  }
  return newlyUploaded;
}

async function verifyApplied(projects: PreparedReviewedProjectArtifact[], now: string): Promise<void> {
  for (const [index, project] of projects.entries()) {
    const result = wranglerRows(`SELECT p.updated_at, pv.rpps_json,
      (SELECT COUNT(*) FROM files f WHERE f.id = ${sqlString(project.fileId)} AND f.object_key = ${sqlString(project.objectKey)} AND f.checksum_sha256 = ${sqlString(project.definition.sha256)} AND f.status = 'ready' AND f.visibility = 'public') AS file_count,
      (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = p.id AND pf.project_version_id = pv.id AND pf.file_id = ${sqlString(project.fileId)} AND pf.purpose = ${sqlString(project.definition.purpose)} AND pf.relative_path = ${sqlString(project.definition.path)}) AS project_file_count,
      (SELECT COUNT(*) FROM evidence e WHERE e.id = ${sqlString(project.evidenceId)} AND e.file_id = ${sqlString(project.fileId)}) AS evidence_count,
      (SELECT COUNT(*) FROM evidence_claims ec WHERE ec.id = ${sqlString(project.evidenceClaimId)} AND ec.evidence_id = ${sqlString(project.evidenceId)}) AS claim_count
      FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(project.row.id)}`);
    if (result.length !== 1) throw new Error(`${project.row.slug}: postflight project row missing`);
    const row = result[0];
    if (row.updated_at !== now || row.rpps_json !== project.nextRppsJson) throw new Error(`${project.row.slug}: postflight project state mismatch`);
    for (const key of ["file_count", "project_file_count", "evidence_count", "claim_count"] as const) {
      if (Number(row[key]) !== 1) throw new Error(`${project.row.slug}: postflight ${key} was ${String(row[key])}`);
    }
    const response = await fetch(`${project.contentUrl}&verify=${encodeURIComponent(now)}`, { headers: { accept: project.definition.media_type } });
    if (!response.ok) throw new Error(`${project.row.slug}: managed artifact returned HTTP ${response.status}`);
    const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (mediaType !== project.definition.media_type || bytes.byteLength !== project.definition.size_bytes || digest !== project.definition.sha256) {
      throw new Error(`${project.row.slug}: managed artifact bytes failed postflight verification`);
    }
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: projects.length, unit: "postflight artifacts", message: `${project.row.slug}/${project.definition.path}: D1 and managed content verified` })}`);
  }
}

function verifyRolledBack(projects: PreparedReviewedProjectArtifact[]): void {
  for (const project of projects) {
    const result = wranglerRows(`SELECT p.updated_at, pv.rpps_json,
      (SELECT COUNT(*) FROM files f WHERE f.id = ${sqlString(project.fileId)}) AS file_count,
      (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = p.id AND pf.file_id = ${sqlString(project.fileId)}) AS project_file_count,
      (SELECT COUNT(*) FROM evidence e WHERE e.id = ${sqlString(project.evidenceId)}) AS evidence_count,
      (SELECT COUNT(*) FROM evidence_claims ec WHERE ec.id = ${sqlString(project.evidenceClaimId)}) AS claim_count
      FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(project.row.id)}`);
    if (result.length !== 1) throw new Error(`${project.row.slug}: rollback verification project missing`);
    const row = result[0];
    if (row.updated_at !== project.row.updated_at || row.rpps_json !== project.row.rpps_json) throw new Error(`${project.row.slug}: rollback did not restore project state`);
    for (const key of ["file_count", "project_file_count", "evidence_count", "claim_count"] as const) {
      if (Number(row[key]) !== 0) throw new Error(`${project.row.slug}: rollback left ${key}=${String(row[key])}`);
    }
  }
}

mkdirSync(scratch, { recursive: true });
const now = new Date().toISOString();
const stamp = now.replace(/[:.]/gu, "-");
const tempRoot = mkdtempSync(join(scratch, "reviewed-project-artifacts-"));
const sqlPath = join(scratch, `reviewed-project-artifacts-${env}-${stamp}.sql`);
const rollbackPath = join(scratch, `rollback-reviewed-project-artifacts-${env}-${stamp}.sql`);
const reportPath = join(scratch, `reviewed-project-artifacts-${env}-${stamp}.json`);

try {
  const rows = loadCatalogRows();
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const expectedSlugs = new Set(wave.artifacts.map((artifact) => artifact.slug));
  const missing = [...expectedSlugs].filter((slug) => !bySlug.has(slug));
  if (missing.length || rows.length !== expectedSlugs.size) throw new Error(`Reviewed artifact catalog identity mismatch: ${JSON.stringify({ expected: expectedSlugs.size, rows: rows.length, missing })}`);

  const prepared: PreparedReviewedProjectArtifact[] = [];
  const alreadyApplied: string[] = [];
  for (const definition of wave.artifacts) {
    const row = bySlug.get(definition.slug);
    if (!row) throw new Error(`${definition.slug}: catalog row missing`);
    const result = prepareArtifact(definition, row, now);
    if (result.project) prepared.push(result.project);
    if (result.alreadyApplied) alreadyApplied.push(`${definition.slug}/${definition.path}`);
  }

  const sources = await verifySources(tempRoot);
  writeFileSync(sqlPath, buildReviewedProjectArtifactForwardSql(prepared, wave.wave, now));
  writeFileSync(rollbackPath, buildReviewedProjectArtifactRollbackSql(prepared, wave.wave, now));
  const report = {
    mode: apply ? "apply" : "dry-run",
    env,
    wave: wave.wave,
    sourceVerified: sources.size,
    prepared: prepared.map((project) => ({
      slug: project.row.slug,
      path: project.definition.path,
      fileId: project.fileId,
      objectKey: project.objectKey,
      contentUrl: project.contentUrl,
      sourcePageUrl: project.sourcePageUrl,
      sha256: project.definition.sha256,
      sizeBytes: project.definition.size_bytes,
      mediaType: project.definition.media_type,
    })),
    alreadyApplied,
    sql: sqlPath,
    rollback: rollbackPath,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));

  if (!apply) {
    console.log("Dry run complete. Every pinned repository artifact was re-downloaded and hash-verified. No R2 or D1 writes were performed.");
    process.exit(0);
  }
  if (prepared.length === 0) {
    console.log("The exact reviewed project artifact wave is already applied. No writes were needed.");
    process.exit(0);
  }

  const newlyUploaded: string[] = [];
  try {
    newlyUploaded.push(...uploadSources(prepared, sources));
    executeSqlFile(sqlPath);
    await verifyApplied(prepared, now);
    console.log(JSON.stringify({ applied: prepared.length, alreadyApplied: alreadyApplied.length, newlyUploaded: newlyUploaded.length, report: reportPath, rollback: rollbackPath }, null, 2));
  } catch (error) {
    let rollbackError: unknown = null;
    try {
      executeSqlFile(rollbackPath);
      verifyRolledBack(prepared);
      for (const objectKey of newlyUploaded) r2Delete(buckets[env], objectKey);
    } catch (caught) {
      rollbackError = caught;
    }
    const originalMessage = error instanceof Error ? error.message : String(error);
    const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : rollbackError ? String(rollbackError) : "rollback verified";
    throw new Error(`Reviewed project artifact apply failed: ${originalMessage}; ${rollbackMessage}`);
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
