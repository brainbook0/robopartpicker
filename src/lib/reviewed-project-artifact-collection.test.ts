import { describe, expect, it } from "vitest";
import { expandReviewedProjectArtifactCollection } from "./reviewed-project-artifact-collection";
import type { ReviewedProjectArtifactWave } from "./reviewed-project-artifacts";

function collection(): ReviewedProjectArtifactWave {
  return {
    wave: "reviewed-robot-meshes-2026-08-20",
    schema_version: 1,
    artifacts: ["left.stl", "right.stl"].map((path) => ({
      slug: "robot",
      repository_url: "https://github.com/example/robot",
      revision: "a".repeat(40),
      path: `meshes/${path}`,
      sha256: path === "left.stl" ? "b".repeat(64) : "c".repeat(64),
      size_bytes: 100,
      media_type: "application/octet-stream",
      file_kind: "cad" as const,
      purpose: "cad",
      rpps_kind: "cad" as const,
      description: `${path} reviewed mesh`,
    })),
  };
}

describe("expandReviewedProjectArtifactCollection", () => {
  it("expands repeated project artifacts into deterministic exact waves", () => {
    const result = expandReviewedProjectArtifactCollection(collection());

    expect(result.errors).toEqual([]);
    expect(result.waves.map((wave) => wave.wave)).toEqual([
      "reviewed-robot-meshes-2026-08-20-001",
      "reviewed-robot-meshes-2026-08-20-002",
    ]);
    expect(result.waves.every((wave) => wave.artifacts.length === 1)).toBe(true);
  });

  it("rejects duplicate project paths before any child wave runs", () => {
    const input = collection();
    input.artifacts[1] = { ...input.artifacts[0] };

    expect(expandReviewedProjectArtifactCollection(input).errors).toEqual(expect.arrayContaining([
      "robot: duplicate artifact path meshes/left.stl",
    ]));
  });
});
