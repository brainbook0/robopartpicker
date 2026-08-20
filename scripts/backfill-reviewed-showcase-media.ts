import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildReviewedShowcaseMediaForwardSql,
  buildReviewedShowcaseMediaRollbackSql,
  reviewedShowcaseCoverUrl,
  reviewedShowcaseEvidenceClaimId,
  reviewedShowcaseEvidenceId,
  reviewedShowcaseFileId,
  reviewedShowcaseMediaId,
  reviewedShowcaseObjectKey,
  reviewedShowcaseOriginalName,
  serializeReviewedShowcaseRpps,
  validateReviewedShowcaseMediaWave,
  type PreparedReviewedShowcaseMedia,
  type ReviewedShowcaseMediaDefinition,
  type ReviewedShowcaseMediaWave,
  type ReviewedShowcaseProjectRow,
} from "../src/lib/reviewed-showcase-media";
import { sqlString } from "../src/lib/physical-design-wave-import";
import { normalizeRppsForWrite } from "../src/lib/rpps/schema";

type EnvName = "production" | "preview";
type ExactState = {
  file_count: number;
  project_file_count: number;
  media_count: number;
  evidence_count: number;
  claim_count: number;
};
type VerifiedSource = {
  definition: ReviewedShowcaseMediaDefinition;
  path: string;
};
type R2Head = { size: number; sha256: string | null; contentType: string | null };

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : undefined;
const waveIndex = args.indexOf("--wave");
const wavePath = waveIndex >= 0 ? args[waveIndex + 1] : "data/project-waves/2026-08-20-reviewed-showcase-covers.json";
const apply = args.includes("--apply");
const scratch = process.env.JCODE_SCRATCH_DIR;
const r2Python = process.env.R2_PYTHON ?? "/root/.jcode/scratch/r2-venv/bin/python";
const buckets: Record<EnvName, string> = {
  production: "robopartpicker-files",
  preview: "robopartpicker-preview-files",
};

if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/backfill-reviewed-showcase-media.ts --env production|preview [--wave data/project-waves/2026-08-20-reviewed-showcase-covers.json] [--apply]");
  process.exit(2);
}
if (!scratch) {
  console.error("JCODE_SCRATCH_DIR is required so generated SQL, rollback, and verification artifacts stay outside the repository.");
  process.exit(2);
}
if (apply && env === "production" && process.env.ALLOW_PRODUCTION_SHOWCASE_MEDIA !== "1") {
  console.error("Production apply is blocked. Set ALLOW_PRODUCTION_SHOWCASE_MEDIA=1 only after reviewing the dry run, source hashes, SQL, and rollback.");
  process.exit(2);
}

const wave = JSON.parse(readFileSync(resolve(wavePath), "utf8")) as ReviewedShowcaseMediaWave;
const definitionErrors = validateReviewedShowcaseMediaWave(wave);
if (definitionErrors.length) throw new Error(`Invalid reviewed showcase media wave:\n${definitionErrors.join("\n")}`);

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

function loadCatalogRows(): ReviewedShowcaseProjectRow[] {
  const slugs = wave.projects.map((project) => sqlString(project.slug)).join(", ");
  const rows = wranglerRows(`SELECT p.id, p.slug, p.name, p.owner_user_id, p.organization_id, p.visibility, p.status, p.project_kind, p.updated_at, p.current_version_id, pv.rpps_json,
    p.repository_url, p.revision,
    (SELECT COUNT(*) FROM project_media pm WHERE pm.project_id = p.id) AS media_count
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.deleted_at IS NULL AND p.slug IN (${slugs})
    ORDER BY p.slug`);
  return rows as unknown as ReviewedShowcaseProjectRow[];
}

function exactState(
  row: ReviewedShowcaseProjectRow,
  definition: ReviewedShowcaseMediaDefinition,
): ExactState {
  const fileId = reviewedShowcaseFileId(wave.wave, definition);
  const mediaId = reviewedShowcaseMediaId(wave.wave, row.id, fileId);
  const evidenceId = reviewedShowcaseEvidenceId(wave.wave, row.id, definition.sha256);
  const claimId = reviewedShowcaseEvidenceClaimId(wave.wave, row.id, definition.sha256);
  const objectKey = reviewedShowcaseObjectKey(wave.wave, definition);
  const result = wranglerRows(`SELECT
    (SELECT COUNT(*) FROM files f WHERE f.id = ${sqlString(fileId)} AND f.object_key = ${sqlString(objectKey)} AND f.checksum_sha256 = ${sqlString(definition.sha256)} AND f.media_type = ${sqlString(definition.media_type)} AND f.size_bytes = ${definition.size_bytes} AND f.visibility = 'public' AND f.status = 'ready' AND f.kind = 'image' AND f.deleted_at IS NULL) AS file_count,
    (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = ${sqlString(row.id)} AND pf.project_version_id = ${sqlString(row.current_version_id)} AND pf.file_id = ${sqlString(fileId)} AND pf.purpose = 'cover') AS project_file_count,
    (SELECT COUNT(*) FROM project_media pm WHERE pm.id = ${sqlString(mediaId)} AND pm.project_id = ${sqlString(row.id)} AND pm.file_id = ${sqlString(fileId)} AND pm.alt_text = ${sqlString(definition.alt_text)} AND pm.caption = ${sqlString(definition.caption)} AND pm.sort_order = 0) AS media_count,
    (SELECT COUNT(*) FROM evidence e WHERE e.id = ${sqlString(evidenceId)} AND e.file_id = ${sqlString(fileId)} AND e.source_url = ${sqlString(definition.source_page_url)} AND e.content_hash = ${sqlString(`sha256:${definition.sha256}`)}) AS evidence_count,
    (SELECT COUNT(*) FROM evidence_claims ec WHERE ec.id = ${sqlString(claimId)} AND ec.evidence_id = ${sqlString(evidenceId)} AND ec.entity_type = 'project' AND ec.entity_id = ${sqlString(row.id)} AND ec.claim_key = 'cover_image.source') AS claim_count`);
  if (result.length !== 1) throw new Error(`${definition.slug}: failed to inspect deterministic media state`);
  return result[0] as unknown as ExactState;
}

function prepareProject(
  definition: ReviewedShowcaseMediaDefinition,
  row: ReviewedShowcaseProjectRow,
  retrievedAt: string,
): { project: PreparedReviewedShowcaseMedia | null; alreadyApplied: boolean } {
  if (row.slug !== definition.slug) throw new Error(`${definition.slug}: slug mismatch`);
  const projectKind = definition.project_kind ?? "commercial_showcase";
  if (row.project_kind !== projectKind) throw new Error(`${definition.slug}: expected ${projectKind}, found ${row.project_kind}`);
  if (row.visibility !== "public" || row.status !== "published") throw new Error(`${definition.slug}: project must be public and published`);
  if (!row.current_version_id || !row.rpps_json) throw new Error(`${definition.slug}: missing current project version`);
  if (!row.owner_user_id && !row.organization_id) throw new Error(`${definition.slug}: project has no owner or organization for managed file ownership`);
  if (definition.repository_url && (row.repository_url?.toLowerCase() !== definition.repository_url.toLowerCase() || row.revision !== definition.revision)) {
    throw new Error(`${definition.slug}: repository identity or pinned revision changed`);
  }

  const fileId = reviewedShowcaseFileId(wave.wave, definition);
  const mediaId = reviewedShowcaseMediaId(wave.wave, row.id, fileId);
  const evidenceId = reviewedShowcaseEvidenceId(wave.wave, row.id, definition.sha256);
  const evidenceClaimId = reviewedShowcaseEvidenceClaimId(wave.wave, row.id, definition.sha256);
  const objectKey = reviewedShowcaseObjectKey(wave.wave, definition);
  const originalName = reviewedShowcaseOriginalName(definition);
  const relativePath = `media/${originalName}`;
  const coverUrl = reviewedShowcaseCoverUrl(publicOrigin(env!), fileId);
  const state = exactState(row, definition);
  const stateCounts = Object.values(state).map(Number);
  const exactApplied = stateCounts.every((count) => count === 1);
  const pristine = stateCounts.every((count) => count === 0) && Number(row.media_count) === 0;
  const current = normalizeRppsForWrite(JSON.parse(row.rpps_json), publicOrigin(env!)) as Record<string, unknown>;

  const exactDocs = projectKind === "commercial_showcase" ? current.docs_url === definition.source_page_url : true;
  if (exactApplied && Number(row.media_count) === 1 && current.cover_image_url === coverUrl && exactDocs) {
    return { project: null, alreadyApplied: true };
  }
  if (!pristine) {
    throw new Error(`${definition.slug}: existing media state is neither pristine nor the exact reviewed wave (${JSON.stringify({ totalMedia: Number(row.media_count), ...state })})`);
  }
  if (definition.expected_cover_url && current.cover_image_url !== definition.expected_cover_url) {
    throw new Error(`${definition.slug}: current cover changed from the reviewed broken URL`);
  }

  const priorFiles = Array.isArray(current.files) ? current.files : [];
  const priorEvidence = (Array.isArray(current.evidence) ? current.evidence : []).map((evidence) => (
    evidence.source_type === "official-vendor-page"
      ? { ...evidence, source_type: "docs" as const }
      : evidence
  ));
  const nextRpps = {
    ...current,
    ...(projectKind === "commercial_showcase" ? { docs_url: definition.source_page_url } : {}),
    cover_image_url: coverUrl,
    files: [
      ...priorFiles,
      { path: relativePath, kind: "image" as const, url: coverUrl, description: definition.caption },
    ],
    evidence: [
      ...priorEvidence,
      {
        claim: `The project cover is an upstream ${definition.name} image from ${definition.source_publisher}, verified by SHA-256 ${definition.sha256}.`,
        source_type: "docs" as const,
        source_url: definition.source_page_url,
        retrieved_at: retrievedAt,
        confidence: 0.99,
      },
    ],
  };
  let nextRppsJson: string;
  try {
    nextRppsJson = serializeReviewedShowcaseRpps(nextRpps as unknown as Record<string, unknown>);
  } catch (error) {
    throw new Error(`${definition.slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const metadataJson = JSON.stringify({
    wave: wave.wave,
    reviewed: true,
    sourcePageUrl: definition.source_page_url,
    sourceImageUrl: definition.source_image_url,
    finalSourceImageUrl: definition.final_source_image_url,
    requestAccept: definition.request_accept ?? null,
    sourcePublisher: definition.source_publisher,
    width: definition.width,
    height: definition.height,
    sha256: definition.sha256,
    sourceDocument: definition.source_document ?? null,
    repositoryUrl: definition.repository_url ?? null,
    revision: definition.revision ?? null,
  });
  return {
    alreadyApplied: false,
    project: {
      definition,
      row,
      nextRppsJson,
      fileId,
      mediaId,
      evidenceId,
      evidenceClaimId,
      objectKey,
      originalName,
      relativePath,
      coverUrl,
      metadataJson,
    },
  };
}

async function verifySources(tempRoot: string): Promise<Map<string, VerifiedSource>> {
  const verified = new Map<string, VerifiedSource>();
  const errors: string[] = [];
  for (const [index, definition] of wave.projects.entries()) {
    try {
      if (definition.source_document && definition.repository_url && definition.revision) {
        const base = definition.repository_url.replace(/\.git$/iu, "").replace(/\/+$/u, "");
        const repository = base.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/iu);
        if (!repository) throw new Error("source document repository is not canonical GitHub");
        const path = definition.source_document.path.split("/").map(encodeURIComponent).join("/");
        const rawUrl = `https://raw.githubusercontent.com/${repository[1]}/${repository[2]}/${definition.revision}/${path}`;
        const documentResponse = await fetch(rawUrl, { headers: { "user-agent": "RoboPartPicker reviewed project media" }, redirect: "follow" });
        if (!documentResponse.ok) throw new Error(`source document returned HTTP ${documentResponse.status}`);
        const documentBytes = new Uint8Array(await documentResponse.arrayBuffer());
        const documentDigest = createHash("sha256").update(documentBytes).digest("hex");
        if (documentBytes.byteLength !== definition.source_document.size_bytes || documentDigest !== definition.source_document.sha256) {
          throw new Error("source document failed size/hash verification");
        }
        if (!Buffer.from(documentBytes).toString("utf8").includes(definition.source_image_url)) {
          throw new Error("source document no longer references the reviewed image URL");
        }
      }
      const response = await fetch(definition.source_image_url, {
        headers: {
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
          referer: definition.source_page_url,
          accept: definition.request_accept ?? "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
      if (new URL(response.url).toString() !== new URL(definition.final_source_image_url).toString()) {
        throw new Error(`final source URL changed from ${definition.final_source_image_url} to ${response.url}`);
      }
      const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (mediaType !== definition.media_type) throw new Error(`media type ${mediaType || "unknown"} != ${definition.media_type}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== definition.size_bytes) throw new Error(`size ${bytes.byteLength} != ${definition.size_bytes}`);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== definition.sha256) throw new Error(`sha256 ${digest} != ${definition.sha256}`);
      const path = join(tempRoot, reviewedShowcaseOriginalName(definition));
      writeFileSync(path, bytes);
      verified.set(definition.slug, { definition, path });
      console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: wave.projects.length, unit: "covers", message: `${definition.slug}: source hash verified` })}`);
    } catch (error) {
      const message = `${definition.slug}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: wave.projects.length, unit: "covers", message })}`);
    }
  }
  if (errors.length) throw new Error(`Reviewed source verification failed:\n${errors.join("\n")}`);
  return verified;
}

function r2Head(bucket: string, key: string): R2Head | null {
  const code = `import sys, json, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\ns3=r2.get_client()\ntry:\n o=s3.head_object(Bucket=sys.argv[1], Key=sys.argv[2]); print(json.dumps({'size': o.get('ContentLength',-1), 'sha256': o.get('Metadata',{}).get('sha256'), 'contentType': o.get('ContentType')}))\nexcept Exception:\n sys.exit(3)\n`;
  const result = spawnSync(r2Python, ["-c", code, bucket, key], { encoding: "utf8", env: childEnv });
  if (result.status !== 0) return null;
  return JSON.parse(result.stdout) as R2Head;
}

function r2Put(bucket: string, project: PreparedReviewedShowcaseMedia, sourcePath: string): void {
  const code = `import sys, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\ns3=r2.get_client()\ns3.upload_file(sys.argv[3], sys.argv[1], sys.argv[2], ExtraArgs={'Metadata': {'sha256': sys.argv[4], 'fileid': sys.argv[5], 'wave': sys.argv[6]}, 'ContentType': sys.argv[7], 'CacheControl': 'public, max-age=31536000, immutable'})\n`;
  execFileSync(r2Python, [
    "-c", code, bucket, project.objectKey, sourcePath, project.definition.sha256, project.fileId, wave.wave, project.definition.media_type,
  ], { stdio: "inherit", env: childEnv });
}

function r2Delete(bucket: string, key: string): void {
  execFileSync(r2Python, ["/root/.cloudflare/r2.py", "rm", bucket, key], { stdio: "inherit", env: childEnv });
}

function uploadSources(
  projects: PreparedReviewedShowcaseMedia[],
  sources: Map<string, VerifiedSource>,
): string[] {
  const newlyUploaded: string[] = [];
  for (const [index, project] of projects.entries()) {
    const source = sources.get(project.definition.slug);
    if (!source) throw new Error(`${project.definition.slug}: verified source file missing`);
    const existing = r2Head(buckets[env!], project.objectKey);
    if (existing) {
      if (existing.size !== project.definition.size_bytes || existing.sha256 !== project.definition.sha256 || existing.contentType !== project.definition.media_type) {
        throw new Error(`${project.definition.slug}: refusing to overwrite mismatched R2 object ${project.objectKey}`);
      }
    } else {
      r2Put(buckets[env!], project, source.path);
      newlyUploaded.push(project.objectKey);
    }
    const verified = r2Head(buckets[env!], project.objectKey);
    if (verified?.size !== project.definition.size_bytes || verified.sha256 !== project.definition.sha256 || verified.contentType !== project.definition.media_type) {
      throw new Error(`${project.definition.slug}: R2 HEAD verification failed for ${project.objectKey}`);
    }
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: projects.length, unit: "r2 objects", message: `${project.definition.slug}: managed object verified` })}`);
  }
  return newlyUploaded;
}

async function verifyApplied(projects: PreparedReviewedShowcaseMedia[], now: string): Promise<void> {
  for (const [index, project] of projects.entries()) {
    const result = wranglerRows(`SELECT p.updated_at, pv.rpps_json,
      (SELECT COUNT(*) FROM files f WHERE f.id = ${sqlString(project.fileId)} AND f.object_key = ${sqlString(project.objectKey)} AND f.checksum_sha256 = ${sqlString(project.definition.sha256)} AND f.status = 'ready' AND f.visibility = 'public') AS file_count,
      (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = p.id AND pf.project_version_id = pv.id AND pf.file_id = ${sqlString(project.fileId)} AND pf.purpose = 'cover') AS project_file_count,
      (SELECT COUNT(*) FROM project_media pm WHERE pm.id = ${sqlString(project.mediaId)} AND pm.project_id = p.id AND pm.file_id = ${sqlString(project.fileId)}) AS media_count,
      (SELECT COUNT(*) FROM evidence e WHERE e.id = ${sqlString(project.evidenceId)} AND e.file_id = ${sqlString(project.fileId)}) AS evidence_count,
      (SELECT COUNT(*) FROM evidence_claims ec WHERE ec.id = ${sqlString(project.evidenceClaimId)} AND ec.evidence_id = ${sqlString(project.evidenceId)}) AS claim_count
      FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(project.row.id)}`);
    if (result.length !== 1) throw new Error(`${project.row.slug}: postflight project row missing`);
    const row = result[0];
    if (row.updated_at !== now || row.rpps_json !== project.nextRppsJson) throw new Error(`${project.row.slug}: postflight project state mismatch`);
    for (const key of ["file_count", "project_file_count", "media_count", "evidence_count", "claim_count"] as const) {
      if (Number(row[key]) !== 1) throw new Error(`${project.row.slug}: postflight ${key} was ${String(row[key])}`);
    }
    const response = await fetch(`${project.coverUrl}&verify=${encodeURIComponent(now)}`, { headers: { accept: project.definition.media_type } });
    if (!response.ok) throw new Error(`${project.row.slug}: managed cover returned HTTP ${response.status}`);
    const mediaType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (mediaType !== project.definition.media_type || bytes.byteLength !== project.definition.size_bytes || digest !== project.definition.sha256) {
      throw new Error(`${project.row.slug}: managed cover bytes failed postflight verification`);
    }
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: projects.length, unit: "postflight covers", message: `${project.row.slug}: D1 and managed content verified` })}`);
  }
}

function verifyRolledBack(projects: PreparedReviewedShowcaseMedia[]): void {
  for (const project of projects) {
    const result = wranglerRows(`SELECT p.updated_at, pv.rpps_json,
      (SELECT COUNT(*) FROM files f WHERE f.id = ${sqlString(project.fileId)}) AS file_count,
      (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = p.id AND pf.file_id = ${sqlString(project.fileId)}) AS project_file_count,
      (SELECT COUNT(*) FROM project_media pm WHERE pm.id = ${sqlString(project.mediaId)}) AS media_count,
      (SELECT COUNT(*) FROM evidence e WHERE e.id = ${sqlString(project.evidenceId)}) AS evidence_count,
      (SELECT COUNT(*) FROM evidence_claims ec WHERE ec.id = ${sqlString(project.evidenceClaimId)}) AS claim_count
      FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(project.row.id)}`);
    if (result.length !== 1) throw new Error(`${project.row.slug}: rollback verification project missing`);
    const row = result[0];
    if (row.updated_at !== project.row.updated_at || row.rpps_json !== project.row.rpps_json) throw new Error(`${project.row.slug}: rollback did not restore project state`);
    for (const key of ["file_count", "project_file_count", "media_count", "evidence_count", "claim_count"] as const) {
      if (Number(row[key]) !== 0) throw new Error(`${project.row.slug}: rollback left ${key}=${String(row[key])}`);
    }
  }
}

mkdirSync(scratch, { recursive: true });
const now = new Date().toISOString();
const stamp = now.replace(/[:.]/gu, "-");
const tempRoot = mkdtempSync(join(scratch, "reviewed-showcase-media-"));
const sqlPath = join(scratch, `reviewed-showcase-media-${env}-${stamp}.sql`);
const rollbackPath = join(scratch, `rollback-reviewed-showcase-media-${env}-${stamp}.sql`);
const reportPath = join(scratch, `reviewed-showcase-media-${env}-${stamp}.json`);

try {
  const rows = loadCatalogRows();
  const waveSlugs = new Set(wave.projects.map((project) => project.slug));
  const catalogSlugs = new Set(rows.map((row) => row.slug));
  const missingFromWave = rows.filter((row) => !waveSlugs.has(row.slug)).map((row) => row.slug);
  const missingFromCatalog = wave.projects.filter((project) => !catalogSlugs.has(project.slug)).map((project) => project.slug);
  if (missingFromWave.length || missingFromCatalog.length || rows.length !== wave.projects.length) {
    throw new Error(`Reviewed wave must exactly cover every active commercial showcase: ${JSON.stringify({ catalog: rows.length, wave: wave.projects.length, missingFromWave, missingFromCatalog })}`);
  }

  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const prepared: PreparedReviewedShowcaseMedia[] = [];
  const alreadyApplied: string[] = [];
  for (const definition of wave.projects) {
    const row = bySlug.get(definition.slug);
    if (!row) throw new Error(`${definition.slug}: catalog row missing`);
    const result = prepareProject(definition, row, now);
    if (result.project) prepared.push(result.project);
    if (result.alreadyApplied) alreadyApplied.push(definition.slug);
  }

  const sources = await verifySources(tempRoot);
  writeFileSync(sqlPath, buildReviewedShowcaseMediaForwardSql(prepared, wave.wave, now));
  writeFileSync(rollbackPath, buildReviewedShowcaseMediaRollbackSql(prepared, wave.wave, now));
  const report = {
    mode: apply ? "apply" : "dry-run",
    env,
    wave: wave.wave,
    sourceVerified: sources.size,
    prepared: prepared.map((project) => ({
      slug: project.row.slug,
      fileId: project.fileId,
      objectKey: project.objectKey,
      coverUrl: project.coverUrl,
      sourcePageUrl: project.definition.source_page_url,
      sourceImageUrl: project.definition.final_source_image_url,
      sha256: project.definition.sha256,
      sizeBytes: project.definition.size_bytes,
      mediaType: project.definition.media_type,
      dimensions: `${project.definition.width}x${project.definition.height}`,
    })),
    alreadyApplied,
    sql: sqlPath,
    rollback: rollbackPath,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));

  if (!apply) {
    console.log("Dry run complete. All official sources were re-downloaded and hash-verified. No R2 or D1 writes were performed.");
    process.exit(0);
  }
  if (prepared.length === 0) {
    console.log("The exact reviewed showcase media wave is already applied. No writes were needed.");
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
    throw new Error(`Showcase media apply failed: ${originalMessage}; ${rollbackMessage}`);
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
