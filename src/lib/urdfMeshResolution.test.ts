import { describe, expect, it } from "vitest";
import { normalizeUrdfAssetPath, resolveManagedUrdfMeshUrl, rewriteManagedUrdfMeshUrls } from "./urdfMeshResolution";

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

  it("matches a package-relative path against a unique repository-path suffix", () => {
    const repositoryFiles = [{
      relativePath: "AlohaMini2/urdf/alohamini2pro/alohamini2pro_meshes/base_link.STL",
      originalName: "base_link.STL",
      contentUrl: "/api/v1/files/content?id=aloha-base",
    }];

    expect(resolveManagedUrdfMeshUrl(
      "package://alohamini2pro_urdf/alohamini2pro_meshes/base_link.STL",
      "AlohaMini2/urdf/alohamini2pro/urdf/alohamini2pro.urdf",
      repositoryFiles,
    )).toBe("/api/v1/files/content?id=aloha-base");
  });

  it("leaves an unresolved mesh untouched", () => {
    expect(resolveManagedUrdfMeshUrl("package://robot/meshes/missing.STL", "robots/model.urdf", files)).toBeNull();
  });
});

describe("rewriteManagedUrdfMeshUrls", () => {
  it("rewrites managed mesh references to absolute URLs", () => {
    const urdf = '<robot><mesh filename="package://robotiq/meshes/robotiq_85_base_link_fine.STL" scale="1 1 1" /></robot>';

    expect(rewriteManagedUrdfMeshUrls(urdf, "robots/robot.urdf", files, "https://example.com/projects/robot")).toBe(
      '<robot><mesh filename="https://example.com/api/v1/files/content?id=fine" scale="1 1 1" /></robot>',
    );
  });
});
