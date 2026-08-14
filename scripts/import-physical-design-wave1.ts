import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCandidate, buildForwardSql, buildRollbackSql, canonicalizeUpstreamIdentity, sqlString, type ImportCandidate, type WaveRecord } from '../src/lib/physical-design-wave-import';

const WAVE = 'data/project-waves/2026-08-14-physical-design-wave1.ndjson';
const HARVEST = '/root/.jcode/scratch/robopartpicker-wave1/harvest';
const OWNER = 'robotics-catalog-import';
const PROD_GATE = 'ROBOPARTPICKER_IMPORT_PRODUCTION_APPLY';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const env = arg('--env');
const apply = process.argv.includes('--apply');
if (env !== 'production' && env !== 'preview') throw new Error('Usage: tsx scripts/import-physical-design-wave1.ts --env production|preview [--apply]');
if (apply && env === 'production' && process.env[PROD_GATE] !== 'apply-production-wave1') {
  throw new Error(`Refusing production apply without ${PROD_GATE}=apply-production-wave1`);
}

function wranglerSql(sql: string): string {
  const args = ['d1', 'execute', 'DB', '--env', env, '--remote', '--command', sql];
  return execFileSync('wrangler', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readWave(): WaveRecord[] {
  return readFileSync(WAVE, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as WaveRecord);
}

function manifestFor(slug: string): unknown | undefined {
  const file = readdirSync(HARVEST).find((name) => name === `manifest-${slug}.json`);
  return file ? readJson(join(HARVEST, file)) : undefined;
}

function queryExisting(records: WaveRecord[]): Set<string> {
  const slugs = records.map((r) => sqlString(r.slug)).join(',');
  const repos = records.map((r) => sqlString(r.repository_url)).join(',');
  const identities = records.map((r) => sqlString(canonicalizeUpstreamIdentity(r.repository_url))).join(',');
  const sql = `SELECT slug, repository_url, lower(upstream_identity) AS upstream_identity FROM projects WHERE slug IN (${slugs}) OR repository_url IN (${repos}) OR lower(upstream_identity) IN (${identities});`;
  console.log('Querying D1 for duplicate slug, repository_url, or canonical upstream_identity before generating inserts...');
  const out = wranglerSql(sql);
  const existing = new Set<string>();
  for (const r of records) {
    if (out.includes(r.slug) || out.includes(r.repository_url) || out.toLowerCase().includes(canonicalizeUpstreamIdentity(r.repository_url))) existing.add(r.slug);
  }
  console.log(out);
  return existing;
}

const records = readWave();
const existing = queryExisting(records);
const candidates: ImportCandidate[] = [];
for (const record of records) {
  if (existing.has(record.slug)) {
    console.log(`skip existing ${record.slug}`);
    continue;
  }
  const manifest = manifestFor(record.slug);
  if (!manifest) {
    console.log(`skip missing manifest ${record.slug}`);
    continue;
  }
  candidates.push(buildCandidate(record, manifest));
}

const now = new Date().toISOString();
const scratch = process.env.JCODE_SCRATCH_DIR ?? '/root/.jcode/scratch';
mkdirSync(scratch, { recursive: true });
const forwardPath = join(scratch, `physical-design-wave1-${env}-forward.sql`);
const rollbackPath = join(scratch, `physical-design-wave1-${env}-rollback.sql`);
writeFileSync(forwardPath, buildForwardSql(candidates, now));
writeFileSync(rollbackPath, buildRollbackSql(candidates));
console.log(`Prepared ${candidates.length} candidates as ${OWNER}`);
console.log(`forward: ${forwardPath}`);
console.log(`rollback: ${rollbackPath}`);

if (!apply) {
  console.log('Dry-run only. Re-run with --apply to execute. Production apply also requires explicit gate env var.');
  process.exit(0);
}

console.log('Applying reviewed forward SQL...');
console.log(wranglerSql(readFileSync(forwardPath, 'utf8')));
const verifyIds = candidates.map((c) => sqlString(c.projectId)).join(',') || 'NULL';
const verification = wranglerSql(`SELECT p.id, p.slug, p.project_kind, p.visibility, p.status, p.publishability, p.revision, p.upstream_identity, pv.rpps_schema_version, json_valid(pv.rpps_json) AS rpps_valid, COUNT(bi.id) AS bom_items FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id LEFT JOIN boms b ON b.project_id = p.id LEFT JOIN bom_versions bv ON bv.id = b.current_version_id LEFT JOIN bom_items bi ON bi.bom_version_id = bv.id WHERE p.owner_user_id = '${OWNER}' AND p.id IN (${verifyIds}) GROUP BY p.id ORDER BY p.slug;`);
console.log('Post-apply verification:');
console.log(verification);
