import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildReviewedDerivedProjectMediaForwardSql,
  buildReviewedDerivedProjectMediaRollbackSql,
  canonicalReviewedMediaRepository,
  reviewedDerivedMediaClaimId,
  reviewedDerivedMediaCoverUrl,
  reviewedDerivedMediaEvidenceId,
  reviewedDerivedMediaFileId,
  reviewedDerivedMediaMediaId,
  reviewedDerivedMediaObjectKey,
  reviewedDerivedMediaOriginalName,
  reviewedDerivedMediaSourcePageUrl,
  serializeReviewedDerivedProjectMediaRpps,
  validateReviewedDerivedProjectMediaWave,
  type PreparedReviewedDerivedProjectMedia,
  type ReviewedDerivedProjectMediaDefinition,
  type ReviewedDerivedProjectMediaRow,
  type ReviewedDerivedProjectMediaWave,
} from "../src/lib/reviewed-derived-project-media";
import { sqlString } from "../src/lib/physical-design-wave-import";
import { normalizeRppsForWrite, type RppsPackage } from "../src/lib/rpps/schema";

type EnvName = "production" | "preview";
type ExactState = {
  file_count: number;
  project_file_count: number;
  media_count: number;
  evidence_count: number;
  claim_count: number;
  path_conflict_count: number;
};
type VerifiedAsset = { definition: ReviewedDerivedProjectMediaDefinition; localPath: string };
type R2Head = { size: number; sha256: string | null; contentType: string | null };

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const waveIndex = args.indexOf("--wave");
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : undefined;
const wavePath = waveIndex >= 0 ? args[waveIndex + 1] : "data/project-waves/2026-08-20-reviewed-derived-project-covers.json";
const apply = args.includes("--apply");
const scratch = process.env.JCODE_SCRATCH_DIR;
const r2Python = process.env.R2_PYTHON ?? "/root/.jcode/scratch/r2-venv/bin/python";
const buckets: Record<EnvName, string> = {
  production: "robopartpicker-files",
  preview: "robopartpicker-preview-files",
};

if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/backfill-reviewed-derived-project-media.ts --env production|preview [--wave path] [--apply]");
  process.exit(2);
}
if (!scratch) {
  console.error("JCODE_SCRATCH_DIR is required so SQL, rollback, and verification artifacts stay outside the repository.");
  process.exit(2);
}
if (apply && env === "production" && process.env.ALLOW_PRODUCTION_DERIVED_PROJECT_MEDIA !== "1") {
  console.error("Production apply is blocked. Set ALLOW_PRODUCTION_DERIVED_PROJECT_MEDIA=1 only after reviewing source hashes, render provenance, SQL, and rollback.");
  process.exit(2);
}

const wave = JSON.parse(readFileSync(resolve(wavePath), "utf8")) as ReviewedDerivedProjectMediaWave;
const definitionErrors = validateReviewedDerivedProjectMediaWave(wave);
if (definitionErrors.length) throw new Error(`Invalid reviewed derived project media wave:\n${definitionErrors.join("\n")}`);

function credentialsEnvironment(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  try {
    const credentials = readFileSync("/root/.cloudflare/credentials", "utf8");
    for (const line of credentials.split("\n")) {
      const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/u);
      if (match) childEnv[match[1]] = match[2];
    }
  } catch {
    // The caller may already provide Cloudflare credentials.
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

function loadCatalogRows(): ReviewedDerivedProjectMediaRow[] {
  const slugs = wave.projects.map((project) => sqlString(project.slug)).join(", ");
  return wranglerRows(`SELECT p.id, p.slug, p.name, p.owner_user_id, p.organization_id, p.visibility, p.status, p.project_kind, p.repository_url, p.revision, p.updated_at, p.current_version_id, pv.rpps_json
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.deleted_at IS NULL AND p.slug IN (${slugs}) ORDER BY p.slug`) as unknown as ReviewedDerivedProjectMediaRow[];
}

function exactState(row: ReviewedDerivedProjectMediaRow, definition: ReviewedDerivedProjectMediaDefinition): ExactState {
  const fileId = reviewedDerivedMediaFileId(wave.wave, definition);
  const mediaId = reviewedDerivedMediaMediaId(wave.wave, row.id, fileId);
  const evidenceId = reviewedDerivedMediaEvidenceId(wave.wave, row.id, definition);
  const claimId = reviewedDerivedMediaClaimId(wave.wave, row.id, definition);
  const objectKey = reviewedDerivedMediaObjectKey(wave.wave, definition);
  const relativePath = `media/${reviewedDerivedMediaOriginalName(definition)}`;
  const sourcePageUrl = reviewedDerivedMediaSourcePageUrl(definition);
  const result = wranglerRows(`SELECT
    (SELECT COUNT(*) FROM files f WHERE f.id = ${sqlString(fileId)} AND f.object_key = ${sqlString(objectKey)} AND f.checksum_sha256 = ${sqlString(definition.rendered_asset.sha256)} AND f.media_type = 'image/png' AND f.size_bytes = ${definition.rendered_asset.size_bytes} AND f.visibility = 'public' AND f.status = 'ready' AND f.kind = 'image' AND f.deleted_at IS NULL) AS file_count,
    (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = ${sqlString(row.id)} AND pf.project_version_id = ${sqlString(row.current_version_id)} AND pf.file_id = ${sqlString(fileId)} AND pf.purpose = 'cover' AND pf.relative_path = ${sqlString(relativePath)}) AS project_file_count,
    (SELECT COUNT(*) FROM project_media pm WHERE pm.id = ${sqlString(mediaId)} AND pm.project_id = ${sqlString(row.id)} AND pm.file_id = ${sqlString(fileId)} AND pm.caption = ${sqlString(definition.caption)} AND pm.alt_text = ${sqlString(definition.alt_text)} AND pm.sort_order = -1) AS media_count,
    (SELECT COUNT(*) FROM evidence e WHERE e.id = ${sqlString(evidenceId)} AND e.file_id = ${sqlString(fileId)} AND e.source_url = ${sqlString(sourcePageUrl)} AND e.content_hash = ${sqlString(`sha256:${definition.rendered_asset.sha256}`)}) AS evidence_count,
    (SELECT COUNT(*) FROM evidence_claims ec WHERE ec.id = ${sqlString(claimId)} AND ec.evidence_id = ${sqlString(evidenceId)} AND ec.entity_type = 'project' AND ec.entity_id = ${sqlString(row.id)} AND ec.claim_key = 'cover_image.derived_source') AS claim_count,
    (SELECT COUNT(*) FROM project_files pf WHERE pf.project_id = ${sqlString(row.id)} AND lower(pf.relative_path) = lower(${sqlString(relativePath)}) AND pf.file_id <> ${sqlString(fileId)}) AS path_conflict_count`);
  if (result.length !== 1) throw new Error(`${definition.slug}: failed to inspect deterministic derived cover state`);
  return result[0] as unknown as ExactState;
}

function exactRppsFile(current: Record<string, unknown>, path: string, url: string): boolean {
  const files = Array.isArray(current.files) ? current.files : [];
  return files.filter((candidate) => candidate && typeof candidate === "object"
    && (candidate as Record<string, unknown>).path === path
    && (candidate as Record<string, unknown>).kind === "image"
    && (candidate as Record<string, unknown>).url === url).length === 1;
}

function prepareProject(
  definition: ReviewedDerivedProjectMediaDefinition,
  row: ReviewedDerivedProjectMediaRow,
  retrievedAt: string,
): { project: PreparedReviewedDerivedProjectMedia | null; alreadyApplied: boolean } {
  if (row.slug !== definition.slug || row.name !== definition.name) throw new Error(`${definition.slug}: catalog identity changed`);
  if (row.project_kind !== "physical_design" || row.visibility !== "public" || row.status !== "published") throw new Error(`${definition.slug}: project must remain a public published physical design`);
  if (!row.owner_user_id && !row.organization_id) throw new Error(`${definition.slug}: project has no owner or organization for managed file ownership`);
  if (!row.repository_url || canonicalReviewedMediaRepository(row.repository_url) !== canonicalReviewedMediaRepository(definition.repository_url) || row.revision !== definition.revision) {
    throw new Error(`${definition.slug}: repository identity or pinned revision changed`);
  }
  if (!row.current_version_id || !row.rpps_json) throw new Error(`${definition.slug}: current project version is missing`);

  const fileId = reviewedDerivedMediaFileId(wave.wave, definition);
  const mediaId = reviewedDerivedMediaMediaId(wave.wave, row.id, fileId);
  const evidenceId = reviewedDerivedMediaEvidenceId(wave.wave, row.id, definition);
  const evidenceClaimId = reviewedDerivedMediaClaimId(wave.wave, row.id, definition);
  const objectKey = reviewedDerivedMediaObjectKey(wave.wave, definition);
  const originalName = reviewedDerivedMediaOriginalName(definition);
  const relativePath = `media/${originalName}`;
  const coverUrl = reviewedDerivedMediaCoverUrl(publicOrigin(env!), fileId);
  const sourcePageUrl = reviewedDerivedMediaSourcePageUrl(definition);
  const state = exactState(row, definition);
  const exactApplied = [state.file_count, state.project_file_count, state.media_count, state.evidence_count, state.claim_count].every((count) => Number(count) === 1)
    && Number(state.path_conflict_count) === 0;
  const pristine = Object.values(state).every((count) => Number(count) === 0);
  const current = normalizeRppsForWrite(JSON.parse(row.rpps_json), publicOrigin(env!)) as Record<string, unknown>;

  if (exactApplied && current.cover_image_url === coverUrl && exactRppsFile(current, relativePath, coverUrl)) {
    return { project: null, alreadyApplied: true };
  }
  if (!pristine) throw new Error(`${definition.slug}: derived cover state is neither pristine nor the exact reviewed wave (${JSON.stringify(state)})`);
  if (current.cover_image_url !== definition.expected_cover_url) {
    throw new Error(`${definition.slug}: current cover changed from the reviewed broken URL`);
  }

  const priorFiles = Array.isArray(current.files) ? current.files : [];
  const priorEvidence = Array.isArray(current.evidence) ? current.evidence : [];
  const nextRpps = {
    ...current,
    cover_image_url: coverUrl,
    files: [
      ...priorFiles,
      { path: relativePath, kind: "image" as const, url: coverUrl, description: definition.caption },
    ],
    evidence: [
      ...priorEvidence,
      {
        claim: `${definition.caption} Source OBJ SHA-256 ${definition.source_artifact.sha256}; rendered image SHA-256 ${definition.rendered_asset.sha256}.`,
        source_type: "repo" as const,
        source_url: sourcePageUrl,
        retrieved_at: retrievedAt,
        confidence: 1,
      },
    ],
  };
  let nextRppsJson: string;
  try {
    nextRppsJson = serializeReviewedDerivedProjectMediaRpps(nextRpps as unknown as Record<string, unknown>);
  } catch (error) {
    throw new Error(`${definition.slug}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const metadataJson = JSON.stringify({
    wave: wave.wave,
    reviewed: true,
    derivation: "rendered-from-pinned-project-artifact",
    sourcePageUrl,
    sourceArtifactPath: definition.source_artifact.path,
    sourceArtifactSha256: definition.source_artifact.sha256,
    sourceArtifactSizeBytes: definition.source_artifact.size_bytes,
    renderedAssetSha256: definition.rendered_asset.sha256,
    width: definition.rendered_asset.width,
    height: definition.rendered_asset.height,
    renderer: definition.renderer,
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
      sourcePageUrl,
      metadataJson,
    },
  };
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)
    || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function verifySources(tempRoot: string): Map<string, VerifiedAsset> {
  const verified = new Map<string, VerifiedAsset>();
  for (const [index, definition] of wave.projects.entries()) {
    const repository = join(tempRoot, `${definition.slug}.git`);
    execFileSync("git", ["clone", "--mirror", "--filter=blob:none", "--quiet", definition.repository_url, repository], { stdio: "inherit" });
    const actualRevision = execFileSync("git", ["-C", repository, "rev-parse", definition.revision], { encoding: "utf8" }).trim();
    if (actualRevision !== definition.revision) throw new Error(`${definition.slug}: source revision mismatch ${actualRevision}`);
    const sourceBytes = execFileSync("git", ["-C", repository, "show", `${definition.revision}:${definition.source_artifact.path}`], {
      maxBuffer: Math.max(16 * 1024 * 1024, definition.source_artifact.size_bytes + 1024),
    });
    const sourceDigest = createHash("sha256").update(sourceBytes).digest("hex");
    if (sourceBytes.byteLength !== definition.source_artifact.size_bytes || sourceDigest !== definition.source_artifact.sha256) {
      throw new Error(`${definition.slug}: source artifact failed size/hash verification`);
    }
    const rendererBytes = execFileSync("git", ["show", `${definition.renderer.commit}:${definition.renderer.path}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const rendererDigest = createHash("sha256").update(rendererBytes).digest("hex");
    if (rendererDigest !== definition.renderer.sha256) throw new Error(`${definition.slug}: renderer source hash changed`);
    const localPath = resolve(definition.rendered_asset.local_path);
    const renderBytes = new Uint8Array(readFileSync(localPath));
    const renderDigest = createHash("sha256").update(renderBytes).digest("hex");
    const dimensions = pngDimensions(renderBytes);
    if (renderBytes.byteLength !== definition.rendered_asset.size_bytes || renderDigest !== definition.rendered_asset.sha256) {
      throw new Error(`${definition.slug}: checked-in render failed size/hash verification`);
    }
    if (!dimensions || dimensions.width !== definition.rendered_asset.width || dimensions.height !== definition.rendered_asset.height) {
      throw new Error(`${definition.slug}: checked-in render dimensions changed`);
    }
    verified.set(definition.slug, { definition, localPath });
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: wave.projects.length, unit: "covers", message: `${definition.slug}: source, renderer, and rendered asset verified` })}`);
  }
  return verified;
}

async function verifyBrokenCovers(): Promise<void> {
  for (const definition of wave.projects) {
    const response = await fetch(definition.expected_cover_url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (response.status !== 404) throw new Error(`${definition.slug}: expected broken cover now returns HTTP ${response.status}; refusing to overwrite`);
  }
}

function r2Head(bucket: string, key: string): R2Head | null {
  const code = `import sys, json, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\ns3=r2.get_client()\ntry:\n o=s3.head_object(Bucket=sys.argv[1], Key=sys.argv[2]); print(json.dumps({'size': o.get('ContentLength',-1), 'sha256': o.get('Metadata',{}).get('sha256'), 'contentType': o.get('ContentType')}))\nexcept Exception:\n sys.exit(3)\n`;
  const result = spawnSync(r2Python, ["-c", code, bucket, key], { encoding: "utf8", env: childEnv });
  if (result.status !== 0) return null;
  return JSON.parse(result.stdout) as R2Head;
}

function r2Put(bucket: string, project: PreparedReviewedDerivedProjectMedia, sourcePath: string): void {
  const code = `import sys, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\ns3=r2.get_client()\ns3.upload_file(sys.argv[3], sys.argv[1], sys.argv[2], ExtraArgs={'Metadata': {'sha256': sys.argv[4], 'fileid': sys.argv[5], 'wave': sys.argv[6], 'source-sha256': sys.argv[7], 'renderer-commit': sys.argv[8]}, 'ContentType': 'image/png', 'ContentDisposition': 'inline; filename="' + sys.argv[9] + '"', 'CacheControl': 'public, max-age=3600'})\n`;
  execFileSync(r2Python, ["-c", code, bucket, project.objectKey, sourcePath, project.definition.rendered_asset.sha256, project.fileId, wave.wave, project.definition.source_artifact.sha256, project.definition.renderer.commit, project.originalName], { env: childEnv, stdio: "inherit" });
}

function r2Delete(bucket: string, key: string): void {
  const code = `import sys, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\nr2.get_client().delete_object(Bucket=sys.argv[1], Key=sys.argv[2])\n`;
  execFileSync(r2Python, ["-c", code, bucket, key], { env: childEnv, stdio: "inherit" });
}

function verifyR2(project: PreparedReviewedDerivedProjectMedia): void {
  const head = r2Head(buckets[env!], project.objectKey);
  if (!head || head.size !== project.definition.rendered_asset.size_bytes || head.sha256 !== project.definition.rendered_asset.sha256 || head.contentType !== "image/png") {
    throw new Error(`${project.definition.slug}: R2 object failed exact postflight verification`);
  }
}

function verifyApplied(projects: PreparedReviewedDerivedProjectMedia[]): void {
  const rows = loadCatalogRows();
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  for (const project of projects) {
    const row = bySlug.get(project.definition.slug);
    if (!row) throw new Error(`${project.definition.slug}: postflight project missing`);
    const state = exactState(row, project.definition);
    if (!Object.entries(state).every(([key, value]) => key === "path_conflict_count" ? Number(value) === 0 : Number(value) === 1)) {
      throw new Error(`${project.definition.slug}: postflight D1 state mismatch ${JSON.stringify(state)}`);
    }
    const current = normalizeRppsForWrite(JSON.parse(row.rpps_json), publicOrigin(env!)) as RppsPackage;
    if (current.cover_image_url !== project.coverUrl || row.rpps_json !== project.nextRppsJson) throw new Error(`${project.definition.slug}: postflight RPPS cover mismatch`);
    verifyR2(project);
  }
}

function verifyRolledBack(projects: PreparedReviewedDerivedProjectMedia[]): void {
  const rows = loadCatalogRows();
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  for (const project of projects) {
    const row = bySlug.get(project.definition.slug);
    if (!row || row.rpps_json !== project.row.rpps_json || row.updated_at !== project.row.updated_at) throw new Error(`${project.definition.slug}: rollback did not restore project state`);
    const state = exactState(row, project.definition);
    if (!Object.values(state).every((value) => Number(value) === 0)) throw new Error(`${project.definition.slug}: rollback left deterministic D1 rows`);
  }
}

mkdirSync(scratch, { recursive: true });
const tempRoot = mkdtempSync(join(scratch, "reviewed-derived-project-media-"));
const now = new Date().toISOString();
const stamp = now.replace(/[:.]/gu, "-");
const forwardPath = join(scratch, `reviewed-derived-project-media-${env}-${stamp}.sql`);
const rollbackPath = join(scratch, `rollback-reviewed-derived-project-media-${env}-${stamp}.sql`);
const reportPath = join(scratch, `reviewed-derived-project-media-${env}-${stamp}.json`);
const uploaded: PreparedReviewedDerivedProjectMedia[] = [];

try {
  const rows = loadCatalogRows();
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const missing = wave.projects.filter((definition) => !bySlug.has(definition.slug)).map((definition) => definition.slug);
  if (missing.length) throw new Error(`Reviewed derived cover wave projects missing from catalog: ${missing.join(", ")}`);
  const verified = verifySources(tempRoot);
  const prepared: PreparedReviewedDerivedProjectMedia[] = [];
  const alreadyApplied: string[] = [];
  for (const definition of wave.projects) {
    const result = prepareProject(definition, bySlug.get(definition.slug)!, now);
    if (result.project) prepared.push(result.project);
    if (result.alreadyApplied) alreadyApplied.push(definition.slug);
  }
  if (prepared.length) await verifyBrokenCovers();
  writeFileSync(forwardPath, buildReviewedDerivedProjectMediaForwardSql(prepared, wave.wave, now));
  writeFileSync(rollbackPath, buildReviewedDerivedProjectMediaRollbackSql(prepared, wave.wave, now));
  const report = {
    mode: apply ? "apply" : "dry-run",
    env,
    wave: wave.wave,
    sourceVerified: verified.size,
    prepared: prepared.map((project) => ({ slug: project.definition.slug, fileId: project.fileId, objectKey: project.objectKey, coverUrl: project.coverUrl, sourcePageUrl: project.sourcePageUrl })),
    alreadyApplied,
    forwardSql: forwardPath,
    rollbackSql: rollbackPath,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
  if (!apply) {
    console.log("Dry run complete. Source artifact, renderer, rendered bytes, broken cover, SQL, and rollback were verified. No production writes were performed.");
    process.exit(0);
  }
  if (prepared.length === 0) {
    console.log("The exact reviewed derived cover wave is already applied. No writes were needed.");
    process.exit(0);
  }
  for (const project of prepared) {
    const asset = verified.get(project.definition.slug);
    if (!asset) throw new Error(`${project.definition.slug}: verified rendered asset missing`);
    r2Put(buckets[env], project, asset.localPath);
    uploaded.push(project);
    verifyR2(project);
  }
  executeSqlFile(forwardPath);
  verifyApplied(prepared);
  console.log(JSON.stringify({ applied: prepared.map((project) => project.definition.slug), alreadyApplied, report: reportPath, rollback: rollbackPath }, null, 2));
} catch (error) {
  let rollbackError: unknown = null;
  try {
    if (apply && uploaded.length) {
      executeSqlFile(rollbackPath);
      verifyRolledBack(uploaded);
      for (const project of uploaded) r2Delete(buckets[env!], project.objectKey);
    }
  } catch (caught) {
    rollbackError = caught;
  }
  const originalMessage = error instanceof Error ? error.message : String(error);
  const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : rollbackError ? String(rollbackError) : "rollback verified";
  throw new Error(`Reviewed derived project media failed: ${originalMessage}; ${rollbackMessage}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
