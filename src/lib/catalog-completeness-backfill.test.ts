import { describe, expect, it } from 'vitest';
import { buildVerifiedBackfillRollbackSql, buildVerifiedBackfillSql, normalizeSourceUrl, selectHarvestArtifacts, type VerifiedArtifact } from './catalog-completeness-backfill';

const physical = new Set(['sample-bot']);
const sha = 'a'.repeat(64);

describe('catalog completeness backfill hardening', () => {
  it('normalizes only supported GitHub source URLs', () => {
    expect(normalizeSourceUrl('https://github.com/acme/sample/blob/main/cad/part.stl')).toBe('https://raw.githubusercontent.com/acme/sample/main/cad/part.stl');
    expect(normalizeSourceUrl('https://github.com/acme/sample/blob/main/CAD%20Files/part.stl')).toBe('https://raw.githubusercontent.com/acme/sample/main/CAD%20Files/part.stl');
    expect(normalizeSourceUrl('https://raw.githubusercontent.com/acme/sample/main/cad/part.stl')).toBe('https://raw.githubusercontent.com/acme/sample/main/cad/part.stl');
    expect(normalizeSourceUrl('http://github.com/acme/sample/blob/main/cad/part.stl')).toBeNull();
    expect(normalizeSourceUrl('https://github.com/acme/sample/tree/main/cad')).toBeNull();
    expect(normalizeSourceUrl('https://github.com/acme/sample/blob/main/bad%escape.stl')).toBeNull();
    expect(normalizeSourceUrl('https://example.com/cad/part.stl')).toBeNull();
  });

  it('selects only physical-design artifacts with sha256, supported kind, safe size, and safe path', () => {
    const selected = selectHarvestArtifacts({
      slug: 'sample-bot',
      analysis: { inventory: { artifacts: [
        { path: 'cad/part.stl', kind: 'manufacturing', sizeBytes: 12, sha256: sha.toUpperCase(), sourceUrl: 'https://github.com/acme/sample/blob/main/cad/part.stl', sourceRevision: 'main' },
        { path: '../escape.stl', kind: 'cad', sizeBytes: 1, sha256: sha, sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/escape.stl' },
        { path: 'bad-kind.bin', kind: 'other', sizeBytes: 1, sha256: sha, sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/bad-kind.bin' },
        { path: 'missing-sha.csv', kind: 'bom', sizeBytes: 1, sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/missing-sha.csv' },
        { path: 'too-large.stl', kind: 'cad', sizeBytes: 101, sha256: sha, sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/too-large.stl' },
      ] } },
    }, physical, 100);

    expect(selected.files).toHaveLength(1);
    expect(selected.files[0]).toMatchObject({
      slug: 'sample-bot',
      relativePath: 'cad/part.stl',
      kind: 'cad',
      sizeBytes: 12,
      checksumSha256: sha,
      sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/cad/part.stl',
    });
    expect(selected.files[0].objectKey).toBe(`catalog-completeness/2026-08-14/sample-bot/${sha.slice(0, 16)}/cad/part.stl`);
    expect(selected.skipped).toEqual({ artifactMissingPath: 1, artifactUnsupportedKind: 1, artifactMissingSha256: 1, artifactTooLarge: 1 });
  });

  it('selects nothing for non-physical-design slugs', () => {
    const selected = selectHarvestArtifacts({
      slug: 'software-only',
      analysis: { inventory: { artifacts: [{ path: 'bom.csv', kind: 'bom', sizeBytes: 3, sha256: sha, sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/bom.csv' }] } },
    }, physical);
    expect(selected.files).toEqual([]);
  });

  it('preserves WebP media types for reviewed project imagery', () => {
    const selected = selectHarvestArtifacts({
      slug: 'sample-bot',
      analysis: { inventory: { artifacts: [
        { path: 'media/hero.webp', kind: 'image', sizeBytes: 42, sha256: sha, sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/media/hero.webp' },
      ] } },
    }, physical);
    expect(selected.files[0]?.mediaType).toBe('image/webp');
  });

  it('stores reviewed license artifacts as documents', () => {
    const selected = selectHarvestArtifacts({
      slug: 'sample-bot',
      analysis: { inventory: { artifacts: [
        { path: 'LICENSE', kind: 'license', sizeBytes: 42, sha256: sha, sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/LICENSE' },
      ] } },
    }, physical);
    expect(selected.files[0]?.kind).toBe('document');
  });

  it('builds guarded SQL only from R2-verified artifacts', () => {
    const file: VerifiedArtifact = {
      fileId: 'harvest-file:sample-bot:a:cad/part.stl',
      slug: 'sample-bot',
      objectKey: 'catalog-completeness/2026-08-14/sample-bot/aaaaaaaaaaaaaaaa/cad/part.stl',
      originalName: 'part.stl',
      mediaType: 'model/stl',
      sizeBytes: 12,
      checksumSha256: sha,
      kind: 'cad',
      purpose: 'cad',
      relativePath: 'cad/part.stl',
      sourceUrl: 'https://raw.githubusercontent.com/acme/sample/main/cad/part.stl',
      sourceRevision: 'main',
      r2Bucket: 'robopartpicker-preview-files',
    };
    const sql = buildVerifiedBackfillSql([file], "'2026-08-14T00:00:00.000Z'");
    expect(sql).toContain("p.project_kind = 'physical_design'");
    expect(sql).toContain("f.status = 'ready'");
    expect(sql).toContain(`f.size_bytes = ${file.sizeBytes}`);
    expect(sql).toContain(`f.checksum_sha256 = '${sha}'`);
    expect(sql).toContain('robopartpicker-preview-files');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM files');
    expect(sql).not.toContain('BEGIN TRANSACTION');
    expect(sql).not.toContain('COMMIT;');
    expect(buildVerifiedBackfillSql([])).toBe('\n');

    const rollback = buildVerifiedBackfillRollbackSql([file], '2026-08-14T00:00:00.000Z');
    expect(rollback).toContain(`DELETE FROM project_files WHERE file_id = '${file.fileId}' AND created_at = '2026-08-14T00:00:00.000Z'`);
    expect(rollback).toContain(`DELETE FROM files WHERE id = '${file.fileId}'`);
    expect(rollback).toContain("json_extract(metadata_json, '$.backfill') = 'catalog-completeness-2026-08-14'");
    expect(rollback).not.toContain('BEGIN TRANSACTION');
    expect(rollback).not.toContain('COMMIT;');
  });
});
