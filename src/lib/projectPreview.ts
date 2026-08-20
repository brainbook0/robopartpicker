import type { ProjectFile } from "@/lib/api/files";

export type ProjectPreviewSelection = {
  readyFiles: ProjectFile[];
  imageFiles: ProjectFile[];
  urdfFile: ProjectFile | null;
  stlFiles: ProjectFile[];
  stepFiles: ProjectFile[];
  objFile: ProjectFile | null;
  other3dFiles: ProjectFile[];
};

const completeDesignName = /(^|[-_\s])(full|complete|combined|whole|total)([-_\s.]|$)/iu;
const exactCompleteStlName = /(^|\/)(assembly|assembled|robot)([-_\s](model|design))?\.stl$/iu;

export function selectProjectPreviewFiles(files: ProjectFile[]): ProjectPreviewSelection {
  const readyFiles = dedupeFiles(files.filter((file) => file.status === "ready" && Boolean(file.contentUrl)));
  const imageFiles = readyFiles.filter((file) => file.kind === "image" || file.mediaType.startsWith("image/"));
  const urdfCandidates = sortCompleteDesignFirst(readyFiles.filter((file) => extension(file) === "urdf"));
  const stlCandidates = sortCompleteDesignFirst(readyFiles.filter((file) => extension(file) === "stl"));
  const completeStl = stlCandidates.find(isCompleteDesignFile);
  const stepFiles = sortCompleteDesignFirst(readyFiles.filter((file) => ["step", "stp", "iges", "igs"].includes(extension(file))));
  const objFiles = sortCompleteDesignFirst(readyFiles.filter((file) => extension(file) === "obj"));
  const other3dFiles = readyFiles.filter((file) => ["3mf", "dae", "glb", "gltf", "fcstd", "f3d", "sldprt", "scad"].includes(extension(file)));

  return {
    readyFiles,
    imageFiles,
    urdfFile: urdfCandidates[0] ?? null,
    // A named full assembly already contains the complete design. Otherwise every
    // current-release STL part is required to preserve its shared CAD coordinates.
    stlFiles: completeStl ? [completeStl] : stlCandidates,
    stepFiles,
    // OBJ repositories commonly retain multiple full-design revisions. Prefer an
    // explicitly named complete model, otherwise the most detailed (largest) mesh.
    objFile: objFiles[0] ?? null,
    other3dFiles,
  };
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

function sortCompleteDesignFirst(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort((left, right) => {
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
