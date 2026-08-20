declare module "occt-import-js" {
  type ImportParams = {
    linearUnit?: "millimeter" | "centimeter" | "meter" | "inch" | "foot";
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
    linearDeflection?: number;
    angularDeflection?: number;
  } | null;

  type ImportResult = {
    success: boolean;
    meshes: import("@/lib/occtMesh").OcctMeshData[];
  };

  type OcctModule = {
    ReadStepFile(content: Uint8Array, params: ImportParams): ImportResult;
    ReadIgesFile(content: Uint8Array, params: ImportParams): ImportResult;
  };

  export default function createOcct(options?: { locateFile?: (path: string) => string }): Promise<OcctModule>;
}

declare module "occt-import-js/dist/occt-import-js.wasm?url" {
  const url: string;
  export default url;
}
