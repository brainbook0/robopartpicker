import { describe, expect, it } from 'vitest';
import { buildVerifiedBackfillSql, normalizeSourceUrl, selectHarvestArtifacts, type VerifiedArtifact } from './catalog-completeness-backfill';

const physical = new Set(['sample-bot']);
const sha = 'a'.repeat(64);

describe('catalog completeness backfill hardening', () => {
  it('normalizes only supported GitHub source URLs', () => {
    expect(normalizeSourceUrl('https://github.com/acme/sample/blob/main/cad/part.stl')).toBe('https://raw.githubusercontent.com/acme/sample/main/cad/part.stl');
    expect(normalizeSourceUrl('https://raw.githubusercontent.com/acme/sample/main/cad/part.stl')).toBe('https://raw.githubusercontent.com/acme/sample/main/cad/part.stl');
    expect(normalizeSourceUrl('http://github.com/acme/sample/blob/main/cad/part.stl')).toBeNull();
    expect(normalizeSourceUrl('https://github.com/acme/sample/tree/main/cad')).toBeNull();
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
    expect(buildVerifiedBackfillSql([])).toBe('BEGIN TRANSACTION;\nCOMMIT;\n');
  });
});
