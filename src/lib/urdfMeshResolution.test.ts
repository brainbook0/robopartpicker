import { describe, expect, it } from "vitest";
import { normalizeUrdfAssetPath, resolveManagedUrdfMeshUrl } from "./urdfMeshResolution";

const files = [
  {
    relativePath: "meshes/robotiq_85_base_link_fine.STL",
    originalName: "robotiq_85_base_link_fine.STL",
    contentUrl: "/api/v1/files/content?id=fine",
  },
  {
    relativePath: "robots/meshes/local.STL",
    originalName: "local.STL",
    contentUrl: "/api/v1/files/content?id=local",
  },
];

describe("normalizeUrdfAssetPath", () => {
  it("normalizes separators and parent segments", () => {
    expect(normalizeUrdfAssetPath("robots\\parts/../meshes/base.STL")).toBe("robots/meshes/base.STL");
  });
});

describe("resolveManagedUrdfMeshUrl", () => {
  it("resolves package URIs from the package root instead of the URDF directory", () => {
    expect(resolveManagedUrdfMeshUrl(
      "package://robotiq_arg85_description/meshes/robotiq_85_base_link_fine.STL",
      "robots/robotiq_arg85_description.URDF",
      files,
    )).toBe("/api/v1/files/content?id=fine");
  });

  it("resolves ordinary relative mesh paths against the URDF directory", () => {
    expect(resolveManagedUrdfMeshUrl("meshes/local.STL", "robots/model.urdf", files)).toBe("/api/v1/files/content?id=local");
  });

  it("falls back to an exact managed original name", () => {
    expect(resolveManagedUrdfMeshUrl("unlisted/folder/robotiq_85_base_link_fine.STL", null, files)).toBe("/api/v1/files/content?id=fine");
  });

  it("leaves an unresolved mesh untouched", () => {
    expect(resolveManagedUrdfMeshUrl("package://robot/meshes/missing.STL", "robots/model.urdf", files)).toBeNull();
  });
});
