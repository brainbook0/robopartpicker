import { describe, expect, it } from "vitest";
import type { ProjectFile } from "@/lib/api/files";
import { selectProjectPreviewFiles } from "@/lib/projectPreview";

function file(overrides: Partial<ProjectFile>): ProjectFile {
  return {
    id: crypto.randomUUID(),
    projectVersionId: "version-1",
    originalName: "part.stl",
    mediaType: "model/stl",
    sizeBytes: 100,
    checksumSha256: null,
    visibility: "public",
    status: "ready",
    kind: "cad",
    purpose: "cad",
    relativePath: null,
    caption: null,
    altText: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    contentUrl: `/api/v1/files/${crypto.randomUUID()}/content`,
    ...overrides,
  };
}

describe("selectProjectPreviewFiles", () => {
  it("uses one explicit complete STL assembly instead of duplicating it with part files", () => {
    const assembly = file({ originalName: "complete-assembly.stl", sizeBytes: 1_000 });
    const part = file({ originalName: "wheel.stl", sizeBytes: 500 });

    expect(selectProjectPreviewFiles([part, assembly]).stlFiles).toEqual([assembly]);
  });

  it("keeps every STL part when no complete assembly artifact is identified", () => {
    const parts = [file({ originalName: "base.stl" }), file({ originalName: "wheel-left.stl" }), file({ originalName: "wheel-right.stl" })];

    expect(selectProjectPreviewFiles(parts).stlFiles).toHaveLength(3);
  });

  it("excludes non-ready artifacts while exposing images and STEP fallbacks", () => {
    const image = file({ originalName: "robot-photo.jpg", mediaType: "image/jpeg", kind: "image" });
    const step = file({ originalName: "robot.step", mediaType: "model/step" });
    const pending = file({ originalName: "pending.stl", status: "pending" });

    const result = selectProjectPreviewFiles([image, step, pending]);
    expect(result.readyFiles).toHaveLength(2);
    expect(result.imageFiles).toEqual([image]);
    expect(result.stepFiles).toEqual([step]);
    expect(result.objFile).toBeNull();
    expect(result.stlFiles).toEqual([]);
    expect(result.other3dFiles).toEqual([]);
  });

  it("selects the explicit complete OBJ or the largest detailed export", () => {
    const compact = file({ originalName: "robot-v3.obj", sizeBytes: 800 });
    const detailed = file({ originalName: "robot-v2.obj", sizeBytes: 5_000 });
    const complete = file({ originalName: "complete-robot.obj", sizeBytes: 1_000 });

    expect(selectProjectPreviewFiles([compact, detailed]).objFile).toBe(detailed);
    expect(selectProjectPreviewFiles([compact, detailed, complete]).objFile).toBe(complete);
  });

  it("deduplicates identical source artifacts and does not mistake an assembly jig for a complete design", () => {
    const duplicateA = file({ originalName: "wheel.stl", relativePath: "cad/wheel.stl", checksumSha256: "a".repeat(64) });
    const duplicateB = file({ originalName: "wheel-copy.stl", relativePath: "archive/wheel-copy.stl", checksumSha256: "a".repeat(64) });
    const jig = file({ originalName: "assembly-jig.stl", relativePath: "tools/assembly-jig.stl", checksumSha256: "b".repeat(64) });

    const result = selectProjectPreviewFiles([duplicateA, duplicateB, jig]);
    expect(result.readyFiles).toHaveLength(2);
    expect(result.stlFiles).toHaveLength(2);
  });
});
