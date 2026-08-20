export type UrdfManagedFile = {
  relativePath: string | null;
  contentUrl: string;
  originalName: string;
};

export function normalizeUrdfAssetPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

export function resolveManagedUrdfMeshUrl(
  filename: string,
  urdfPath: string | null,
  files: UrdfManagedFile[],
): string | null {
  const byPath = new Map<string, string>();
  for (const file of files) {
    if (file.relativePath) byPath.set(normalizeUrdfAssetPath(file.relativePath).toLowerCase(), file.contentUrl);
    if (file.originalName) byPath.set(normalizeUrdfAssetPath(file.originalName).toLowerCase(), file.contentUrl);
  }

  const candidates: string[] = [];
  if (filename.startsWith("package://")) {
    const packageRelative = filename.replace(/^package:\/\/[^/]+\//u, "");
    candidates.push(packageRelative);
  } else {
    const candidate = filename.replace(/^file:\/\//u, "");
    const urdfDir = urdfPath ? normalizeUrdfAssetPath(urdfPath).split("/").slice(0, -1).join("/") : "";
    if (!candidate.startsWith("/") && urdfDir) candidates.push(`${urdfDir}/${candidate}`);
    candidates.push(candidate);
  }

  for (const candidate of candidates) {
    const normalized = normalizeUrdfAssetPath(candidate).toLowerCase();
    const resolved = byPath.get(normalized);
    if (resolved) return resolved;

    const suffixMatches = [...byPath.entries()].filter(([path]) => path.endsWith(`/${normalized}`));
    if (suffixMatches.length === 1) return suffixMatches[0][1];

    const basename = normalized.split("/").at(-1);
    if (basename) {
      const byName = byPath.get(basename);
      if (byName) return byName;
    }
  }
  return null;
}

export function rewriteManagedUrdfMeshUrls(
  urdf: string,
  urdfPath: string | null,
  files: UrdfManagedFile[],
  baseUrl: string,
): string {
  return urdf.replace(/<mesh\b[^>]*filename\s*=\s*"([^"]+)"([^>]*)>/giu, (match, filename, rest) => {
    const resolved = resolveManagedUrdfMeshUrl(filename, urdfPath, files);
    if (!resolved) return match;
    const url = new URL(resolved, baseUrl);
    // URDFLoader selects its mesh parser from the URL suffix. Managed content
    // routes identify files by query parameter and therefore have no extension.
    // A fragment preserves the source basename for parser selection without
    // changing the HTTP request sent to the content route.
    url.hash = normalizeUrdfAssetPath(filename).split("/").at(-1) ?? "mesh";
    return `<mesh filename="${url.toString()}"${rest}>`;
  });
}
