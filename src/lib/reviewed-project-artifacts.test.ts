import { describe, expect, it } from "vitest";
import {
  buildReviewedProjectArtifactForwardSql,
  buildReviewedProjectArtifactRollbackSql,
  reviewedArtifactContentUrl,
  reviewedArtifactFileId,
  reviewedArtifactObjectKey,
  reviewedArtifactSourceDownloadUrl,
  reviewedArtifactSourcePageUrl,
  serializeReviewedProjectArtifactRpps,
  validateReviewedProjectArtifactWave,
  type PreparedReviewedProjectArtifact,
  type ReviewedProjectArtifactDefinition,
  type ReviewedProjectArtifactWave,
} from "./reviewed-project-artifacts";

const definition: ReviewedProjectArtifactDefinition = {
  slug: "caesar-jl",
  repository_url: "https://github.com/JuliaRobotics/Caesar.jl",
  revision: "1f6967359dc4e631bb09e53330267ece953ad50f",
  path: "data/models/rov2.obj",
  sha256: "ea5aabbac3e4a96d88a1f3396aa834fd0779fb3cf9c0ae0e54e70bb16d3d5af6",
  size_bytes: 5_619_901,
  media_type: "model/obj",
  file_kind: "cad",
  purpose: "cad",
  rpps_kind: "cad",
  description: "Complete ROV model exported by the source repository.",
};

const wave: ReviewedProjectArtifactWave = {
  wave: "reviewed-project-artifacts-2026-08-20",
  schema_version: 1,
  artifacts: [definition],
};

function prepared(): PreparedReviewedProjectArtifact {
  const fileId = reviewedArtifactFileId(wave.wave, definition);
  return {
    definition,
    row: {
      id: "project-1",
      slug: definition.slug,
      owner_user_id: "catalog-import",
      organization_id: null,
      visibility: "public",
      status: "published",
      project_kind: "physical_design",
      repository_url: "https://github.com/juliarobotics/caesar.jl",
      revision: definition.revision,
      updated_at: "2026-08-20T00:00:00.000Z",
      current_version_id: "version-1",
      rpps_json: "{\"rpps_version\":\"1.0.0\"}",
    },
    nextRppsJson: "{\"rpps_version\":\"1.0.0\",\"files\":[]}",
    fileId,
    evidenceId: "evidence-1",
    evidenceClaimId: "claim-1",
    objectKey: reviewedArtifactObjectKey(wave.wave, definition),
    originalName: "rov2.obj",
    contentUrl: reviewedArtifactContentUrl("https://example.com", fileId),
    sourcePageUrl: reviewedArtifactSourcePageUrl(definition),
    sourceDownloadUrl: reviewedArtifactSourceDownloadUrl(definition),
    metadataJson: "{}",
  };
}

describe("reviewed project artifact waves", () => {
  it("validates pinned source-backed artifacts", () => {
    expect(validateReviewedProjectArtifactWave(wave)).toEqual([]);
    expect(validateReviewedProjectArtifactWave({ ...wave, artifacts: [{ ...definition, revision: "main", sha256: "bad" }] })).toEqual(expect.arrayContaining([
      "caesar-jl: revision must be a lowercase 40-character git hash",
      "caesar-jl: sha256 is invalid",
    ]));
  });

  it("derives immutable GitHub source URLs", () => {
    expect(reviewedArtifactSourcePageUrl(definition)).toBe("https://github.com/JuliaRobotics/Caesar.jl/blob/1f6967359dc4e631bb09e53330267ece953ad50f/data/models/rov2.obj");
    expect(reviewedArtifactSourceDownloadUrl(definition)).toBe("https://raw.githubusercontent.com/JuliaRobotics/Caesar.jl/1f6967359dc4e631bb09e53330267ece953ad50f/data/models/rov2.obj");
  });

  it("builds deterministic managed artifact identities", () => {
    expect(reviewedArtifactFileId(wave.wave, definition)).toMatch(/^file_[a-f0-9]{32}$/u);
    expect(reviewedArtifactObjectKey(wave.wave, definition)).toContain(`${definition.sha256}/rov2.obj`);
  });

  it("emits guarded forward and exact rollback SQL", () => {
    const project = prepared();
    const forward = buildReviewedProjectArtifactForwardSql([project], wave.wave, "2026-08-20T01:00:00.000Z");
    const rollback = buildReviewedProjectArtifactRollbackSql([project], wave.wave, "2026-08-20T01:00:00.000Z");
    expect(forward).toContain("INSERT INTO files");
    expect(forward).toContain("INSERT INTO project_files");
    expect(forward).toContain("INSERT INTO evidence_claims");
    expect(forward).toContain("artifact.source");
    expect(forward).toContain(definition.revision);
    expect(forward).toContain("p.repository_url = 'https://github.com/juliarobotics/caesar.jl'");
    expect(rollback).toContain("DELETE FROM evidence_claims");
    expect(rollback).toContain("DELETE FROM files");
    expect(rollback).toContain(project.row.rpps_json);
  });

  it("validates RPPS while preserving reviewed extension fields", () => {
    const serialized = serializeReviewedProjectArtifactRpps({
      rpps_version: "1.0.0",
      name: "Caesar",
      slug: "caesar-jl",
      version: "0.1.0",
      bom: [],
      files: [{ path: definition.path, kind: "cad", url: "https://example.com/model.obj" }],
      project_kind: "physical_design",
    });
    expect(JSON.parse(serialized).project_kind).toBe("physical_design");
  });
});
