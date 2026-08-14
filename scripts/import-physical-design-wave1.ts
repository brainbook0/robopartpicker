import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCandidate,
  buildForwardSql,
  buildRollbackSql,
  findExistingWaveSlugs,
  sqlString,
  stableId,
  validateWaveRecords,
  type ExistingProjectIdentity,
  type ExistingVersionIdentity,
  type ImportCandidate,
  type WaveRecord,
} from '../src/lib/physical-design-wave-import';
import { captureWranglerJson, runWrangler } from './wrangler-cli';

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

type WranglerStatement<T> = {
  results?: T[];
};

function wranglerRows<T>(sql: string): T[] {
  const statements = captureWranglerJson<Array<WranglerStatement<T>>>(['d1', 'execute', 'DB', '--env', env, '--remote', '--command', sql]);
  return statements.flatMap((statement) => statement.results ?? []);
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
  console.log('Querying D1 for project, slug, canonical repository, upstream, and generated version identity conflicts...');
  const projects = wranglerRows<ExistingProjectIdentity>(
    'SELECT id, slug, repository_url, lower(upstream_identity) AS upstream_identity, current_version_id FROM projects;',
  );
  const versionIds = records.map((record) => stableId('pver', `${record.id}:version:${record.revision}`));
  const versions = wranglerRows<ExistingVersionIdentity>(
    `SELECT id, project_id FROM project_versions WHERE id IN (${versionIds.map(sqlString).join(',') || 'NULL'});`,
  );
  const existing = findExistingWaveSlugs(records, projects, versions);
  console.log(`Preflight inspected ${projects.length} projects and ${versions.length} matching generated version IDs; ${existing.size} Wave 1 projects already exist.`);
  return existing;
}

const records = readWave();
validateWaveRecords(records);
const existing = queryExisting(records);
const candidates: ImportCandidate[] = [];
for (const record of records) {
  if (existing.has(record.slug)) {
    console.log(`skip existing ${record.slug}`);
    continue;
  }
  const manifest = manifestFor(record.slug);
  if (!manifest) throw new Error(`Missing immutable harvest manifest for ${record.slug}`);
  candidates.push(buildCandidate(record, manifest));
}

const now = new Date().toISOString();
const scratch = process.env.JCODE_SCRATCH_DIR ?? '/root/.jcode/scratch';
mkdirSync(scratch, { recursive: true });
const stamp = now.replace(/[:.]/g, '-');
const forwardPath = join(scratch, `physical-design-wave1-${env}-${stamp}-forward.sql`);
const rollbackPath = join(scratch, `physical-design-wave1-${env}-${stamp}-rollback.sql`);
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
runWrangler(['d1', 'execute', 'DB', '--env', env, '--remote', '--file', forwardPath]);
const verifyIds = candidates.map((c) => sqlString(c.projectId)).join(',') || 'NULL';
const verification = wranglerRows(`SELECT p.id, p.slug, p.project_kind, p.visibility, p.status, p.publishability, p.revision, p.upstream_identity, pv.rpps_schema_version, json_valid(pv.rpps_json) AS rpps_valid, COUNT(bi.id) AS bom_items FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id LEFT JOIN boms b ON b.project_id = p.id LEFT JOIN bom_versions bv ON bv.id = b.current_version_id LEFT JOIN bom_items bi ON bi.bom_version_id = bv.id WHERE p.owner_user_id = '${OWNER}' AND p.id IN (${verifyIds}) GROUP BY p.id ORDER BY p.slug;`);
if (verification.length !== candidates.length) throw new Error(`Post-apply verification returned ${verification.length} of ${candidates.length} imported projects. Rollback SQL: ${rollbackPath}`);
console.log('Post-apply verification:');
console.log(JSON.stringify(verification, null, 2));
