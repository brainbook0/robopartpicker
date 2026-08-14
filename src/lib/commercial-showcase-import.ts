import { resolveUpstreamIdentity } from '../shared/provenance';
import { stableId, sqlString } from './physical-design-wave-import';

export type CommercialShowcaseRecord = {
  slug: string;
  name: string;
  maintainer: string;
  upstream_url: string;
  docs_url: string;
  revision: string;
  category: string;
  summary: string;
  specs: string[];
  tags: string[];
  retrieved_at: string;
  confidence: number;
};

export type CommercialShowcaseCandidate = {
  projectId: string;
  versionId: string;
  canonicalUpstreamIdentity: string;
  record: CommercialShowcaseRecord;
  rppsJson: string;
};

export type ExistingCommercialProjectIdentity = {
  id: string;
  slug: string;
  repository_url: string | null;
  upstream_url: string | null;
  upstream_identity: string | null;
  current_version_id: string | null;
};

const OWNER = 'robotics-catalog-import';
const PROJECT_KIND = 'commercial_showcase';
const REQUIRED_TAGS = ['commercial-showcase', 'closed-source'];

export function commercialProjectId(slug: string): string {
  return stableId('proj', `commercial-showcase:${slug}`);
}

export function commercialVersionId(projectId: string, revision: string): string {
  return stableId('pver', `${projectId}:commercial-showcase:${revision}`);
}

function identityFor(record: CommercialShowcaseRecord): string {
  const identity = resolveUpstreamIdentity({ upstreamUrl: record.upstream_url, repositoryUrl: null });
  if (!identity) throw new Error(`Commercial showcase record ${record.slug} requires an official HTTP(S) upstream_url`);
  return identity;
}

export function validateCommercialShowcaseRecords(records: CommercialShowcaseRecord[]): void {
  if (records.length !== 12) throw new Error(`Commercial showcase Wave 1 requires exactly 12 records; got ${records.length}`);
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const upstreams = new Set<string>();
  for (const record of records) {
    if (!record.slug || !record.name || !record.maintainer || !record.summary || !record.revision) throw new Error(`Commercial showcase record is missing required identity fields`);
    if (record.upstream_url !== record.docs_url) throw new Error(`Commercial showcase record ${record.slug} must use the official URL for docs_url and upstream_url`);
    if (!Array.isArray(record.specs) || record.specs.length === 0) throw new Error(`Commercial showcase record ${record.slug} requires source-backed specs`);
    for (const tag of REQUIRED_TAGS) if (!record.tags.includes(tag)) throw new Error(`Commercial showcase record ${record.slug} is missing required tag ${tag}`);
    if (record.tags.includes('open-source') || record.tags.includes('physical-design')) throw new Error(`Commercial showcase record ${record.slug} has incompatible reproducibility tags`);
    if (!/^2026-08-14T/.test(record.retrieved_at)) throw new Error(`Commercial showcase record ${record.slug} must carry report retrieval timestamp`);
    if (!(record.confidence > 0 && record.confidence <= 1)) throw new Error(`Commercial showcase record ${record.slug} has invalid confidence`);
    const id = commercialProjectId(record.slug);
    const upstream = identityFor(record);
    if (ids.has(id)) throw new Error(`Duplicate commercial showcase project id: ${id}`);
    if (slugs.has(record.slug.toLowerCase())) throw new Error(`Duplicate commercial showcase slug: ${record.slug}`);
    if (upstreams.has(upstream)) throw new Error(`Duplicate commercial showcase upstream: ${upstream}`);
    ids.add(id);
    slugs.add(record.slug.toLowerCase());
    upstreams.add(upstream);
  }
}

function canonicalOrNull(value: string | null): string | null {
  return resolveUpstreamIdentity({ upstreamUrl: value, repositoryUrl: value });
}

export function findExistingCommercialShowcaseSlugs(records: CommercialShowcaseRecord[], projects: ExistingCommercialProjectIdentity[], versions: Array<{ id: string; project_id: string }>): Set<string> {
  const existing = new Set<string>();
  for (const record of records) {
    const projectId = commercialProjectId(record.slug);
    const versionId = commercialVersionId(projectId, record.revision);
    const upstream = identityFor(record);
    const idMatch = projects.find((project) => project.id === projectId);
    const slugMatch = projects.find((project) => project.slug.toLowerCase() === record.slug.toLowerCase());
    const upstreamMatches = projects.filter((project) => project.upstream_identity === upstream || canonicalOrNull(project.upstream_url) === upstream || canonicalOrNull(project.repository_url) === upstream);
    const versionMatch = versions.find((version) => version.id === versionId);
    if (idMatch && (idMatch.slug.toLowerCase() !== record.slug.toLowerCase() || (idMatch.upstream_identity ?? canonicalOrNull(idMatch.upstream_url) ?? canonicalOrNull(idMatch.repository_url)) !== upstream)) {
      throw new Error(`Commercial showcase project id conflict for ${record.slug}: ${projectId}`);
    }
    if (slugMatch && slugMatch.id !== projectId && !upstreamMatches.includes(slugMatch)) throw new Error(`Commercial showcase slug conflict for ${record.slug}`);
    if (upstreamMatches.length > 1) throw new Error(`Multiple existing projects share commercial showcase upstream ${upstream}`);
    if (versionMatch && versionMatch.project_id !== projectId) throw new Error(`Commercial showcase version id conflict for ${record.slug}: ${versionId}`);
    if (idMatch || slugMatch || upstreamMatches.length === 1) existing.add(record.slug);
  }
  return existing;
}

export function buildCommercialShowcaseCandidate(record: CommercialShowcaseRecord): CommercialShowcaseCandidate {
  const projectId = commercialProjectId(record.slug);
  const versionId = commercialVersionId(projectId, record.revision);
  const canonicalUpstreamIdentity = identityFor(record);
  const rpps = {
    rpps_version: '1.0.0',
    name: record.name,
    slug: record.slug,
    version: record.revision,
    summary: record.summary,
    authors: [{ name: record.maintainer, role: 'maintainer' }],
    upstream_url: record.upstream_url,
    docs_url: record.docs_url,
    project_kind: PROJECT_KIND,
    tags: record.tags,
    bom: [],
    evidence: [{ claim: record.summary, source_type: 'official-vendor-page', source_url: record.upstream_url, retrieved_at: record.retrieved_at, confidence: record.confidence }],
    reproducibility: { access: 'closed-source', design_files: false, bom: false, cad: false, assembly: false, pricing: false },
    specs: record.specs,
  };
  return { projectId, versionId, canonicalUpstreamIdentity, record, rppsJson: JSON.stringify(rpps) };
}

export function buildCommercialForwardSql(candidates: CommercialShowcaseCandidate[], now: string): string {
  const lines: string[] = [];
  for (const c of candidates) {
    const r = c.record;
    const body = `${r.summary}\n\n${r.specs.join('\n')}`;
    const tags = r.tags.join(' ');
    lines.push(`INSERT INTO projects (id, slug, name, summary, description, owner_user_id, visibility, status, current_version_id, license_spdx, repository_url, difficulty, estimated_cost_minor, estimated_cost_currency, is_demo, created_at, updated_at, upstream_revision, revision, upstream_url, upstream_identity, maintainer, ingested_at, last_checked_at, publishability, github_stars, project_kind) VALUES (${sqlString(c.projectId)}, ${sqlString(r.slug)}, ${sqlString(r.name)}, ${sqlString(r.summary)}, ${sqlString(r.specs.join('\n'))}, '${OWNER}', 'public', 'published', ${sqlString(c.versionId)}, NULL, NULL, NULL, NULL, NULL, 0, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(r.revision)}, ${sqlString(r.revision)}, ${sqlString(r.upstream_url)}, ${sqlString(c.canonicalUpstreamIdentity)}, ${sqlString(r.maintainer)}, ${sqlString(r.retrieved_at)}, ${sqlString(r.retrieved_at)}, 'review', NULL, '${PROJECT_KIND}');`);
    lines.push(`INSERT INTO project_versions (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at) VALUES (${sqlString(c.versionId)}, ${sqlString(c.projectId)}, ${sqlString(r.revision)}, '1.0.0', 'Imported source-backed closed-source commercial showcase record. No repository, license, CAD, BOM, cover image, files, assembly, or pricing included.', ${sqlString(c.rppsJson)}, 'published', '${OWNER}', ${sqlString(now)}, ${sqlString(now)});`);
    lines.push(`DELETE FROM search_index WHERE entity_type = 'project' AND entity_id = ${sqlString(c.projectId)};`);
    lines.push(`INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('project', ${sqlString(c.projectId)}, ${sqlString(r.name)}, ${sqlString(body)}, ${sqlString(tags)});`);
  }
  return `${lines.join('\n')}\n`;
}

export function buildCommercialRollbackSql(candidates: CommercialShowcaseCandidate[]): string {
  const ids = candidates.map((c) => sqlString(c.projectId)).join(', ');
  const guardedProjects = `SELECT id FROM projects WHERE owner_user_id = '${OWNER}' AND project_kind = '${PROJECT_KIND}' AND id IN (${ids || 'NULL'})`;
  return [
    '-- Guarded rollback for commercial showcase Wave 1. Deletes only deterministic commercial_showcase project ids owned by robotics-catalog-import.',
    `DELETE FROM search_index WHERE entity_type = 'project' AND entity_id IN (${guardedProjects});`,
    `DELETE FROM project_versions WHERE project_id IN (${guardedProjects});`,
    `DELETE FROM projects WHERE owner_user_id = '${OWNER}' AND project_kind = '${PROJECT_KIND}' AND id IN (${ids || 'NULL'});`,
    `SELECT COUNT(*) AS remaining_commercial_showcase_wave1_projects FROM projects WHERE id IN (${ids || 'NULL'});`,
    '',
  ].join('\n');
}
