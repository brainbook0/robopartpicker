import { describe, expect, it } from "vitest";
import {
  buildReviewedProjectContentForwardSql,
  buildReviewedProjectContentRollbackSql,
  canonicalRepo,
  extractMarkdownSection,
  immutableBlobUrl,
  prepareProjectSteps,
  reviewedCoverFileId,
  reviewedMediaId,
  validateReviewedProjectContentWave,
  type PreparedReviewedProjectContent,
  type ReviewedProjectContentDefinition,
  type ReviewedProjectContentRow,
  type ReviewedProjectContentWave,
} from "./reviewed-project-content";

const project: ReviewedProjectContentDefinition = {
  project_id: "example-robot",
  repo_url: "https://github.com/Example/Robot.git",
  revision: "a".repeat(40),
  name: "Example Robot 2",
  summary: "A sourced robot project.",
  description: "A longer source-backed description.",
  docs_path: "README.md",
  docs_sha256: "b".repeat(64),
  cover: {
    path: "docs/robot cover.png",
    sha256: "c".repeat(64),
    size_bytes: 1234,
    caption: "Official project image",
    alt_text: "Example robot on a workbench",
  },
  assembly_source: {
    path: "docs/assembly.md",
    sha256: "d".repeat(64),
  },
  steps: [
    { step_key: "prepare", heading: "## Prepare", title: "Prepare parts" },
    { step_key: "assemble", heading: "## Assemble", title: "Assemble robot" },
  ],
};

const wave: ReviewedProjectContentWave = {
  wave: "reviewed-content-test",
  schema_version: 1,
  projects: [project],
};

const row: ReviewedProjectContentRow = {
  id: "project-id",
  slug: "example-robot",
  name: "Example Robot",
  summary: null,
  description: "Old description",
  repository_url: "https://github.com/example/robot",
  revision: "a".repeat(40),
  updated_at: "2026-08-14T00:00:00.000Z",
  current_version_id: "version-id",
  rpps_json: '{"rpps_version":"1.0.0","name":"Example Robot"}',
};

describe("reviewed project content", () => {
  it("validates a pinned wave and rejects missing steps", () => {
    expect(validateReviewedProjectContentWave(wave)).toEqual([]);
    expect(validateReviewedProjectContentWave({ ...wave, projects: [{ ...project, steps: [] }] }))
      .toContain("example-robot: steps must not be empty");
  });

  it("canonicalizes repository identity and creates immutable encoded links", () => {
    expect(canonicalRepo(project.repo_url)).toBe("github.com/example/robot");
    expect(immutableBlobUrl(project, project.cover.path)).toBe(
      `https://github.com/Example/Robot/blob/${project.revision}/docs/robot%20cover.png`,
    );
  });

  it("extracts exact H2 sections, removes inline images, and prepares deterministic steps", () => {
    const markdown = [
      "# Guide",
      "## Prepare",
      "Collect the parts.",
      '<img src="unsafe.png">',
      "### Detail",
      "Keep this subsection.",
      "## Assemble",
      "Join the frame.",
      "## Finish",
      "Not part of Assemble.",
    ].join("\n");

    expect(extractMarkdownSection(markdown, "## Prepare")).toBe(
      "Collect the parts.\n\n### Detail\nKeep this subsection.",
    );
    const steps = prepareProjectSteps(wave, project, markdown);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ step_key: "prepare", sort_order: 0 });
    expect(steps[0].id).toMatch(/^pstep_/u);
    expect(steps[0].body).toContain(`Source: ${immutableBlobUrl(project, project.assembly_source.path)}`);
    expect(steps[1].body).not.toContain("Not part of Assemble");
  });

  it("generates guarded forward and rollback SQL with normalized content and evidence claims", () => {
    const now = "2026-08-14T20:00:00.000Z";
    const steps = prepareProjectSteps(wave, project, "## Prepare\nCollect.\n## Assemble\nJoin.");
    const prepared: PreparedReviewedProjectContent = {
      definition: project,
      row,
      nextRppsJson: '{"rpps_version":"1.0.0","name":"Example Robot 2"}',
      coverFileId: reviewedCoverFileId(project),
      coverUrl: "https://example.test/api/v1/files/cover/content",
      mediaId: reviewedMediaId(row.id, reviewedCoverFileId(project), wave.wave),
      evidenceId: "evidence-content",
      evidenceClaimId: "claim-content",
      steps,
    };

    const forward = buildReviewedProjectContentForwardSql([prepared], wave.wave, now);
    expect(forward).toContain("INSERT INTO project_steps");
    expect(forward).toContain("SELECT pv.id FROM project_versions");
    expect(forward).toContain("p.summary IS NULL");
    expect(forward).toContain("INSERT INTO project_media");
    expect(forward).toContain("UPDATE project_versions SET rpps_json");
    expect(forward).toContain("INSERT INTO evidence_claims");
    expect(forward).toContain("'assembly.source'");

    const rollback = buildReviewedProjectContentRollbackSql([prepared], wave.wave, now);
    expect(rollback).toContain("DELETE FROM evidence_claims");
    expect(rollback).toContain("DELETE FROM project_media");
    expect(rollback).toContain("DELETE FROM project_steps");
    expect(rollback).toContain(`pv.rpps_json = '${prepared.nextRppsJson.replaceAll("'", "''")}'`);
    expect(rollback).toContain("UPDATE projects SET name = 'Example Robot'");
  });
});
