import { describe, expect, it } from "vitest";
import { Box3 } from "three";
import { buildOcctMeshGroup, disposeThreeObject } from "@/lib/occtMesh";

describe("buildOcctMeshGroup", () => {
  it("maps importer position, normal, index, and color arrays into Three.js geometry", () => {
    const group = buildOcctMeshGroup([{
      name: "triangle",
      color: [0.25, 0.5, 0.75],
      attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] }, normal: { array: [0, 0, 1, 0, 0, 1, 0, 0, 1] } },
      index: { array: [0, 1, 2] },
    }]);

    expect(group.children).toHaveLength(1);
    expect(new Box3().setFromObject(group).max.toArray()).toEqual([1, 1, 0]);
    disposeThreeObject(group);
  });

  it("ignores empty importer meshes", () => {
    const group = buildOcctMeshGroup([{ attributes: { position: { array: [] } }, index: { array: [] } }]);
    expect(group.children).toHaveLength(0);
  });
});
