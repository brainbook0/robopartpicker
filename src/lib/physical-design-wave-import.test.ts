import { describe, expect, it } from 'vitest';
import { buildCandidate, buildForwardSql, buildRollbackSql, canonicalizeUpstreamIdentity, sqlString, stableId, type WaveRecord } from './physical-design-wave-import';

const wave: WaveRecord = {
  id: '74b13950-c3ed-52e7-b47a-1198841323bc',
  slug: 'therobotstudio-so-arm100',
  name: 'SO-100 / SO-101 Robot Arm',
  repository_url: 'https://github.com/TheRobotStudio/SO-ARM100',
  revision: '7629d2ad9853d10fb903093a33ef6114099d97e5',
  stars: 7085,
  license: 'Apache-2.0',
  maintainer: 'TheRobotStudio',
  publishability: 'review',
  summary: 'Source-backed summary.',
};

describe('physical design wave importer helpers', () => {
  it('canonicalizes upstream identities case-insensitively', () => {
    expect(canonicalizeUpstreamIdentity('https://www.GitHub.com/TheRobotStudio/SO-ARM100.git')).toBe('github.com/therobotstudio/so-arm100');
  });

  it('builds deterministic IDs and valid minimal RPPS JSON without invented BOM items', () => {
    const empty = buildCandidate(wave, { analysis: { inventory: { components: [] } } });
    expect(empty.projectId).toBe(wave.id);
    expect(empty.versionId).toBe(stableId('pver', `${wave.id}:version:${wave.revision}`));
    expect(JSON.parse(empty.rppsJson)).toMatchObject({ rpps_version: '1.0.0', bom: [] });
    expect(empty.bomId).toBeUndefined();

    const withBom = buildCandidate(wave, { analysis: { inventory: { components: [{ ref: 'M1', name: 'M4 bolt', qty: 4, unit: 'each', manufacturer: 'Acme', mpn: 'BOLT-4', completeness: 'complete', confidence: 0.95 }] } } });
    expect(withBom.bomItems).toHaveLength(1);
    expect(JSON.parse(withBom.rppsJson).bom).toEqual([{ ref: 'M1', name: 'M4 bolt', qty: 4, notes: 'Acme BOLT-4' }]);
  });

  it('emits guarded SQL preserving provenance and owner', () => {
    const candidate = buildCandidate(wave, { analysis: { inventory: { components: [] } } });
    const forward = buildForwardSql([candidate], '2026-08-14T00:00:00.000Z');
    expect(forward).toContain("owner_user_id, visibility, status");
    expect(forward).toContain("'robotics-catalog-import', 'public', 'published'");
    expect(forward).toContain("'physical_design'");
    expect(forward).toContain(sqlString(canonicalizeUpstreamIdentity(wave.repository_url)));
    expect(forward).toContain(sqlString(wave.summary));

    const rollback = buildRollbackSql([candidate]);
    expect(rollback).toContain("owner_user_id = 'robotics-catalog-import'");
    expect(rollback).toContain(sqlString(wave.id));
  });
});
