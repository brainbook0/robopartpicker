import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commercialShowcaseWave1Records } from '../data/project-waves/2026-08-14-commercial-showcase-wave1';
import { buildCommercialForwardSql, buildCommercialRollbackSql, buildCommercialShowcaseCandidate, commercialProjectId, commercialVersionId, findExistingCommercialShowcaseSlugs, validateCommercialShowcaseRecords, type ExistingCommercialProjectIdentity } from '../src/lib/commercial-showcase-import';
import { sqlString } from '../src/lib/physical-design-wave-import';
import { captureWranglerJson, runWrangler } from './wrangler-cli';

const OWNER = 'robotics-catalog-import';
const PROD_GATE = 'ROBOPARTPICKER_IMPORT_PRODUCTION_APPLY';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const env = arg('--env');
const apply = process.argv.includes('--apply');
if (env !== 'production' && env !== 'preview') throw new Error('Usage: tsx scripts/import-commercial-showcase-wave1.ts --env production|preview [--apply]');
if (apply && env === 'production' && process.env[PROD_GATE] !== 'apply-production-commercial-showcase-wave1') {
  throw new Error(`Refusing production apply without ${PROD_GATE}=apply-production-commercial-showcase-wave1`);
}

type WranglerStatement<T> = { results?: T[] };

function wranglerRows<T>(sql: string): T[] {
  const statements = captureWranglerJson<Array<WranglerStatement<T>>>(['d1', 'execute', 'DB', '--env', env, '--remote', '--command', sql]);
  return statements.flatMap((statement) => statement.results ?? []);
}

function queryExisting() {
  console.log('Querying D1 for project, slug, repository, upstream, and generated version identity conflicts...');
  const projects = wranglerRows<ExistingCommercialProjectIdentity>('SELECT id, slug, repository_url, upstream_url, lower(upstream_identity) AS upstream_identity, current_version_id FROM projects;');
  const versionIds = commercialShowcaseWave1Records.map((record) => commercialVersionId(commercialProjectId(record.slug), record.revision));
  const versions = wranglerRows<{ id: string; project_id: string }>(`SELECT id, project_id FROM project_versions WHERE id IN (${versionIds.map(sqlString).join(',') || 'NULL'});`);
  const existing = findExistingCommercialShowcaseSlugs(commercialShowcaseWave1Records, projects, versions);
  console.log(`Preflight inspected ${projects.length} projects and ${versions.length} matching generated version IDs; ${existing.size} commercial showcase Wave 1 projects already exist.`);
  return existing;
}

validateCommercialShowcaseRecords(commercialShowcaseWave1Records);
const existing = queryExisting();
const candidates = commercialShowcaseWave1Records.filter((record) => {
  if (existing.has(record.slug)) {
    console.log(`skip existing ${record.slug}`);
    return false;
  }
  return true;
}).map(buildCommercialShowcaseCandidate);

const now = new Date().toISOString();
const scratch = process.env.JCODE_SCRATCH_DIR ?? '/root/.jcode/scratch';
mkdirSync(scratch, { recursive: true });
const stamp = now.replace(/[:.]/g, '-');
const forwardPath = join(scratch, `commercial-showcase-wave1-${env}-${stamp}-forward.sql`);
const rollbackPath = join(scratch, `commercial-showcase-wave1-${env}-${stamp}-rollback.sql`);
writeFileSync(forwardPath, buildCommercialForwardSql(candidates, now));
writeFileSync(rollbackPath, buildCommercialRollbackSql(candidates));
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
const verification = wranglerRows(`SELECT p.id, p.slug, p.project_kind, p.visibility, p.status, p.license_spdx, p.repository_url, p.upstream_url, p.upstream_identity, p.maintainer, p.publishability, pv.rpps_schema_version, json_valid(pv.rpps_json) AS rpps_valid, COUNT(si.entity_id) AS search_rows FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id LEFT JOIN search_index si ON si.entity_type = 'project' AND si.entity_id = p.id WHERE p.owner_user_id = '${OWNER}' AND p.project_kind = 'commercial_showcase' AND p.id IN (${verifyIds}) GROUP BY p.id ORDER BY p.slug;`);
if (verification.length !== candidates.length) throw new Error(`Post-apply verification returned ${verification.length} of ${candidates.length} imported projects. Rollback SQL: ${rollbackPath}`);
const missingSearch = verification.filter((row) => Number((row as { search_rows?: number }).search_rows ?? 0) < 1);
if (missingSearch.length > 0) throw new Error(`Post-apply verification found missing search_index rows. Rollback SQL: ${rollbackPath}`);
console.log('Post-apply verification:');
console.log(JSON.stringify(verification, null, 2));
