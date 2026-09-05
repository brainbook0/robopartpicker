import type { ProjectFile } from "@/lib/api/files";

export type ProjectPreviewSelection = {
  readyFiles: ProjectFile[];
  imageFiles: ProjectFile[];
  urdfFiles: ProjectFile[];
  urdfFile: ProjectFile | null;
  urdfIsCompleteAssembly: boolean;
  stlFiles: ProjectFile[];
  stlIsCompleteAssembly: boolean;
  stepFiles: ProjectFile[];
  stepIsCompleteAssembly: boolean;
  objFile: ProjectFile | null;
  objIsCompleteAssembly: boolean;
  other3dFiles: ProjectFile[];
  excluded3dFiles: ProjectFile[];
};

const completeDesignName = /(^|[-_\s])(full|complete|combined|whole|total)([-_\s.]|$)/iu;
const exactCompleteStlName = /(^|\/)(assembly|assembled|robot)([-_\s](model|design))?\.stl$/iu;
const modelExtensions = new Set(["urdf", "stl", "step", "stp", "iges", "igs", "obj", "3mf", "dae", "glb", "gltf", "fcstd", "f3d", "sldprt", "scad"]);
const nonProductGeometryDirectory = /(^|\/)(?:worlds?|terrain|landscape|environment|scenes?|fixtures?|jigs?|tools?|test(?:s|_data)?|examples?|samples?)(?:\/|$)/iu;
const nonProductGeometryName = /(?:^|[-_\s])(assembly[-_\s]?jig|jig|fixture|calibration[-_\s]?(?:object|part)|test[-_\s]?(?:piece|point))(?:[-_\s.]|$)/iu;
const verifiedCompleteAssemblyPurposes = new Set(["complete_assembly", "verified_complete_assembly", "project_complete_assembly"]);

export function selectProjectPreviewFiles(files: ProjectFile[]): ProjectPreviewSelection {
  // URDF resolution is path-sensitive. Two package paths may intentionally
  // contain byte-identical meshes, such as mirrored left/right robot parts,
  // so keep every ready path available to the URDF loader. Deduplicate only
  // the standalone preview collections that would otherwise render the same
  // payload twice.
  const readyFiles = files.filter((file) => file.status === "ready" && Boolean(file.contentUrl));
  const previewFiles = dedupeFiles(readyFiles);
  const imageFiles = previewFiles.filter((file) => file.kind === "image" || file.mediaType.startsWith("image/"));
  const modelFiles = previewFiles.filter((file) => modelExtensions.has(extension(file)));
  const excluded3dFiles = modelFiles.filter(isExcludedProjectGeometry);
  const eligibleModelFiles = modelFiles.filter((file) => !isExcludedProjectGeometry(file));
  const urdfCandidates = sortCompleteDesignFirst(eligibleModelFiles.filter((file) => extension(file) === "urdf"));
  const stlCandidates = sortCompleteDesignFirst(eligibleModelFiles.filter((file) => extension(file) === "stl"));
  const completeStl = stlCandidates.find(isVerifiedCompleteAssembly);
  const stepCandidates = sortCompleteDesignFirst(eligibleModelFiles.filter((file) => ["step", "stp", "iges", "igs"].includes(extension(file))));
  const completeStep = stepCandidates.find(isVerifiedCompleteAssembly);
  const objFiles = sortCompleteDesignFirst(eligibleModelFiles.filter((file) => extension(file) === "obj"));
  const completeObj = objFiles.find(isVerifiedCompleteAssembly);
  const other3dFiles = eligibleModelFiles.filter((file) => ["3mf", "dae", "glb", "gltf", "fcstd", "f3d", "sldprt", "scad"].includes(extension(file)));

  return {
    readyFiles,
    imageFiles,
    urdfFiles: urdfCandidates,
    urdfFile: urdfCandidates[0] ?? null,
    urdfIsCompleteAssembly: urdfCandidates.some(isVerifiedCompleteAssembly),
    // A named full assembly already contains the complete design. Loose meshes
    // are exposed as source parts only because their assembly transforms are unknown.
    stlFiles: completeStl ? [completeStl] : stlCandidates,
    stlIsCompleteAssembly: Boolean(completeStl),
    stepFiles: completeStep ? [completeStep] : stepCandidates,
    stepIsCompleteAssembly: Boolean(completeStep),
    // OBJ repositories commonly retain multiple full-design revisions. Prefer an
    // explicitly named complete model, otherwise the most detailed (largest) mesh.
    objFile: completeObj ?? objFiles[0] ?? null,
    objIsCompleteAssembly: Boolean(completeObj),
    other3dFiles,
    excluded3dFiles,
  };
}

function isExcludedProjectGeometry(file: ProjectFile): boolean {
  const path = (file.relativePath ?? file.originalName).replaceAll("\\", "/");
  const basename = path.split("/").at(-1) ?? path;
  return nonProductGeometryDirectory.test(path) || nonProductGeometryName.test(basename);
}

function extension(file: ProjectFile): string {
  const value = (file.relativePath ?? file.originalName).toLowerCase().split(/[?#]/u)[0];
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index + 1);
}

function isCompleteDesignFile(file: ProjectFile): boolean {
  const path = (file.relativePath ?? file.originalName).replaceAll("\\", "/");
  const basename = path.split("/").at(-1) ?? path;
  return completeDesignName.test(basename) || exactCompleteStlName.test(path);
}

function isVerifiedCompleteAssembly(file: ProjectFile): boolean {
  return verifiedCompleteAssemblyPurposes.has(file.purpose.trim().toLowerCase());
}

function sortCompleteDesignFirst(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort((left, right) => {
    const verification = Number(isVerifiedCompleteAssembly(right)) - Number(isVerifiedCompleteAssembly(left));
    if (verification !== 0) return verification;
    const completeness = Number(isCompleteDesignFile(right)) - Number(isCompleteDesignFile(left));
    if (completeness !== 0) return completeness;
    const size = (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0);
    if (size !== 0) return size;
    return (left.relativePath ?? left.originalName).localeCompare(right.relativePath ?? right.originalName);
  });
}

function dedupeFiles(files: ProjectFile[]): ProjectFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const path = file.relativePath?.replaceAll("\\", "/").toLowerCase();
    const key = file.checksumSha256
      ? `sha256:${file.checksumSha256.toLowerCase()}`
      : path
        ? `path:${path}:${file.sizeBytes}`
        : `url:${file.contentUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
