export type WaveRecord = {
  id: string;
  slug: string;
  name: string;
  repository_url: string;
  revision: string;
  stars?: number;
  license?: string;
  maintainer?: string;
  publishability: string;
  summary: string;
};

type HarvestArtifact = {
  sourceRevision?: string;
};

type HarvestManifest = {
  ok?: boolean;
  slug?: string;
  repository_url?: string;
  analysis?: {
    inventory?: {
      artifacts?: HarvestArtifact[];
    };
  };
};

type AnalyzerComponent = {
  id?: string;
  ref?: string;
  name?: string;
  description?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  manufacturer?: string;
  mpn?: string;
  category?: string;
  supplier_url?: string;
  sourceUrl?: string;
  evidence?: { locator?: string; url?: string };
  completeness?: string;
  confidence?: number;
  extraction_method?: string;
};

export type ImportCandidate = {
  projectId: string;
  versionId: string;
  bomId?: string;
  bomVersionId?: string;
  wave: WaveRecord;
  canonicalUpstreamIdentity: string;
  rppsJson: string;
  bomItems: Array<{
    id: string;
    slotKey: string;
    description: string;
    quantity: number;
    unit: string;
    notes: string | null;
    sortOrder: number;
    extractionMethod: string;
    completeness: string;
    evidenceLocator: string | null;
    confidence: number | null;
  }>;
};

export function canonicalizeUpstreamIdentity(repositoryUrl: string): string {
  const url = new URL(repositoryUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
  return `${host}${path}`;
}

export function validateWaveRecords(records: WaveRecord[]): void {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const upstreams = new Set<string>();
  for (const record of records) {
    if (!record.id || !record.slug || !record.name || !record.summary) throw new Error('Wave records require id, slug, name, and summary');
    if (!/^[0-9a-f]{40}$/i.test(record.revision)) throw new Error(`Wave record ${record.slug} does not use an immutable 40-character Git revision`);
    const upstream = canonicalizeUpstreamIdentity(record.repository_url);
    if (ids.has(record.id)) throw new Error(`Duplicate Wave 1 project id: ${record.id}`);
    if (slugs.has(record.slug.toLowerCase())) throw new Error(`Duplicate Wave 1 slug: ${record.slug}`);
    if (upstreams.has(upstream)) throw new Error(`Duplicate Wave 1 upstream: ${upstream}`);
    ids.add(record.id);
    slugs.add(record.slug.toLowerCase());
    upstreams.add(upstream);
  }
}

export function validateHarvestManifest(wave: WaveRecord, manifest: unknown): void {
  if (!manifest || typeof manifest !== 'object') throw new Error(`Missing harvest manifest for ${wave.slug}`);
  const value = manifest as HarvestManifest;
  if (value.ok !== true) throw new Error(`Harvest manifest is not successful for ${wave.slug}`);
  if (value.slug !== wave.slug) throw new Error(`Harvest manifest slug mismatch for ${wave.slug}: ${String(value.slug)}`);
  if (!value.repository_url || canonicalizeUpstreamIdentity(value.repository_url) !== canonicalizeUpstreamIdentity(wave.repository_url)) {
    throw new Error(`Harvest manifest repository mismatch for ${wave.slug}`);
  }
  const artifacts = value.analysis?.inventory?.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error(`Harvest manifest has no reviewed artifacts for ${wave.slug}`);
  const mismatched = artifacts.find((artifact) => artifact.sourceRevision?.toLowerCase() !== wave.revision.toLowerCase());
  if (mismatched) throw new Error(`Harvest manifest revision mismatch for ${wave.slug}`);
}

export function stableId(prefix: string, seed: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
  }
  const hex = `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
  return `${prefix}_${hex}${hex}`.slice(0, prefix.length + 1 + 32);
}

export function sqlString(value: string | null | undefined): string {
  return value == null ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
}

export function sqlNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'NULL';
}

function getManifestComponents(manifest: unknown): AnalyzerComponent[] {
  if (!manifest || typeof manifest !== 'object') return [];
  const root = manifest as Record<string, unknown>;
  const analysis = root.analysis as Record<string, unknown> | undefined;
  const candidates = [
    analysis?.manifest,
    analysis?.portableManifest,
    analysis?.rppsManifest,
    analysis?.inventory,
    root.manifest,
    root.portableManifest,
    root.rppsManifest,
    root.inventory,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && Array.isArray((candidate as Record<string, unknown>).components)) {
      return (candidate as Record<string, AnalyzerComponent[]>).components;
    }
  }
  return [];
}

export function buildCandidate(wave: WaveRecord, manifest: unknown): ImportCandidate {
  validateHarvestManifest(wave, manifest);
  const canonicalUpstreamIdentity = canonicalizeUpstreamIdentity(wave.repository_url);
  const projectId = wave.id;
  const versionId = stableId('pver', `${wave.id}:version:${wave.revision}`);
  const rawComponents = getManifestComponents(manifest);
  const bomItems = rawComponents.map((component, index) => {
    const description = component.name ?? component.description;
    const quantity = component.qty ?? component.quantity;
    if (!description || !quantity || quantity <= 0) {
      throw new Error(`Invalid analyzer BOM component at index ${index} for ${wave.slug}`);
    }
    const slotKey = component.ref ?? component.id ?? `item-${index + 1}`;
    return {
      id: stableId('bitem', `${wave.id}:bom:item:${slotKey}:${index}`),
      slotKey: String(slotKey).slice(0, 120),
      description: String(description).slice(0, 500),
      quantity,
      unit: String(component.unit ?? 'each'),
      notes: component.mpn || component.manufacturer ? [component.manufacturer, component.mpn].filter(Boolean).join(' ') : null,
      sortOrder: index,
      extractionMethod: component.extraction_method ?? 'explicit-bom',
      completeness: component.completeness ?? 'probable',
      evidenceLocator: component.evidence?.locator ?? component.evidence?.url ?? component.sourceUrl ?? component.supplier_url ?? null,
      confidence: typeof component.confidence === 'number' ? component.confidence : null,
    };
  });
  const rpps = {
    rpps_version: '1.0.0',
    name: wave.name,
    slug: wave.slug,
    version: wave.revision,
    summary: wave.summary,
    license: wave.license,
    authors: wave.maintainer ? [{ name: wave.maintainer, role: 'maintainer' }] : [],
    repo_url: wave.repository_url,
    tags: ['physical-design'],
    bom: bomItems.map((item) => ({ ref: item.slotKey, name: item.description, qty: Math.max(1, Math.trunc(item.quantity)), notes: item.notes ?? undefined })),
    evidence: [{ claim: wave.summary, source_type: 'repo', source_url: wave.repository_url, confidence: 0.9 }],
  };
  return {
    projectId,
    versionId,
    bomId: bomItems.length ? stableId('bom', `${wave.id}:bom`) : undefined,
    bomVersionId: bomItems.length ? stableId('bver', `${wave.id}:bom:${wave.revision}`) : undefined,
    wave,
    canonicalUpstreamIdentity,
    rppsJson: JSON.stringify(rpps),
    bomItems,
  };
}

export function buildForwardSql(candidates: ImportCandidate[], now: string): string {
  const lines = ['BEGIN TRANSACTION;'];
  for (const c of candidates) {
    const w = c.wave;
    lines.push(`INSERT INTO projects (id, slug, name, summary, owner_user_id, visibility, status, current_version_id, license_spdx, repository_url, is_demo, created_at, updated_at, upstream_revision, revision, upstream_url, upstream_identity, maintainer, ingested_at, last_checked_at, publishability, github_stars, project_kind) VALUES (${sqlString(c.projectId)}, ${sqlString(w.slug)}, ${sqlString(w.name)}, ${sqlString(w.summary)}, 'robotics-catalog-import', 'public', 'published', ${sqlString(c.versionId)}, ${sqlString(w.license)}, ${sqlString(w.repository_url)}, 0, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(w.revision)}, ${sqlString(w.revision)}, ${sqlString(w.repository_url)}, ${sqlString(c.canonicalUpstreamIdentity)}, ${sqlString(w.maintainer)}, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(w.publishability)}, ${sqlNumber(w.stars)}, 'physical_design');`);
    lines.push(`INSERT INTO project_versions (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at) VALUES (${sqlString(c.versionId)}, ${sqlString(c.projectId)}, ${sqlString(w.revision)}, '1.0.0', 'Imported reviewed physical design wave record at immutable upstream revision.', ${sqlString(c.rppsJson)}, 'published', 'robotics-catalog-import', ${sqlString(now)}, ${sqlString(now)});`);
    if (c.bomId && c.bomVersionId) {
      lines.push(`INSERT INTO boms (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at) VALUES (${sqlString(c.bomId)}, ${sqlString(c.projectId)}, 'robotics-catalog-import', ${sqlString(`${w.slug}-bom`)}, ${sqlString(`${w.name} BOM`)}, ${sqlString(c.bomVersionId)}, 'public', 0, ${sqlString(now)}, ${sqlString(now)});`);
      lines.push(`INSERT INTO bom_versions (id, bom_id, version_label, notes, currency, created_by_user_id, created_at) VALUES (${sqlString(c.bomVersionId)}, ${sqlString(c.bomId)}, ${sqlString(w.revision)}, 'Imported only exact analyzer manifest components.', 'USD', 'robotics-catalog-import', ${sqlString(now)});`);
      for (const item of c.bomItems) {
        lines.push(`INSERT INTO bom_items (id, bom_version_id, slot_key, description, quantity, unit, notes, sort_order, extraction_method, completeness, evidence_locator, confidence) VALUES (${sqlString(item.id)}, ${sqlString(c.bomVersionId)}, ${sqlString(item.slotKey)}, ${sqlString(item.description)}, ${sqlNumber(item.quantity)}, ${sqlString(item.unit)}, ${sqlString(item.notes)}, ${item.sortOrder}, ${sqlString(item.extractionMethod)}, ${sqlString(item.completeness)}, ${sqlString(item.evidenceLocator)}, ${sqlNumber(item.confidence)});`);
      }
    }
  }
  lines.push('COMMIT;');
  return `${lines.join('\n')}\n`;
}

export function buildRollbackSql(candidates: ImportCandidate[]): string {
  const ids = candidates.map((c) => sqlString(c.projectId)).join(', ');
  return [`-- Guarded rollback for wave1 importer. Deletes only deterministic project ids owned by robotics-catalog-import.`, 'BEGIN TRANSACTION;', `DELETE FROM projects WHERE owner_user_id = 'robotics-catalog-import' AND id IN (${ids || 'NULL'});`, 'COMMIT;', ''].join('\n');
}
