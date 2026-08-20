import { describe, expect, it } from "vitest";
import {
  buildReviewedShowcaseMediaForwardSql,
  buildReviewedShowcaseMediaRollbackSql,
  reviewedShowcaseCoverUrl,
  reviewedShowcaseEvidenceClaimId,
  reviewedShowcaseEvidenceId,
  reviewedShowcaseFileId,
  reviewedShowcaseMediaId,
  reviewedShowcaseObjectKey,
  reviewedShowcaseOriginalName,
  serializeReviewedShowcaseRpps,
  sourceDocumentReferencesReviewedImage,
  validateReviewedShowcaseMediaWave,
  type PreparedReviewedShowcaseMedia,
  type ReviewedShowcaseMediaDefinition,
  type ReviewedShowcaseMediaWave,
  type ReviewedShowcaseProjectRow,
} from "./reviewed-showcase-media";

const definition: ReviewedShowcaseMediaDefinition = {
  slug: "example-robot",
  name: "Example Robot",
  source_publisher: "Example Robotics",
  source_page_url: "https://example.test/robots/example",
  source_image_url: "https://cdn.example.test/example.webp",
  final_source_image_url: "https://cdn.example.test/example.webp",
  sha256: "a".repeat(64),
  size_bytes: 42_000,
  media_type: "image/webp",
  width: 1600,
  height: 900,
  alt_text: "Example Robot standing in a product studio",
  caption: "Official Example Robot product image from Example Robotics.",
};
const wave: ReviewedShowcaseMediaWave = {
  wave: "reviewed-showcase-covers-test",
  schema_version: 1,
  projects: [definition],
};
const row: ReviewedShowcaseProjectRow = {
  id: "project-id",
  slug: definition.slug,
  name: definition.name,
  owner_user_id: "owner-id",
  organization_id: null,
  visibility: "public",
  status: "published",
  project_kind: "commercial_showcase",
  repository_url: null,
  revision: null,
  updated_at: "2026-08-20T00:00:00.000Z",
  current_version_id: "version-id",
  rpps_json: '{"rpps_version":"1.0.0","name":"Example Robot"}',
  media_count: 0,
};

function prepared(): PreparedReviewedShowcaseMedia {
  const fileId = reviewedShowcaseFileId(wave.wave, definition);
  return {
    definition,
    row,
    nextRppsJson: '{"rpps_version":"1.0.0","name":"Example Robot","cover_image_url":"https://example.test/cover"}',
    fileId,
    mediaId: reviewedShowcaseMediaId(wave.wave, row.id, fileId),
    evidenceId: reviewedShowcaseEvidenceId(wave.wave, row.id, definition.sha256),
    evidenceClaimId: reviewedShowcaseEvidenceClaimId(wave.wave, row.id, definition.sha256),
    objectKey: reviewedShowcaseObjectKey(wave.wave, definition),
    originalName: reviewedShowcaseOriginalName(definition),
    relativePath: `media/${reviewedShowcaseOriginalName(definition)}`,
    coverUrl: reviewedShowcaseCoverUrl("https://robopartpicker.example/", fileId),
    metadataJson: JSON.stringify({ wave: wave.wave, reviewed: true }),
  };
}

describe("reviewed showcase media", () => {
  it("validates HTTPS, hashes, dimensions, and unique reviewed artifacts", () => {
    expect(validateReviewedShowcaseMediaWave(wave)).toEqual([]);
    const invalid: ReviewedShowcaseMediaWave = {
      ...wave,
      projects: [
        { ...definition, source_page_url: "http://example.test", sha256: "bad", width: 599 },
        { ...definition },
      ],
    };
    const errors = validateReviewedShowcaseMediaWave(invalid);
    expect(errors).toContain("example-robot: source_page_url must be an HTTPS URL");
    expect(errors).toContain("example-robot: sha256 is invalid");
    expect(errors).toContain("example-robot: width must be at least 600");
    expect(errors).toContain("example-robot: duplicate slug");
  });

  it("validates pinned physical-design source documents and broken-cover guards", () => {
    const physical: ReviewedShowcaseMediaDefinition = {
      ...definition,
      slug: "venom",
      name: "venom",
      project_kind: "physical_design",
      repository_url: "https://github.com/chinmaynehate/venom",
      revision: "a".repeat(40),
      expected_cover_url: "https://robopartpicker.example/missing.jpg",
      source_page_url: `https://github.com/chinmaynehate/venom/blob/${"a".repeat(40)}/README.md`,
      source_image_url: "https://i.imgur.com/example.jpg",
      final_source_image_url: "https://i.imgur.com/example.jpg",
      source_document: { path: "README.md", sha256: "b".repeat(64), size_bytes: 1200 },
      sha256: "c".repeat(64),
    };
    expect(validateReviewedShowcaseMediaWave({ ...wave, projects: [physical] })).toEqual([]);
    expect(validateReviewedShowcaseMediaWave({
      ...wave,
      projects: [{ ...physical, revision: "main", source_page_url: "https://github.com/chinmaynehate/venom/blob/main/README.md" }],
    })).toContain("venom: physical design revision must be a lowercase 40-character git hash");
  });

  it("accepts immutable raw GitHub images referenced by repository-relative paths", () => {
    const revision = "a".repeat(40);
    const physical: ReviewedShowcaseMediaDefinition = {
      ...definition,
      slug: "flix",
      name: "flix",
      project_kind: "physical_design",
      repository_url: "https://github.com/okalachev/flix",
      revision,
      expected_cover_url: "https://robopartpicker.example/missing.jpg",
      source_page_url: `https://github.com/okalachev/flix/blob/${revision}/README.md`,
      source_image_url: `https://raw.githubusercontent.com/okalachev/flix/${revision}/docs/img/flix1.1.jpg`,
      final_source_image_url: `https://raw.githubusercontent.com/okalachev/flix/${revision}/docs/img/flix1.1.jpg`,
      source_document: { path: "README.md", sha256: "b".repeat(64), size_bytes: 1200 },
      sha256: "c".repeat(64),
    };

    expect(sourceDocumentReferencesReviewedImage(
      physical,
      '<img src="docs/img/flix1.1.jpg" alt="Flix quadcopter">',
    )).toBe(true);
    expect(sourceDocumentReferencesReviewedImage(
      { ...physical, revision: "d".repeat(40) },
      '<img src="docs/img/flix1.1.jpg" alt="Flix quadcopter">',
    )).toBe(false);
  });

  it("creates deterministic managed file identities and URLs", () => {
    const first = prepared();
    const second = prepared();
    expect(first.fileId).toBe(second.fileId);
    expect(first.mediaId).toBe(second.mediaId);
    expect(first.objectKey).toBe(`reviewed-showcase-media/${wave.wave}/example-robot/${definition.sha256}.webp`);
    expect(first.originalName).toBe("example-robot-official-cover.webp");
    expect(first.coverUrl).toContain(`/api/v1/files/content?id=${encodeURIComponent(first.fileId)}`);
  });

  it("validates portable fields without deleting reviewed showcase extensions", () => {
    const serialized = serializeReviewedShowcaseRpps({
      rpps_version: "1.0.0",
      name: "Example Robot",
      slug: "example-robot",
      version: "1.0",
      bom: [],
      project_kind: "commercial_showcase",
      reproducibility: { access: "closed-source" },
      specs: ["Payload 5 kg"],
    });
    expect(JSON.parse(serialized)).toMatchObject({
      project_kind: "commercial_showcase",
      reproducibility: { access: "closed-source" },
      specs: ["Payload 5 kg"],
    });
    expect(() => serializeReviewedShowcaseRpps({
      rpps_version: "1.0.0",
      name: "Example Robot",
      slug: "example-robot",
      version: "1.0",
      bom: [],
      evidence: [{ claim: "Invalid", source_type: "official-vendor-page" }],
    })).toThrow("Generated showcase RPPS failed validation");
  });

  it("generates guarded forward SQL and an exact rollback", () => {
    const project = prepared();
    const now = "2026-08-20T17:30:00.000Z";
    const forward = buildReviewedShowcaseMediaForwardSql([project], wave.wave, now);
    expect(forward).toContain("INSERT INTO files");
    expect(forward).toContain("NOT EXISTS (SELECT 1 FROM project_media");
    expect(forward).toContain("JOIN project_files pf");
    expect(forward).toContain("INSERT INTO evidence_claims");
    expect(forward).toContain("'cover_image.source'");
    expect(forward).toContain("p.updated_at = '2026-08-20T00:00:00.000Z'");
    expect(forward).toContain(`pv.rpps_json = '${row.rpps_json.replaceAll("'", "''")}'`);
    expect(forward).toContain(`UPDATE project_versions SET rpps_json = '${project.nextRppsJson.replaceAll("'", "''")}'`);

    const rollback = buildReviewedShowcaseMediaRollbackSql([project], wave.wave, now);
    expect(rollback).toContain("DELETE FROM evidence_claims");
    expect(rollback).toContain("DELETE FROM project_media");
    expect(rollback).toContain("DELETE FROM project_files");
    expect(rollback).toContain("DELETE FROM files");
    expect(rollback).toContain(`UPDATE project_versions SET rpps_json = '${row.rpps_json.replaceAll("'", "''")}'`);
    expect(rollback).toContain(`UPDATE projects SET updated_at = '${row.updated_at}'`);
  });
});
