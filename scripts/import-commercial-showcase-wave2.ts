import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commercialShowcaseWave2Records } from '../data/project-waves/2026-08-16-commercial-showcase-wave2';
import { buildCommercialForwardSql, buildCommercialRollbackSql, buildCommercialShowcaseCandidate, commercialProjectId, commercialVersionId, findExistingCommercialShowcaseSlugs, type ExistingCommercialProjectIdentity } from '../src/lib/commercial-showcase-import';
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
if (env !== 'production' && env !== 'preview') throw new Error('Usage: tsx scripts/import-commercial-showcase-wave2.ts --env production|preview [--apply]');
if (apply && env === 'production' && process.env[PROD_GATE] !== 'apply-production-commercial-showcase-wave2') {
  throw new Error(`Refusing production apply without ${PROD_GATE}=apply-production-commercial-showcase-wave2`);
}

type WranglerStatement<T> = { results?: T[] };

function wranglerRows<T>(sql: string): T[] {
  const statements = captureWranglerJson<Array<WranglerStatement<T>>>(['d1', 'execute', 'DB', '--env', env, '--remote', '--command', sql]);
  return statements.flatMap((statement) => statement.results ?? []);
}

for (const record of commercialShowcaseWave2Records) {
  if (!record.slug || !record.name || !record.maintainer || !record.summary || !record.revision) throw new Error(`Wave 2 record is missing required identity fields: ${record.slug}`);
  if (record.upstream_url !== record.docs_url) throw new Error(`Wave 2 record ${record.slug} must use the official URL for docs_url and upstream_url`);
  if (!Array.isArray(record.specs) || record.specs.length === 0) throw new Error(`Wave 2 record ${record.slug} requires source-backed specs`);
  if (!record.tags.includes('commercial-showcase') || !record.tags.includes('closed-source')) throw new Error(`Wave 2 record ${record.slug} is missing required tags`);
}

const projects = wranglerRows<ExistingCommercialProjectIdentity>('SELECT id, slug, repository_url, upstream_url, lower(upstream_identity) AS upstream_identity, current_version_id FROM projects;');
const versionIds = commercialShowcaseWave2Records.map((record) => commercialVersionId(commercialProjectId(record.slug), record.revision));
const versions = wranglerRows<{ id: string; project_id: string }>(`SELECT id, project_id FROM project_versions WHERE id IN (${versionIds.map(sqlString).join(',') || 'NULL'});`);
const existing = findExistingCommercialShowcaseSlugs(commercialShowcaseWave2Records, projects, versions);
console.log(`Preflight: ${existing.size} Wave 2 showcase projects already exist.`);

const candidates = commercialShowcaseWave2Records.filter((record) => !existing.has(record.slug)).map(buildCommercialShowcaseCandidate);

const now = new Date().toISOString();
const scratch = process.env.JCODE_SCRATCH_DIR ?? '/root/.jcode/scratch';
mkdirSync(scratch, { recursive: true });
const stamp = now.replace(/[:.]/g, '-');
const forwardPath = join(scratch, `commercial-showcase-wave2-${env}-${stamp}-forward.sql`);
const rollbackPath = join(scratch, `commercial-showcase-wave2-${env}-${stamp}-rollback.sql`);
writeFileSync(forwardPath, buildCommercialForwardSql(candidates, now));
writeFileSync(rollbackPath, buildCommercialRollbackSql(candidates));
console.log(`Prepared ${candidates.length} Wave 2 candidates as ${OWNER}`);
console.log(`forward: ${forwardPath}`);

if (!apply) {
  console.log('DRY RUN ONLY. Review the SQL, then rerun with --apply.');
  process.exit(0);
}
runWrangler(['d1', 'execute', 'DB', '--env', env, '--remote', '--file', forwardPath]);
console.log('APPLIED');
