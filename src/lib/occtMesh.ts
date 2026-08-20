import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";

export type OcctMeshData = {
  name?: string;
  color?: number[];
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
  };
  index: { array: number[] };
};

export function buildOcctMeshGroup(meshes: OcctMeshData[]): Group {
  const group = new Group();
  for (const source of meshes) {
    if (!source.attributes?.position?.array?.length || !source.index?.array?.length) continue;
    const geometry = new BufferGeometry();
    geometry.name = source.name ?? "cad-mesh";
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(source.attributes.position.array), 3));
    if (source.attributes.normal?.array?.length) {
      geometry.setAttribute("normal", new BufferAttribute(Float32Array.from(source.attributes.normal.array), 3));
    } else {
      geometry.computeVertexNormals();
    }
    geometry.setIndex(new BufferAttribute(Uint32Array.from(source.index.array), 1));
    const color = source.color?.length === 3 ? new Color(source.color[0], source.color[1], source.color[2]) : new Color("#8aa6c0");
    const material = new MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.12 });
    const mesh = new Mesh(geometry, material);
    mesh.name = source.name ?? "cad-mesh";
    group.add(mesh);
  }
  return group;
}

export function disposeThreeObject(object: Object3D): void {
  object.traverse((child) => {
    const candidate = child as Object3D & { geometry?: { dispose: () => void }; material?: { dispose: () => void } | Array<{ dispose: () => void }> };
    candidate.geometry?.dispose();
    if (Array.isArray(candidate.material)) candidate.material.forEach((material) => material.dispose());
    else candidate.material?.dispose();
  });
}
