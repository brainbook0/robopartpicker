import { describe, expect, it } from "vitest";
import waveJson from "../../data/project-waves/2026-08-20-reviewed-derived-project-covers.json";
import {
  buildReviewedDerivedProjectMediaForwardSql,
  buildReviewedDerivedProjectMediaRollbackSql,
  reviewedDerivedMediaClaimId,
  reviewedDerivedMediaCoverUrl,
  reviewedDerivedMediaEvidenceId,
  reviewedDerivedMediaFileId,
  reviewedDerivedMediaMediaId,
  reviewedDerivedMediaObjectKey,
  reviewedDerivedMediaOriginalName,
  reviewedDerivedMediaSourcePageUrl,
  serializeReviewedDerivedProjectMediaRpps,
  validateReviewedDerivedProjectMediaWave,
  type PreparedReviewedDerivedProjectMedia,
  type ReviewedDerivedProjectMediaDefinition,
  type ReviewedDerivedProjectMediaWave,
} from "./reviewed-derived-project-media";

const wave = waveJson as ReviewedDerivedProjectMediaWave;
const definition = wave.projects[0] as ReviewedDerivedProjectMediaDefinition;

function prepared(): PreparedReviewedDerivedProjectMedia {
  const row = {
    id: "project-caesar",
    slug: definition.slug,
    name: definition.name,
    owner_user_id: "catalog-import",
    organization_id: null,
    visibility: "public",
    status: "published",
    project_kind: "physical_design",
    repository_url: definition.repository_url,
    revision: definition.revision,
    updated_at: "2026-08-20T18:00:00.000Z",
    current_version_id: "version-caesar",
    rpps_json: JSON.stringify({
      rpps_version: "1.0.0",
      name: definition.name,
      slug: definition.slug,
      version: "0.1.0",
      bom: [],
      cover_image_url: definition.expected_cover_url,
      legacy_payload: "x".repeat(120_000),
    }),
  };
  const fileId = reviewedDerivedMediaFileId(wave.wave, definition);
  const originalName = reviewedDerivedMediaOriginalName(definition);
  const coverUrl = reviewedDerivedMediaCoverUrl("https://robopartpicker.example", fileId);
  return {
    definition,
    row,
    nextRppsJson: JSON.stringify({
      rpps_version: "1.0.0",
      name: definition.name,
      slug: definition.slug,
      version: "0.1.0",
      bom: [],
      cover_image_url: coverUrl,
      legacy_payload: "x".repeat(120_000),
    }),
    fileId,
    mediaId: reviewedDerivedMediaMediaId(wave.wave, row.id, fileId),
    evidenceId: reviewedDerivedMediaEvidenceId(wave.wave, row.id, definition),
    evidenceClaimId: reviewedDerivedMediaClaimId(wave.wave, row.id, definition),
    objectKey: reviewedDerivedMediaObjectKey(wave.wave, definition),
    originalName,
    relativePath: `media/${originalName}`,
    coverUrl,
    sourcePageUrl: reviewedDerivedMediaSourcePageUrl(definition),
    metadataJson: JSON.stringify({ wave: wave.wave, reviewed: true }),
  };
}

function statements(sql: string): string[] {
  return sql.split(/;\s*(?:\n|$)/u).map((statement) => statement.trim()).filter(Boolean);
}

describe("reviewed source-derived project covers", () => {
  it("validates the checked-in pinned Caesar cover wave", () => {
    expect(validateReviewedDerivedProjectMediaWave(wave)).toEqual([]);
    expect(validateReviewedDerivedProjectMediaWave({
      ...wave,
      projects: [{
        ...definition,
        repository_url: "https://example.com/owner/repo",
        revision: "main",
        source_artifact: { ...definition.source_artifact, path: "../model.obj", sha256: "bad" },
      }],
    })).toEqual(expect.arrayContaining([
      "caesar-jl: repository_url must be a canonical HTTPS GitHub repository URL",
      "caesar-jl: revision must be a lowercase 40-character git hash",
      "caesar-jl: source artifact path is invalid",
      "caesar-jl: source artifact sha256 is invalid",
    ]));
  });

  it("derives immutable source URLs and deterministic managed identities", () => {
    const project = prepared();
    expect(project.sourcePageUrl).toBe(`${definition.repository_url}/blob/${definition.revision}/${definition.source_artifact.path}`);
    expect(project.fileId).toMatch(/^file_[a-f0-9]{32}$/u);
    expect(project.mediaId).toMatch(/^pmedia_[a-f0-9]{32}$/u);
    expect(project.objectKey).toBe(`reviewed-project-media/${wave.wave}/${definition.slug}/${definition.rendered_asset.sha256}.png`);
    expect(project.coverUrl).toContain(`/api/v1/files/content?id=${encodeURIComponent(project.fileId)}`);
  });

  it("emits guarded cover, media, evidence, RPPS, and exact rollback SQL", () => {
    const project = prepared();
    const now = "2026-08-20T19:30:00.000Z";
    const forward = buildReviewedDerivedProjectMediaForwardSql([project], wave.wave, now);
    const rollback = buildReviewedDerivedProjectMediaRollbackSql([project], wave.wave, now);
    expect(forward).toContain("INSERT INTO files");
    expect(forward).toContain("INSERT INTO project_media");
    expect(forward).toContain("sort_order, created_at");
    expect(forward).toContain("cover_image.derived_source");
    expect(forward).toContain(project.nextRppsJson);
    expect(rollback).toContain("DELETE FROM evidence_claims");
    expect(rollback).toContain("DELETE FROM files");
    expect(rollback).toContain(project.row.rpps_json);
    expect(forward.split(project.row.rpps_json)).toHaveLength(2);
    expect(rollback.split(project.nextRppsJson)).toHaveLength(2);
    const encoder = new TextEncoder();
    expect(Math.max(...statements(forward).map((statement) => encoder.encode(statement).byteLength))).toBeLessThan(250_000);
    expect(Math.max(...statements(rollback).map((statement) => encoder.encode(statement).byteLength))).toBeLessThan(250_000);
  });

  it("validates portable RPPS while preserving reviewed extension fields", () => {
    const serialized = serializeReviewedDerivedProjectMediaRpps({
      rpps_version: "1.0.0",
      name: definition.name,
      slug: definition.slug,
      version: "0.1.0",
      bom: [],
      project_kind: "physical_design",
      cover_image_url: "https://example.com/cover.png",
      render_provenance: { source_sha256: definition.source_artifact.sha256 },
    });
    expect(JSON.parse(serialized)).toMatchObject({
      project_kind: "physical_design",
      render_provenance: { source_sha256: definition.source_artifact.sha256 },
    });
  });
});
