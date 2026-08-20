import { describe, expect, it } from "vitest";
import {
  buildReviewedProjectFileDedupeForwardSql,
  buildReviewedProjectFileDedupeRollbackSql,
  validateReviewedProjectFileDedupeWave,
  type ReviewedProjectFileDedupeDecision,
  type ReviewedProjectFileDedupeWave,
} from "./reviewed-project-file-dedupe";

const SHA = "a".repeat(64);
const OTHER_SHA = "b".repeat(64);

function decision(overrides: Partial<ReviewedProjectFileDedupeDecision> = {}): ReviewedProjectFileDedupeDecision {
  const keep = {
    project_id: "project-1",
    project_version_id: "version-1",
    file_id: "harvest-file:robot:a:Docs/Guide.md",
    purpose: "document",
    relative_path: "Docs/Guide.md",
    created_at: "2026-08-16T00:00:00.000Z",
    object_key: "harvest-file:robot:a:Docs/Guide.md",
    original_name: "Guide.md",
    media_type: "text/markdown",
    size_bytes: 42,
    checksum_sha256: SHA,
    kind: "document",
    status: "ready" as const,
    visibility: "public" as const,
  };
  const drop = {
    ...keep,
    file_id: "harvest-file:robot:a:docs/guide.md",
    created_at: "2026-08-14T00:00:00.000Z",
    object_key: "catalog-completeness/2026-08-14/robot/a/Docs/Guide.md",
    media_type: "text/plain",
  };
  return {
    slug: "robot",
    project_id: "project-1",
    project_version_id: "version-1",
    path_key: "docs/guide.md",
    source: {
      mode: "managed_exact_duplicate",
      canonical_object_provenance: "direct_harvest",
      checksum_sha256: SHA,
      size_bytes: 42,
    },
    keep,
    drop,
    media_relinks: [],
    ...overrides,
  };
}

function wave(item = decision()): ReviewedProjectFileDedupeWave {
  return {
    wave: "reviewed-project-file-dedupe-2026-08-20",
    schema_version: 1,
    reviewed_at: "2026-08-20T20:00:00.000Z",
    contract: "Keep the direct source harvest and detach only the redundant catalog-completeness link.",
    expected: {
      projects: 1,
      duplicate_groups: 1,
      removed_links: 1,
      media_relinks: item.media_relinks.length,
      conflicting_content_groups: item.source.mode === "pinned_repository_revision" ? 1 : 0,
    },
    decisions: [item],
  };
}

describe("validateReviewedProjectFileDedupeWave", () => {
  it("accepts exact duplicate managed objects with deterministic provenance", () => {
    expect(validateReviewedProjectFileDedupeWave(wave())).toEqual([]);
  });

  it("rejects an exact-duplicate decision whose content differs", () => {
    const item = decision({ drop: { ...decision().drop, checksum_sha256: OTHER_SHA } });
    expect(validateReviewedProjectFileDedupeWave(wave(item))).toContain("robot: managed_exact_duplicate requires equal size and checksum");
  });

  it("accepts a conflict only when the canonical file matches a pinned repository revision", () => {
    const base = decision();
    const item = decision({
      drop: { ...base.drop, checksum_sha256: OTHER_SHA, size_bytes: 41 },
      source: {
        mode: "pinned_repository_revision",
        repository_url: "https://github.com/example/robot",
        revision: "c".repeat(40),
        path: "Docs/Guide.md",
        source_url: `https://raw.githubusercontent.com/example/robot/${"c".repeat(40)}/Docs/Guide.md`,
        checksum_sha256: SHA,
        size_bytes: 42,
      },
    });
    expect(validateReviewedProjectFileDedupeWave(wave(item))).toEqual([]);
  });

  it("requires media relinks to point from the redundant file to the canonical file", () => {
    const base = decision();
    const item = decision({
      media_relinks: [{
        id: "media-1",
        project_id: base.project_id,
        old_file_id: base.keep.file_id,
        new_file_id: base.drop.file_id,
        caption: null,
        alt_text: null,
        sort_order: 0,
        created_at: "2026-08-14T00:00:00.000Z",
      }],
    });
    expect(validateReviewedProjectFileDedupeWave(wave(item))).toContain("robot/media-1: media relink file ids do not match decision");
  });
});

describe("reviewed project file dedupe SQL", () => {
  it("relinks media before deleting only the exact redundant project link", () => {
    const base = decision();
    const item = decision({
      media_relinks: [{
        id: "media-1",
        project_id: base.project_id,
        old_file_id: base.drop.file_id,
        new_file_id: base.keep.file_id,
        caption: "Official image",
        alt_text: "Robot",
        sort_order: 0,
        created_at: "2026-08-14T00:00:00.000Z",
      }],
    });
    const sql = buildReviewedProjectFileDedupeForwardSql([item], "wave");
    expect(sql.indexOf("UPDATE project_media")).toBeLessThan(sql.indexOf("DELETE FROM project_files"));
    expect(sql).toContain(`SET file_id = '${base.keep.file_id}'`);
    expect(sql).toContain(`project_files.file_id = '${base.drop.file_id}'`);
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM project_media");
    expect(sql).not.toContain("DELETE FROM files");
  });

  it("rollback restores the exact link before restoring its media reference", () => {
    const base = decision();
    const item = decision({
      media_relinks: [{
        id: "media-1",
        project_id: base.project_id,
        old_file_id: base.drop.file_id,
        new_file_id: base.keep.file_id,
        caption: null,
        alt_text: null,
        sort_order: 0,
        created_at: "2026-08-14T00:00:00.000Z",
      }],
    });
    const sql = buildReviewedProjectFileDedupeRollbackSql([item], "wave");
    expect(sql.indexOf("INSERT INTO project_files")).toBeLessThan(sql.indexOf("UPDATE project_media"));
    expect(sql).toContain(base.drop.relative_path);
    expect(sql).toContain(base.drop.created_at);
    expect(sql).not.toContain("INSERT INTO files");
  });
});
