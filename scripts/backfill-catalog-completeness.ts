import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildVerifiedBackfillRollbackSql, buildVerifiedBackfillSql, selectHarvestArtifacts, sqlString, type HarvestManifest, type SelectedArtifact, type SelectionSummary, type VerifiedArtifact } from '../src/lib/catalog-completeness-backfill';

type EnvName = 'production' | 'preview';

const args = process.argv.slice(2);
const envArgIndex = args.indexOf('--env');
const env = envArgIndex >= 0 ? args[envArgIndex + 1] as EnvName : undefined;
const apply = args.includes('--apply');
const manifestDir = process.env.HARVEST_MANIFEST_DIR ?? '.ingest/bom-harvest-2026-08-12';
const scratch = process.env.JCODE_SCRATCH_DIR;
const r2Python = process.env.R2_PYTHON ?? '/root/.jcode/scratch/r2-venv/bin/python';
const buckets: Record<EnvName, string> = { production: 'robopartpicker-files', preview: 'robopartpicker-preview-files' };

if (env !== 'production' && env !== 'preview') {
  console.error('Usage: tsx scripts/backfill-catalog-completeness.ts --env production|preview [--apply]');
  process.exit(2);
}
if (apply && env === 'production' && process.env.ALLOW_PRODUCTION_CATALOG_BACKFILL !== '1') {
  console.error('Production apply is blocked. Set ALLOW_PRODUCTION_CATALOG_BACKFILL=1 only after reviewing dry-run output and SQL.');
  process.exit(2);
}
if (!scratch) {
  console.error('JCODE_SCRATCH_DIR is required so generated SQL is reviewable and outside the repo.');
  process.exit(2);
}

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function loadPhysicalDesignSlugs(): Set<string> {
  const sql = "SELECT slug FROM projects WHERE project_kind = 'physical_design' AND deleted_at IS NULL AND current_version_id IS NOT NULL ORDER BY slug";
  const output = wrangler(['d1', 'execute', 'DB', '--env', env, '--remote', '--command', sql, '--json']);
  const parsed = JSON.parse(output) as Array<{ results?: Array<{ slug?: string }> }>;
  return new Set(parsed.flatMap((page) => page.results ?? []).map((row) => row.slug).filter((slug): slug is string => typeof slug === 'string'));
}

function loadSummaries(physicalDesignSlugs: Set<string>): SelectionSummary[] {
  return readdirSync(manifestDir)
    .filter((name) => /^manifest-.+\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(manifestDir, name), 'utf8')) as HarvestManifest)
    .map((manifest) => selectHarvestArtifacts(manifest, physicalDesignSlugs))
    .filter((summary) => summary.files.length > 0 || Object.keys(summary.skipped).length > 0);
}

function r2Head(bucket: string, key: string): { size: number; sha256: string | null } | null {
  const code = `import sys, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\ns3=r2.get_client()\ntry:\n o=s3.head_object(Bucket=sys.argv[1], Key=sys.argv[2]); print(str(o.get('ContentLength',-1))+' '+o.get('Metadata',{}).get('sha256',''))\nexcept Exception:\n sys.exit(3)\n`;
  const result = spawnSync(r2Python, ['-c', code, bucket, key], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const [size, sha256] = result.stdout.trim().split(' ');
  return { size: Number(size), sha256: sha256 || null };
}

function r2Put(bucket: string, key: string, filePath: string, sha256: string, mediaType: string) {
  const code = `import sys, importlib.util\nspec=importlib.util.spec_from_file_location('r2','/root/.cloudflare/r2.py')\nr2=importlib.util.module_from_spec(spec); spec.loader.exec_module(r2)\ns3=r2.get_client()\ns3.upload_file(sys.argv[3], sys.argv[1], sys.argv[2], ExtraArgs={'Metadata': {'sha256': sys.argv[4]}, 'ContentType': sys.argv[5]})\n`;
  execFileSync(r2Python, ['-c', code, bucket, key, filePath, sha256, mediaType], { stdio: 'inherit' });
}

async function downloadAndVerify(file: SelectedArtifact, tempDir: string): Promise<string> {
  const response = await fetch(file.sourceUrl);
  if (!response.ok) throw new Error(`download failed ${response.status} ${file.sourceUrl}`);
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > file.sizeBytes) throw new Error(`source content-length exceeds manifest size for ${file.slug}/${file.relativePath}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== file.sizeBytes) throw new Error(`size mismatch for ${file.slug}/${file.relativePath}: ${bytes.byteLength} != ${file.sizeBytes}`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== file.checksumSha256) throw new Error(`sha256 mismatch for ${file.slug}/${file.relativePath}`);
  const path = join(tempDir, file.fileId.replace(/[^a-z0-9._-]/gi, '_'));
  writeFileSync(path, bytes);
  return path;
}

type UploadRejection = { slug: string; relativePath: string; reason: string };

async function uploadVerified(files: SelectedArtifact[], bucket: string): Promise<{ verified: VerifiedArtifact[]; rejected: UploadRejection[] }> {
  const tempDir = mkdtempSync(join(scratch!, 'catalog-backfill-'));
  try {
    const verified: VerifiedArtifact[] = [];
    const rejected: UploadRejection[] = [];
    for (const [index, file] of files.entries()) {
      try {
        const existing = r2Head(bucket, file.objectKey);
        if (existing?.size === file.sizeBytes && existing.sha256 === file.checksumSha256) {
          verified.push({ ...file, r2Bucket: bucket });
        } else {
          const localPath = await downloadAndVerify(file, tempDir);
          r2Put(bucket, file.objectKey, localPath, file.checksumSha256, file.mediaType);
          const head = r2Head(bucket, file.objectKey);
          if (head?.size !== file.sizeBytes || head.sha256 !== file.checksumSha256) throw new Error(`R2 HEAD verification failed for ${bucket}/${file.objectKey}`);
          verified.push({ ...file, r2Bucket: bucket });
        }
      } catch (error) {
        rejected.push({
          slug: file.slug,
          relativePath: file.relativePath,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: files.length, unit: 'artifacts', message: `Verified ${verified.length}; rejected ${rejected.length}` })}`);
    }
    return { verified, rejected };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const physicalDesignSlugs = loadPhysicalDesignSlugs();
const summaries = loadSummaries(physicalDesignSlugs);
const selected = summaries.flatMap((summary) => summary.files);
const totals = summaries.reduce((acc, summary) => {
  acc.projects += summary.files.length > 0 ? 1 : 0;
  acc.files += summary.files.length;
  for (const [key, count] of Object.entries(summary.skipped)) acc.skipped[key] = (acc.skipped[key] ?? 0) + count;
  return acc;
}, { physicalDesignProjects: physicalDesignSlugs.size, projects: 0, files: 0, skipped: {} as Record<string, number> });

mkdirSync(scratch, { recursive: true });
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', env, bucket: buckets[env], manifestDir, totals }, null, 2));

if (!apply) {
  console.log('Dry run only. No downloads, R2 uploads, or D1 writes were performed.');
  process.exit(0);
}

const { verified, rejected } = await uploadVerified(selected, buckets[env]);
if (!verified.length) throw new Error(`No artifacts passed source and R2 verification; rejected ${rejected.length}.`);
const runTimestamp = new Date().toISOString();
const sql = buildVerifiedBackfillSql(verified, sqlString(runTimestamp));
const rollbackSql = buildVerifiedBackfillRollbackSql(verified, runTimestamp);
const stamp = runTimestamp.replace(/[:.]/g, '-');
const out = join(scratch, `catalog-completeness-backfill-${env}-${stamp}.sql`);
const rollback = join(scratch, `rollback-catalog-completeness-backfill-${env}-${stamp}.sql`);
writeFileSync(out, sql);
writeFileSync(rollback, rollbackSql);
const rejectionReport = join(scratch, `catalog-completeness-rejections-${env}-${stamp}.json`);
writeFileSync(rejectionReport, `${JSON.stringify(rejected, null, 2)}\n`);
console.log(JSON.stringify({ verifiedFiles: verified.length, rejectedFiles: rejected.length, rejectionReport, sql: out, rollback }, null, 2));
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--env', env, '--remote', '--file', out], { stdio: 'inherit' });
