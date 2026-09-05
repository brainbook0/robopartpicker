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
    const assembly = file({ originalName: "complete-assembly.stl", purpose: "complete_assembly", sizeBytes: 1_000 });
    const part = file({ originalName: "wheel.stl", sizeBytes: 500 });

    const result = selectProjectPreviewFiles([part, assembly]);
    expect(result.stlFiles).toEqual([assembly]);
    expect(result.stlIsCompleteAssembly).toBe(true);
  });

  it("does not treat a complete-looking filename as verified assembly metadata", () => {
    const unverified = file({ originalName: "complete-robot.stl", purpose: "cad", sizeBytes: 1_000 });

    const result = selectProjectPreviewFiles([unverified]);
    expect(result.stlFiles).toEqual([unverified]);
    expect(result.stlIsCompleteAssembly).toBe(false);
  });

  it("keeps every STL part when no complete assembly artifact is identified", () => {
    const parts = [file({ originalName: "base.stl" }), file({ originalName: "wheel-left.stl" }), file({ originalName: "wheel-right.stl" })];

    const result = selectProjectPreviewFiles(parts);
    expect(result.stlFiles).toHaveLength(3);
    expect(result.stlIsCompleteAssembly).toBe(false);
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
    const complete = file({ originalName: "complete-robot.obj", purpose: "complete_assembly", sizeBytes: 1_000 });

    expect(selectProjectPreviewFiles([compact, detailed]).objFile).toBe(detailed);
    expect(selectProjectPreviewFiles([compact, detailed, complete]).objFile).toBe(complete);
    expect(selectProjectPreviewFiles([compact, detailed]).objIsCompleteAssembly).toBe(false);
    expect(selectProjectPreviewFiles([compact, detailed, complete]).objIsCompleteAssembly).toBe(true);
  });

  it("deduplicates identical source artifacts and excludes an assembly jig from preview geometry", () => {
    const duplicateA = file({ originalName: "wheel.stl", relativePath: "cad/wheel.stl", checksumSha256: "a".repeat(64) });
    const duplicateB = file({ originalName: "wheel-copy.stl", relativePath: "archive/wheel-copy.stl", checksumSha256: "a".repeat(64) });
    const jig = file({ originalName: "assembly-jig.stl", relativePath: "tools/assembly-jig.stl", checksumSha256: "b".repeat(64) });

    const result = selectProjectPreviewFiles([duplicateA, duplicateB, jig]);
    expect(result.readyFiles).toHaveLength(3);
    expect(result.stlFiles).toEqual([duplicateA]);
    expect(result.excluded3dFiles).toEqual([jig]);
  });

  it("preserves byte-identical files at distinct URDF package paths", () => {
    const left = file({ originalName: "left_base.STL", relativePath: "meshes/left_base.STL", checksumSha256: "a".repeat(64) });
    const right = file({ originalName: "right_base.STL", relativePath: "meshes/right_base.STL", checksumSha256: "a".repeat(64) });

    const result = selectProjectPreviewFiles([left, right]);
    expect(result.readyFiles).toEqual([left, right]);
    expect(result.stlFiles).toEqual([left]);
  });

  it("rejects simulation worlds, terrain, fixtures, and jigs from project geometry previews", () => {
    const robot = file({ originalName: "body.stl", relativePath: "robot_description/meshes/body.stl" });
    const terrain = file({ originalName: "slope.stl", relativePath: "simulation/gazebo/worlds/slope/meshes/slope.stl" });
    const rock = file({ originalName: "rock.stl", relativePath: "assets/terrain/rock.stl" });
    const jig = file({ originalName: "assembly-jig.stl", relativePath: "cad/tools/assembly-jig.stl" });

    const result = selectProjectPreviewFiles([terrain, robot, rock, jig]);

    expect(result.stlFiles).toEqual([robot]);
    expect(result.excluded3dFiles).toEqual(expect.arrayContaining([terrain, rock, jig]));
  });

  it("retains every eligible URDF candidate so a broken preferred manifest can fall back to another", () => {
    const compact = file({ originalName: "robot.urdf", relativePath: "description/robot.urdf", sizeBytes: 800 });
    const complete = file({ originalName: "complete-robot.urdf", relativePath: "description/complete-robot.urdf", purpose: "complete_assembly", sizeBytes: 400 });

    const result = selectProjectPreviewFiles([compact, complete]);

    expect(result.urdfFiles).toEqual([complete, compact]);
    expect(result.urdfFile).toEqual(complete);
    expect(result.urdfIsCompleteAssembly).toBe(true);
  });

  it("uses one explicit complete STEP assembly but preserves loose STEP files as source parts", () => {
    const complete = file({ originalName: "complete-robot.step", relativePath: "cad/complete-robot.step", purpose: "complete_assembly", sizeBytes: 5_000 });
    const base = file({ originalName: "base.step", relativePath: "cad/base.step", sizeBytes: 2_000 });
    const wheel = file({ originalName: "wheel.step", relativePath: "cad/wheel.step", sizeBytes: 1_000 });

    expect(selectProjectPreviewFiles([base, complete, wheel])).toMatchObject({ stepFiles: [complete], stepIsCompleteAssembly: true });
    expect(selectProjectPreviewFiles([base, wheel])).toMatchObject({ stepFiles: [base, wheel], stepIsCompleteAssembly: false });
  });
});
