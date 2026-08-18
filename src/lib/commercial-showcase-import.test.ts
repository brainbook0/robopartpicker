import { describe, expect, it } from 'vitest';
import { commercialShowcaseWave1Records } from '../../data/project-waves/2026-08-14-commercial-showcase-wave1';
import { buildCommercialForwardSql, buildCommercialRollbackSql, buildCommercialShowcaseCandidate, commercialProjectId, commercialVersionId, findExistingCommercialShowcaseSlugs, validateCommercialShowcaseRecords } from './commercial-showcase-import';

describe('commercial showcase Wave 1 importer helpers', () => {
  it('validates the 12 closed-source vendor official records', () => {
    expect(() => validateCommercialShowcaseRecords(commercialShowcaseWave1Records)).not.toThrow();
    expect(commercialShowcaseWave1Records).toHaveLength(12);
    expect(commercialShowcaseWave1Records.map((record) => record.slug)).toEqual([
      'boston-dynamics-atlas', 'agility-robotics-digit', 'apptronik-apollo-2', 'figure-ai-figure-03', '1x-technologies-neo', 'unitree-g1',
      'boston-dynamics-spot', 'anybotics-anymal', 'ghost-robotics-vision-60', 'boston-dynamics-stretch', 'universal-robots-e-series', 'kuka-lbr-iiwa',
    ]);
  });

  it('builds deterministic IDs, canonical upstream identity, and source evidence', () => {
    const candidate = buildCommercialShowcaseCandidate(commercialShowcaseWave1Records[0]);
    expect(candidate.projectId).toBe(commercialProjectId('boston-dynamics-atlas'));
    expect(candidate.versionId).toBe(commercialVersionId(candidate.projectId, commercialShowcaseWave1Records[0].revision));
    expect(candidate.canonicalUpstreamIdentity).toBe('https://bostondynamics.com/products/atlas');
    const rpps = JSON.parse(candidate.rppsJson);
    expect(rpps).toMatchObject({ project_kind: 'commercial_showcase', bom: [], upstream_url: commercialShowcaseWave1Records[0].upstream_url, docs_url: commercialShowcaseWave1Records[0].docs_url });
    expect(rpps.evidence).toEqual([{ claim: commercialShowcaseWave1Records[0].summary, source_type: 'official-vendor-page', source_url: commercialShowcaseWave1Records[0].upstream_url, retrieved_at: commercialShowcaseWave1Records[0].retrieved_at, confidence: 0.9 }]);
  });

  it('emits deterministic SQL without reproducibility fields and explicitly fills search_index', () => {
    const candidate = buildCommercialShowcaseCandidate(commercialShowcaseWave1Records[0]);
    const sql = buildCommercialForwardSql([candidate], '2026-08-14T19:00:00.000Z');
    expect(sql).toContain("'commercial_showcase'");
    expect(sql).toContain("'humanoid'");
    expect(sql).toContain('robot_category');
    expect(sql).toContain('license_spdx, repository_url');
    expect(sql).toContain('NULL, NULL, NULL, NULL, NULL, 0');
    expect(sql).toContain('INSERT INTO search_index');
    expect(sql).toContain('DELETE FROM search_index');
    expect(sql).not.toContain('cover_image_url');
    expect(sql).not.toContain('project_files');
    expect(sql).not.toContain('project_media');
    expect(sql).not.toContain('boms');
    expect(sql).not.toContain('bom_items');
    expect(sql).not.toContain('estimated_cost_minor) VALUES');
    expect(sql).not.toContain('BEGIN TRANSACTION');
    expect(sql).not.toContain('COMMIT;');
  });

  it('maps Optimus and alternate commercial labels to browse taxonomy categories', () => {
    const optimus = buildCommercialShowcaseCandidate({
      ...commercialShowcaseWave1Records[0],
      slug: 'test-optimus', name: 'Test Optimus', category: 'humanoid',
    });
    expect(buildCommercialForwardSql([optimus], '2026-08-14T19:00:00.000Z')).toContain("'humanoid'");
    const arm = buildCommercialShowcaseCandidate({
      ...commercialShowcaseWave1Records[0],
      slug: 'test-cobot', name: 'Test Cobot', category: 'collaborative industrial arm',
    });
    expect(buildCommercialForwardSql([arm], '2026-08-14T19:00:00.000Z')).toContain("'manipulator'");
  });

  it('rejects invalid record shape and detects conflicts fail-closed', () => {
    const record = commercialShowcaseWave1Records[0];
    expect(() => validateCommercialShowcaseRecords([{ ...record, tags: record.tags.filter((tag) => tag !== 'closed-source') }, ...commercialShowcaseWave1Records.slice(1)])).toThrow(/closed-source/);
    expect(() => validateCommercialShowcaseRecords([{ ...record, docs_url: 'https://example.com' }, ...commercialShowcaseWave1Records.slice(1)])).toThrow(/docs_url/);
    expect(() => validateCommercialShowcaseRecords([record, { ...record }, ...commercialShowcaseWave1Records.slice(2)])).toThrow(/Duplicate/);

    const projectId = commercialProjectId(record.slug);
    const versionId = commercialVersionId(projectId, record.revision);
    expect(findExistingCommercialShowcaseSlugs([record], [{ id: projectId, slug: record.slug, repository_url: null, upstream_url: `${record.upstream_url}?ignored=true`, upstream_identity: null, current_version_id: versionId }], [{ id: versionId, project_id: projectId }])).toEqual(new Set([record.slug]));
    expect(() => findExistingCommercialShowcaseSlugs([record], [{ id: projectId, slug: 'different', repository_url: null, upstream_url: 'https://example.com/other', upstream_identity: null, current_version_id: null }], [])).toThrow(/project id conflict/);
    expect(() => findExistingCommercialShowcaseSlugs([record], [], [{ id: versionId, project_id: 'another-project' }])).toThrow(/version id conflict/);
  });

  it('emits rollback guarded by owner, project kind, and deterministic IDs', () => {
    const candidate = buildCommercialShowcaseCandidate(commercialShowcaseWave1Records[0]);
    const rollback = buildCommercialRollbackSql([candidate]);
    expect(rollback).toContain("owner_user_id = 'robotics-catalog-import'");
    expect(rollback).toContain("project_kind = 'commercial_showcase'");
    expect(rollback).toContain(candidate.projectId);
    expect(rollback).toContain('DELETE FROM search_index');
    expect(rollback).toContain('remaining_commercial_showcase_wave1_projects');
    expect(rollback).not.toContain('BEGIN TRANSACTION');
    expect(rollback).not.toContain('COMMIT;');
  });
});
