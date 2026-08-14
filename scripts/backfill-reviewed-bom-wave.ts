import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stableId, sqlNumber, sqlString } from '../src/lib/physical-design-wave-import';
import { classifyCompleteness, confidenceFor } from '../src/lib/rpps/bom';
import { validateRpps, type RppsBomItem, type RppsPackage } from '../src/lib/rpps/schema';
import { transformReviewedBomSource, validateReviewedBomWaveDefinition, type ReviewedBomItem, type ReviewedBomProjectDefinition, type ReviewedBomWaveDefinition } from '../src/lib/reviewed-bom-wave';

type EnvName = 'production' | 'preview';
type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string | null;
  visibility: 'private' | 'organization' | 'unlisted' | 'public';
  project_kind: string;
  updated_at: string;
  repository_url: string | null;
  revision: string | null;
  current_version_id: string;
  version_label: string;
  rpps_json: string;
  bom_count: number;
};

type PreparedProject = {
  definition: ReviewedBomProjectDefinition;
  row: ProjectRow;
  items: ReviewedBomItem[];
  nextRpps: RppsPackage;
  bomId: string;
  bomVersionId: string;
  evidence: Array<{ id: string; claimId: string; sourceUrl: string; title: string; sha256: string; path: string }>;
};

const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : undefined;
const waveIndex = args.indexOf('--wave');
const wavePath = waveIndex >= 0 ? args[waveIndex + 1] : 'data/bom-waves/2026-08-14-reviewed-wave2.json';
const apply = args.includes('--apply');
const scratch = process.env.JCODE_SCRATCH_DIR;
const wave = JSON.parse(readFileSync(resolve(wavePath), 'utf8')) as ReviewedBomWaveDefinition;

if (env !== 'production' && env !== 'preview') {
  console.error('Usage: tsx scripts/backfill-reviewed-bom-wave.ts --env production|preview [--wave data/bom-waves/2026-08-14-reviewed-wave2.json] [--apply]');
  process.exit(2);
}
if (!scratch) {
  console.error('JCODE_SCRATCH_DIR is required so generated SQL and rollback files remain reviewable outside the repository.');
  process.exit(2);
}
if (apply && env === 'production' && process.env.ALLOW_PRODUCTION_REVIEWED_BOM_WAVE !== '1') {
  console.error('Production apply is blocked. Set ALLOW_PRODUCTION_REVIEWED_BOM_WAVE=1 only after reviewing the dry run and generated SQL.');
  process.exit(2);
}

const definitionErrors = validateReviewedBomWaveDefinition(wave);
if (definitionErrors.length) throw new Error(`Invalid reviewed BOM wave:\n${definitionErrors.join('\n')}`);

function canonicalRepo(value: string): string {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\.git$/iu, '').replace(/\/+$/u, '').toLowerCase()}`;
}

function wrangler(command: string): Array<Record<string, unknown>> {
  const output = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--env', env!, '--remote', '--command', command, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed.flatMap((page) => page.results ?? []);
}

function loadProjectRows(): ProjectRow[] {
  const slugs = wave.projects.map((project) => sqlString(project.project_id)).join(', ');
  return wrangler(`SELECT p.id, p.slug, p.name, p.owner_user_id, p.visibility, p.project_kind, p.updated_at, p.repository_url, p.revision, p.current_version_id, pv.version_label, pv.rpps_json, (SELECT COUNT(*) FROM boms b WHERE b.project_id = p.id) AS bom_count FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.slug IN (${slugs}) ORDER BY p.slug`) as unknown as ProjectRow[];
}

function cloneAndRead(project: ReviewedBomProjectDefinition, root: string): Map<string, Uint8Array> {
  const directory = join(root, project.project_id.replace(/[^a-z0-9._-]/giu, '-'));
  execFileSync('git', ['clone', '--mirror', '--filter=blob:none', '--quiet', project.repo_url, directory], { stdio: 'inherit' });
  const actualRevision = execFileSync('git', ['-C', directory, 'rev-parse', project.revision], { encoding: 'utf8' }).trim();
  if (actualRevision.toLowerCase() !== project.revision.toLowerCase()) throw new Error(`${project.project_id}: revision mismatch ${actualRevision}`);
  const files = new Map<string, Uint8Array>();
  for (const source of project.sources) {
    const bytes = execFileSync('git', ['-C', directory, 'show', `${project.revision}:${source.path}`]);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== source.sha256) throw new Error(`${project.project_id}/${source.path}: sha256 ${digest} != ${source.sha256}`);
    files.set(source.path, new Uint8Array(bytes));
  }
  return files;
}

function sourceBlobUrl(project: ReviewedBomProjectDefinition, path: string): string {
  const base = project.repo_url.replace(/\.git$/iu, '').replace(/\/+$/u, '');
  return `${base}/blob/${project.revision}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function rppsItem(item: ReviewedBomItem): RppsBomItem {
  const rowNote = typeof item.metadata['备注'] === 'string' ? item.metadata['备注'].trim() : '';
  const location = typeof item.metadata.location === 'string' ? item.metadata.location.trim() : '';
  const notes = [item.mpn ? `Model: ${item.mpn}` : '', rowNote, location ? `Location: ${location}` : '', `Reviewed source: ${item.provenance.source_path} row ${item.provenance.row_index}`]
    .filter(Boolean).join('. ').slice(0, 1000);
  return {
    ref: item.ref,
    name: item.name.slice(0, 500),
    qty: Math.max(1, Math.trunc(item.quantity)),
    category: item.category,
    mpn: item.mpn,
    supplier_url: item.source_url,
    fabricated: item.fabricated,
    notes,
  };
}

function normalizedNotes(item: ReviewedBomItem): string {
  const rowNote = typeof item.metadata['备注'] === 'string' ? item.metadata['备注'].trim() : '';
  const details = [
    item.mpn ? `Model: ${item.mpn}` : '',
    rowNote,
    `Reviewed explicit BOM source ${item.provenance.source_path} at ${item.provenance.revision}, row ${item.provenance.row_index}.`,
  ].filter(Boolean).join(' ');
  return details.slice(0, 1000);
}

function prepareProject(definition: ReviewedBomProjectDefinition, row: ProjectRow, files: Map<string, Uint8Array>, retrievedAt: string): PreparedProject {
  if (row.slug !== definition.project_id) throw new Error(`${definition.project_id}: slug mismatch`);
  if (!row.current_version_id || !row.rpps_json) throw new Error(`${definition.project_id}: missing current version manifest`);
  if (canonicalRepo(row.repository_url ?? '') !== canonicalRepo(definition.repo_url)) throw new Error(`${definition.project_id}: repository mismatch ${row.repository_url}`);
  if ((row.revision ?? '').toLowerCase() !== definition.revision.toLowerCase()) throw new Error(`${definition.project_id}: catalog revision ${row.revision} does not match reviewed revision ${definition.revision}`);
  if (Number(row.bom_count) !== 0) throw new Error(`${definition.project_id}: normalized BOM already exists; refusing to overwrite it`);

  const original = JSON.parse(row.rpps_json) as RppsPackage;
  if (Array.isArray(original.bom) && original.bom.length > 0) throw new Error(`${definition.project_id}: portable BOM already has ${original.bom.length} lines`);
  if (canonicalRepo(original.repo_url ?? '') !== canonicalRepo(definition.repo_url)) throw new Error(`${definition.project_id}: portable manifest repository mismatch ${original.repo_url}`);

  const items = definition.sources.flatMap((source) => {
    const bytes = files.get(source.path);
    if (!bytes) throw new Error(`${definition.project_id}/${source.path}: source was not loaded`);
    const transformed = transformReviewedBomSource(definition, source, source.format === 'markdown' ? new TextDecoder().decode(bytes) : bytes);
    if (source.expected_items != null && transformed.length !== source.expected_items) {
      throw new Error(`${definition.project_id}/${source.path}: transformed ${transformed.length} lines; expected ${source.expected_items}`);
    }
    return transformed;
  });
  if (!items.length) throw new Error(`${definition.project_id}: no BOM lines survived conservative transformation`);
  const refs = new Set(items.map((item) => item.ref));
  if (refs.size !== items.length) throw new Error(`${definition.project_id}: duplicate deterministic BOM refs`);

  const uniqueSources = [...new Map(definition.sources.map((source) => [source.path, source])).values()];
  const sourceEvidence = uniqueSources.map((source) => ({
    claim: `BOM lines were extracted from ${source.path} at immutable revision ${definition.revision}.`,
    source_type: 'repo' as const,
    source_url: sourceBlobUrl(definition, source.path),
    retrieved_at: retrievedAt,
    confidence: 0.98,
  }));
  const priorEvidence = Array.isArray(original.evidence) ? original.evidence : [];
  const nextRpps = { ...original, bom: items.map(rppsItem), evidence: [...priorEvidence, ...sourceEvidence] };
  const validation = validateRpps(nextRpps);
  if (!validation.ok) throw new Error(`${definition.project_id}: generated RPPS failed validation: ${validation.errors.join('; ')}`);

  return {
    definition,
    row,
    items,
    nextRpps: validation.data,
    bomId: stableId('bom', `${row.id}:${wave.wave}`),
    bomVersionId: stableId('bver', `${row.current_version_id}:${wave.wave}`),
    evidence: uniqueSources.map((source) => ({
      id: stableId('evidence', `${row.id}:${definition.revision}:${source.path}`),
      claimId: stableId('eclaim', `${row.id}:${definition.revision}:${source.path}:bom-source`),
      sourceUrl: sourceBlobUrl(definition, source.path),
      title: `${row.name} reviewed BOM source: ${source.path}`,
      sha256: source.sha256,
      path: source.path,
    })),
  };
}

function buildForwardSql(projects: PreparedProject[], now: string): string {
  const lines: string[] = [];
  for (const project of projects) {
    const { row, definition } = project;
    lines.push(`INSERT INTO boms (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at) SELECT ${sqlString(project.bomId)}, ${sqlString(row.id)}, ${sqlString(row.owner_user_id)}, ${sqlString(`${row.slug}-bom`)}, ${sqlString(`${row.name} BOM`)}, ${sqlString(project.bomVersionId)}, ${sqlString(row.visibility)}, 0, ${sqlString(now)}, ${sqlString(now)} FROM project_versions pv WHERE pv.id = ${sqlString(row.current_version_id)} AND pv.project_id = ${sqlString(row.id)} AND pv.rpps_json = ${sqlString(row.rpps_json)} AND NOT EXISTS (SELECT 1 FROM boms existing WHERE existing.project_id = ${sqlString(row.id)});`);
    lines.push(`INSERT INTO bom_versions (id, bom_id, version_label, notes, currency, created_by_user_id, created_at) VALUES (${sqlString(project.bomVersionId)}, (SELECT id FROM boms WHERE id = ${sqlString(project.bomId)} AND project_id = ${sqlString(row.id)} AND created_at = ${sqlString(now)}), ${sqlString(row.version_label)}, ${sqlString(`Reviewed explicit BOM wave ${wave.wave}; sources pinned to ${definition.revision}.`)}, 'USD', ${sqlString(row.owner_user_id)}, ${sqlString(now)});`);
    project.items.forEach((item, index) => {
      const itemId = stableId('bitem', `${row.id}:${project.bomVersionId}:${item.ref}`);
      const evidenceLocator = item.source_url ?? sourceBlobUrl(definition, item.provenance.source_path);
      const completeness = classifyCompleteness({ fabricated: item.fabricated === true, missingQty: false, mpn: item.mpn }, 'explicit-bom');
      lines.push(`INSERT INTO bom_items (id, bom_version_id, slot_key, description, quantity, unit, notes, sort_order, extraction_method, completeness, evidence_locator, confidence) VALUES (${sqlString(itemId)}, ${sqlString(project.bomVersionId)}, ${sqlString(item.ref)}, ${sqlString(item.name.slice(0, 500))}, ${sqlNumber(item.quantity)}, 'each', ${sqlString(normalizedNotes(item))}, ${index}, 'explicit-bom', ${sqlString(completeness)}, ${sqlString(evidenceLocator)}, ${sqlNumber(confidenceFor(completeness))});`);
    });
    for (const evidence of project.evidence) {
      lines.push(`INSERT INTO evidence (id, source_type, source_url, title, publisher, retrieved_at, confidence, content_hash, excerpt, is_demo, created_at) VALUES (${sqlString(evidence.id)}, 'repo', ${sqlString(evidence.sourceUrl)}, ${sqlString(evidence.title)}, ${sqlString(new URL(definition.repo_url).hostname)}, ${sqlString(now)}, 0.98, ${sqlString(`sha256:${evidence.sha256}`)}, ${sqlString(`Explicit BOM source ${evidence.path} at immutable revision ${definition.revision}.`)}, 0, ${sqlString(now)});`);
      lines.push(`INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, confidence, created_at) VALUES (${sqlString(evidence.claimId)}, ${sqlString(evidence.id)}, 'project', ${sqlString(row.id)}, 'bom.source', ${sqlString(`${evidence.path}@${definition.revision}`)}, 0.98, ${sqlString(now)});`);
    }
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(JSON.stringify(project.nextRpps))} WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND rpps_json = ${sqlString(row.rpps_json)};`);
    lines.push(`UPDATE projects SET project_kind = 'physical_design', updated_at = ${sqlString(now)} WHERE id = ${sqlString(row.id)} AND current_version_id = ${sqlString(row.current_version_id)};`);
  }
  return `${lines.join('\n')}\n`;
}

function buildRollbackSql(projects: PreparedProject[], now: string): string {
  const lines: string[] = [`-- Guarded rollback for reviewed BOM ${wave.wave}.`];
  for (const project of [...projects].reverse()) {
    const currentWaveGuard = `EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(project.row.current_version_id)} AND pv.project_id = ${sqlString(project.row.id)} AND pv.rpps_json = ${sqlString(JSON.stringify(project.nextRpps))})`;
    lines.push(`DELETE FROM evidence_claims WHERE id IN (${project.evidence.map((item) => sqlString(item.claimId)).join(', ')}) AND created_at = ${sqlString(now)} AND ${currentWaveGuard};`);
    lines.push(`DELETE FROM evidence WHERE id IN (${project.evidence.map((item) => sqlString(item.id)).join(', ')}) AND created_at = ${sqlString(now)} AND ${currentWaveGuard};`);
    lines.push(`DELETE FROM boms WHERE id = ${sqlString(project.bomId)} AND project_id = ${sqlString(project.row.id)} AND created_at = ${sqlString(now)} AND updated_at = ${sqlString(now)} AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(project.row.current_version_id)} AND pv.project_id = ${sqlString(project.row.id)} AND pv.rpps_json = ${sqlString(JSON.stringify(project.nextRpps))});`);
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(project.row.rpps_json)} WHERE id = ${sqlString(project.row.current_version_id)} AND project_id = ${sqlString(project.row.id)} AND rpps_json = ${sqlString(JSON.stringify(project.nextRpps))};`);
    lines.push(`UPDATE projects SET project_kind = ${sqlString(project.row.project_kind)}, updated_at = ${sqlString(project.row.updated_at)} WHERE id = ${sqlString(project.row.id)} AND current_version_id = ${sqlString(project.row.current_version_id)} AND project_kind = 'physical_design' AND updated_at = ${sqlString(now)};`);
  }
  return `${lines.join('\n')}\n`;
}

mkdirSync(scratch, { recursive: true });
const retrievedAt = new Date().toISOString();
const tempRoot = mkdtempSync(join(scratch, 'reviewed-bom-wave-'));
try {
  const rows = loadProjectRows();
  if (rows.length !== wave.projects.length) {
    const found = new Set(rows.map((row) => row.slug));
    throw new Error(`Expected ${wave.projects.length} catalog projects, found ${rows.length}; missing ${wave.projects.filter((project) => !found.has(project.project_id)).map((project) => project.project_id).join(', ')}`);
  }
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const projects = wave.projects.map((definition) => prepareProject(definition, bySlug.get(definition.project_id)!, cloneAndRead(definition, tempRoot), retrievedAt));
  const stamp = retrievedAt.replace(/[:.]/gu, '-');
  const sqlPath = join(scratch, `reviewed-bom-wave-${env}-${stamp}.sql`);
  const rollbackPath = join(scratch, `rollback-reviewed-bom-wave-${env}-${stamp}.sql`);
  const reportPath = join(scratch, `reviewed-bom-wave-${env}-${stamp}.json`);
  writeFileSync(sqlPath, buildForwardSql(projects, retrievedAt));
  writeFileSync(rollbackPath, buildRollbackSql(projects, retrievedAt));
  const report = {
    mode: apply ? 'apply' : 'dry-run', env, wave: wave.wave, retrievedAt, sqlPath, rollbackPath,
    projects: projects.map((project) => ({
      slug: project.row.slug,
      projectId: project.row.id,
      revision: project.definition.revision,
      sources: project.definition.sources.length,
      bomLines: project.items.length,
      identifiedModels: project.items.filter((item) => item.mpn).length,
      fabricatedLines: project.items.filter((item) => item.fabricated).length,
      supplierLinks: project.items.filter((item) => item.source_url).length,
    })),
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  if (!apply) {
    console.log('Dry run only. No D1 writes were performed. Review the SQL and rollback files before applying.');
  } else {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--env', env, '--remote', '--file', sqlPath], { stdio: 'inherit' });
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
