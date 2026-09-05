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
  const byPath = new Map<string, string[]>();
  const add = (path: string, url: string) => {
    const key = normalizeUrdfAssetPath(path).toLowerCase();
    const urls = byPath.get(key) ?? [];
    if (!urls.includes(url)) byPath.set(key, [...urls, url]);
  };
  for (const file of files) {
    if (file.relativePath) add(file.relativePath, file.contentUrl);
    if (file.originalName) add(file.originalName, file.contentUrl);
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
    if (resolved?.length === 1) return resolved[0];

    const suffixMatches = [...byPath.entries()].filter(([path]) => path.endsWith(`/${normalized}`)).flatMap(([, urls]) => urls);
    const uniqueSuffixMatches = [...new Set(suffixMatches)];
    if (uniqueSuffixMatches.length === 1) return uniqueSuffixMatches[0];

    const basename = normalized.split("/").at(-1);
    if (basename) {
      const byName = byPath.get(basename);
      if (byName?.length === 1) return byName[0];
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
  return analyzeManagedUrdfMeshUrls(urdf, urdfPath, files, baseUrl).rewritten;
}

export function analyzeManagedUrdfMeshUrls(
  urdf: string,
  urdfPath: string | null,
  files: UrdfManagedFile[],
  baseUrl: string,
): { rewritten: string; meshCount: number; resolvedCount: number; unresolved: string[] } {
  let meshCount = 0;
  let resolvedCount = 0;
  const unresolved: string[] = [];
  const rewritten = urdf.replace(/<mesh\b([^>]*?)\bfilename\s*=\s*(["'])([^"']+)\2([^>]*)>/giu, (match, before, _quote, filename, after) => {
    meshCount += 1;
    const resolved = resolveManagedUrdfMeshUrl(filename, urdfPath, files);
    if (!resolved) {
      unresolved.push(filename);
      return match;
    }
    resolvedCount += 1;
    const url = new URL(resolved, baseUrl);
    // URDFLoader selects its mesh parser from the URL suffix. Managed content
    // routes identify files by query parameter and therefore have no extension.
    // A fragment preserves the source basename for parser selection without
    // changing the HTTP request sent to the content route.
    url.hash = normalizeUrdfAssetPath(filename).split("/").at(-1) ?? "mesh";
    return `<mesh${before}filename="${url.toString()}"${after}>`;
  });
  return { rewritten, meshCount, resolvedCount, unresolved: [...new Set(unresolved)] };
}

export function resolveCompleteManagedUrdf(
  urdf: string,
  urdfPath: string | null,
  files: UrdfManagedFile[],
  baseUrl: string,
): string {
  const analysis = analyzeManagedUrdfMeshUrls(urdf, urdfPath, files, baseUrl);
  if (analysis.unresolved.length > 0) {
    throw new Error(`${analysis.unresolved.length} of ${analysis.meshCount} URDF mesh dependencies are unavailable. This manifest cannot produce a verified complete preview.`);
  }
  return analysis.rewritten;
}
