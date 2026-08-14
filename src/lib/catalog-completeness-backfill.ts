export type HarvestManifest = {
  slug?: string;
  repository_url?: string;
  analysis?: {
    draft?: { slug?: string; repo_url?: string };
    inventory?: { artifacts?: HarvestInventoryArtifact[] };
  };
};

export type HarvestInventoryArtifact = {
  path?: string;
  kind?: string;
  sizeBytes?: number;
  sha256?: string;
  sourceUrl?: string;
  sourceRevision?: string;
};

export type SelectedArtifact = {
  fileId: string;
  slug: string;
  objectKey: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  checksumSha256: string;
  kind: string;
  purpose: string;
  relativePath: string;
  sourceUrl: string;
  sourceRevision: string | null;
};

export type SelectionSummary = {
  slug: string;
  files: SelectedArtifact[];
  skipped: Record<string, number>;
};

export type VerifiedArtifact = SelectedArtifact & { r2Bucket: string };

export const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

const FILE_KINDS = new Set(['image', 'cad', 'urdf', 'mjcf', 'bom', 'document', 'firmware', 'configuration', 'test_evidence', 'attachment']);
const KIND_ALIASES: Record<string, string> = { documentation: 'document', manufacturing: 'cad' };

export function stableId(prefix: string, parts: string[]): string {
  const safe = parts.map((part) => part.toLowerCase().replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96));
  return `${prefix}:${safe.join(':')}`.slice(0, 240);
}

export function normalizeSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (url.hostname === 'raw.githubusercontent.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 4 ? url.toString() : null;
  }
  if (url.hostname === 'github.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const blobIndex = parts.indexOf('blob');
    if (blobIndex === 2 && parts.length >= 5) {
      const [owner, repo] = parts;
      const refAndPath = parts.slice(3).map(encodeURIComponent).join('/');
      return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${refAndPath}`;
    }
  }
  return null;
}

export function normalizeKind(kind: unknown): string | null {
  if (typeof kind !== 'string') return null;
  const normalized = KIND_ALIASES[kind] ?? kind;
  return FILE_KINDS.has(normalized) ? normalized : null;
}

function mediaTypeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'text/csv';
  if (ext === 'json') return 'application/json';
  if (ext === 'md' || ext === 'txt') return 'text/plain';
  if (ext === 'yaml' || ext === 'yml') return 'application/yaml';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'stl') return 'model/stl';
  if (ext === 'urdf') return 'application/xml';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function inc(summary: SelectionSummary, key: string) {
  summary.skipped[key] = (summary.skipped[key] ?? 0) + 1;
}

function safeRelativePath(path: string): string | null {
  const trimmed = path.trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('\0') || trimmed.split('/').some((part) => part === '..' || part === '.')) return null;
  return trimmed;
}

export function selectHarvestArtifacts(manifest: HarvestManifest, physicalDesignSlugs: ReadonlySet<string>, maxBytes = MAX_ARTIFACT_BYTES): SelectionSummary {
  const slug = manifest.slug ?? manifest.analysis?.draft?.slug ?? '';
  const summary: SelectionSummary = { slug, files: [], skipped: {} };
  if (!slug || !physicalDesignSlugs.has(slug)) return summary;
  const seenPaths = new Set<string>();
  for (const artifact of manifest.analysis?.inventory?.artifacts ?? []) {
    const relativePath = typeof artifact.path === 'string' ? safeRelativePath(artifact.path) : null;
    if (!relativePath) { inc(summary, 'artifactMissingPath'); continue; }
    if (seenPaths.has(relativePath)) { inc(summary, 'duplicateArtifactPath'); continue; }
    seenPaths.add(relativePath);
    const sourceUrl = normalizeSourceUrl(artifact.sourceUrl);
    if (!sourceUrl) { inc(summary, 'artifactUnsupportedSourceUrl'); continue; }
    if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) { inc(summary, 'artifactMissingSha256'); continue; }
    if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) { inc(summary, 'artifactMissingSize'); continue; }
    if (artifact.sizeBytes > maxBytes) { inc(summary, 'artifactTooLarge'); continue; }
    const kind = normalizeKind(artifact.kind);
    if (!kind) { inc(summary, 'artifactUnsupportedKind'); continue; }
    const checksumSha256 = artifact.sha256.toLowerCase();
    summary.files.push({
      fileId: stableId('harvest-file', [slug, checksumSha256, relativePath]),
      slug,
      objectKey: `catalog-completeness/2026-08-14/${slug}/${checksumSha256.slice(0, 16)}/${relativePath}`,
      originalName: relativePath.split('/').pop() ?? relativePath,
      mediaType: mediaTypeForPath(relativePath),
      sizeBytes: artifact.sizeBytes,
      checksumSha256,
      kind,
      purpose: kind,
      relativePath,
      sourceUrl,
      sourceRevision: typeof artifact.sourceRevision === 'string' && artifact.sourceRevision.trim() ? artifact.sourceRevision.trim() : null,
    });
  }
  return summary;
}

export function sqlString(value: string | null): string {
  return value == null ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
}

export function buildVerifiedBackfillSql(files: VerifiedArtifact[], now = 'CURRENT_TIMESTAMP'): string {
  const lines = ['BEGIN TRANSACTION;'];
  for (const file of files) {
    const metadata = JSON.stringify({ sourceUrl: file.sourceUrl, sourceRevision: file.sourceRevision, r2Bucket: file.r2Bucket, backfill: 'catalog-completeness-2026-08-14' });
    lines.push(`INSERT INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256, owner_user_id, organization_id, visibility, status, kind, metadata_json, created_at, updated_at)`);
    lines.push(`SELECT ${sqlString(file.fileId)}, ${sqlString(file.objectKey)}, ${sqlString(file.originalName)}, ${sqlString(file.mediaType)}, ${file.sizeBytes}, ${sqlString(file.checksumSha256)}, p.owner_user_id, p.organization_id, p.visibility, 'ready', ${sqlString(file.kind)}, json(${sqlString(metadata)}), ${now}, ${now} FROM projects p WHERE p.slug = ${sqlString(file.slug)} AND p.project_kind = 'physical_design' AND p.deleted_at IS NULL AND p.current_version_id IS NOT NULL AND (p.owner_user_id IS NOT NULL OR p.organization_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM files f WHERE f.id = ${sqlString(file.fileId)} OR f.object_key = ${sqlString(file.objectKey)});`);
    lines.push(`INSERT OR IGNORE INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at) SELECT p.id, p.current_version_id, ${sqlString(file.fileId)}, ${sqlString(file.purpose)}, ${sqlString(file.relativePath)}, ${now} FROM projects p JOIN files f ON f.id = ${sqlString(file.fileId)} AND f.status = 'ready' AND f.size_bytes = ${file.sizeBytes} AND f.checksum_sha256 = ${sqlString(file.checksumSha256)} AND f.object_key = ${sqlString(file.objectKey)} WHERE p.slug = ${sqlString(file.slug)} AND p.project_kind = 'physical_design' AND p.deleted_at IS NULL AND p.current_version_id IS NOT NULL;`);
  }
  lines.push('COMMIT;');
  return `${lines.join('\n')}\n`;
}
