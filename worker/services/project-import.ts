import { unzipSync } from "fflate";
import { parse as parseYaml } from "yaml";
import { buildBomLine, withCompleteness } from "../../src/lib/rpps/bom";
import { normalizeBomHeader, parseCsvObjects, parseXlsxObjects } from "../../src/lib/bom-format-parser";
import { RppsPackage } from "../../src/lib/rpps/schema";
import { extractProcedureCandidates } from "../../src/lib/project-procedures";
import {
  PortableRppsManifest,
  convertLegacyRpps,
  parsePortableRpps,
  stringifyPortableRpps,
  validatePortableRpps,
  type RppsValidationReport,
} from "../../src/lib/rpps/portable";
import type { Env } from "../env";
import { AppError } from "../http";

export type ProjectImportKind = "github" | "rpps" | "bom" | "urdf" | "archive" | "files";
export { parseCsvObjects, parseMarkdownBomObjects, parseXlsxObjects } from "../../src/lib/bom-format-parser";
export type ImportedArtifact = {
  path: string;
  kind: "documentation" | "cad" | "manufacturing" | "urdf" | "mjcf" | "sdf" | "firmware" | "configuration" | "calibration" | "test" | "bom" | "image" | "video" | "other";
  sizeBytes: number | null;
  sha256?: string;
  sourceUrl?: string;
  sourceRevision?: string;
};
export type ExtractedProjectIntelligence = {
  parts: {
    sourcePaths: string[];
    candidates: Array<{ id: string; name: string; quantity: number; unit: string; manufacturer?: string; mpn?: string; fabricated: boolean; optional: boolean; sourcePath: string; confidence: number; extractionMethod: "explicit-bom" | "rpps-manifest" }>;
    modelCandidates: Array<{ name: string; linkName: string; meshPath: string; classification: "fabricated-or-assembly"; purchasablePartInferred: false; sourcePath: string; confidence: number }>;
  };
  model: null | { sourcePath: string; robotName?: string; linkCount: number; jointCount: number; movableJointCount: number; jointTypes: Record<string, number>; joints: Array<{ name: string; type: string; parent?: string; child?: string; axis?: string; lower?: number; upper?: number; effort?: number; velocity?: number }>; meshPaths: string[]; materialNames: string[]; transmissionCount: number };
  software: { packages: Array<{ ecosystem: "ros" | "npm" | "python" | "cargo" | "platformio"; name: string; version?: string; dependencies: string[]; sourcePath: string }> };
  configuration: { parameters: Array<{ sourcePath: string; keyPath: string; valueType: "string" | "number" | "boolean" | "null" }> };
  repository: { readmes: string[]; licenses: string[]; contributionGuides: string[]; changelogs: string[]; ciDefinitions: string[]; testArtifacts: string[]; firmwareArtifacts: string[]; configurationArtifacts: string[]; nativeCadArtifacts: string[]; manufacturingArtifacts: string[] };
  procedureCandidates: Array<{ id: string; kind: "assembly" | "configuration" | "calibration" | "test" | "operation" | "maintenance"; title: string; steps: string[]; sourcePath: string; confidence: number; heuristic: true }>;
  previews: { imagePath?: string; modelPath?: string; modelKind?: "urdf" | "gltf" | "glb" | "stl" | "obj" | "step" };
};
export type ProjectImportAnalysis = {
  schemaVersion: "project-import-analysis/3";
  sourceType: ProjectImportKind;
  sourceLabel: string;
  analyzedAt: string;
  draft: {
    name: string;
    slug: string;
    summary: string;
    description: string;
    repo_url?: string;
    license?: string;
    tags: string[];
  };
  inventory: {
    totalFiles: number;
    relevantFiles: number;
    truncated: boolean;
    detected: string[];
    artifacts: ImportedArtifact[];
  };
  retrieval: {
    mode: "reference" | "uploaded" | "inline";
    provider: "github" | "r2" | "request";
    requestCount: number;
    attemptedFiles: number;
    fetchedFiles: number;
    failedFiles: number;
    fetchedBytes: number;
    inventoryOnlyFiles: number;
    mirroredFiles: number;
    limits: { maxFetchedFiles: number; maxFetchedBytes: number; maxFileBytes: number };
  };
  sourceMappings: Array<{ objectType: string; objectStableId: string; sourceUrl?: string; sourcePath: string; sourceRevision?: string; parserId: string; confidence: number }>;
  extracted: ExtractedProjectIntelligence;
  manifest: PortableRppsManifest;
  manifestYaml: string;
  report: RppsValidationReport;
  importWarnings: string[];
  deterministic: true;
  aiUsed: false;
};

export type InputFile = { path: string; sizeBytes: number; bytes?: Uint8Array; sha256?: string; sourceUrl?: string; sourceRevision?: string };
type GithubTreeEntry = { path?: string; type?: string; size?: number; sha?: string; url?: string };

export async function analyzeProjectInput(env: Env, input: {
  sourceType: Exclude<ProjectImportKind, "archive">;
  repositoryUrl?: string;
  fileName?: string;
  content?: string;
}): Promise<ProjectImportAnalysis> {
  if (input.sourceType === "github") {
    if (!input.repositoryUrl) throw new AppError(422, "REPOSITORY_URL_REQUIRED", "A GitHub repository URL is required.");
    return analyzeGithub(env, input.repositoryUrl);
  }
  const content = input.content ?? "";
  const bytes = new TextEncoder().encode(content);
  if (!content.trim()) throw new AppError(422, "IMPORT_CONTENT_REQUIRED", "The uploaded project file is empty.");
  if (bytes.byteLength > 1_048_576) throw new AppError(413, "IMPORT_CONTENT_TOO_LARGE", "Direct import files are limited to 1 MiB.");
  const fileName = safeRelativePath(input.fileName || defaultFileName(input.sourceType));
  return analyzeFileSet(input.sourceType, fileName, [{ path: fileName, sizeBytes: bytes.byteLength, bytes }], {
    sourceLabel: fileName,
    retrieval: { mode: "inline", provider: "request", requestCount: 0, mirroredFiles: 0 },
  });
}

export async function analyzeProjectArchive(env: Env, fileId: string, userId: string): Promise<ProjectImportAnalysis> {
  const file = await env.DB.prepare(`SELECT id, object_key, original_name, size_bytes, owner_user_id, organization_id, status
    FROM files WHERE id = ?1 AND deleted_at IS NULL`).bind(fileId).first<{
      id: string; object_key: string; original_name: string; size_bytes: number; owner_user_id: string | null; organization_id: string | null; status: string;
    }>();
  if (!file || file.status !== "ready") throw new AppError(404, "ARCHIVE_NOT_FOUND", "A ready project archive was not found.");
  const organizationAccess = file.organization_id
    ? await env.DB.prepare("SELECT 1 AS allowed FROM organization_members WHERE organization_id = ?1 AND user_id = ?2 AND status = 'active'").bind(file.organization_id, userId).first()
    : null;
  if (file.owner_user_id !== userId && !organizationAccess) throw new AppError(403, "ARCHIVE_ACCESS_DENIED", "You cannot analyze this archive.");
  if (file.size_bytes > 10 * 1024 * 1024) throw new AppError(413, "ARCHIVE_TOO_LARGE", "Project archives are limited to 10 MiB compressed.");
  const object = await env.FILES.get(file.object_key);
  if (!object) throw new AppError(404, "ARCHIVE_OBJECT_NOT_FOUND", "The archive object is missing from R2.");
  const compressed = new Uint8Array(await object.arrayBuffer());
  const inventory: InputFile[] = [];
  let fileCount = 0;
  let uncompressedBytes = 0;
  let extractedBytes = 0;
  let extracted: Record<string, Uint8Array>;
  try {
    extracted = unzipSync(compressed, {
      filter: (entry) => {
        if (entry.name.endsWith("/")) return false;
        fileCount += 1;
        if (fileCount > 500) throw new Error("Archive contains more than 500 files.");
        const path = safeRelativePath(entry.name);
        uncompressedBytes += entry.originalSize;
        if (uncompressedBytes > 25 * 1024 * 1024) throw new Error("Archive expands beyond 25 MiB.");
        inventory.push({ path, sizeBytes: entry.originalSize });
        const extract = isRelevantText(path) && entry.originalSize <= 1_048_576 && extractedBytes + entry.originalSize <= 5 * 1024 * 1024;
        if (extract) extractedBytes += entry.originalSize;
        return extract;
      },
    });
  } catch (error) {
    throw new AppError(422, "ARCHIVE_INVALID", error instanceof Error ? error.message : "The ZIP archive could not be read.");
  }
  for (const fileEntry of inventory) fileEntry.bytes = extracted[fileEntry.path];
  return analyzeFileSet("archive", file.original_name, inventory, {
    sourceLabel: file.original_name,
    retrieval: { mode: "uploaded", provider: "r2", requestCount: 1, mirroredFiles: 1 },
  });
}

export async function analyzeStoredProjectFiles(env: Env, fileIds: string[], userId: string): Promise<ProjectImportAnalysis> {
  const uniqueIds = Array.from(new Set(fileIds));
  if (uniqueIds.length === 0 || uniqueIds.length > 100) throw new AppError(422, "PROJECT_FILES_INVALID", "Select between 1 and 100 project files.");
  const rows = await env.DB.prepare(`SELECT id, object_key, original_name, media_type, size_bytes, checksum_sha256,
      owner_user_id, organization_id, status
    FROM files WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?1))`)
    .bind(JSON.stringify(uniqueIds)).all<{
      id: string; object_key: string; original_name: string; media_type: string; size_bytes: number; checksum_sha256: string | null;
      owner_user_id: string | null; organization_id: string | null; status: string;
    }>();
  if (rows.results.length !== uniqueIds.length || rows.results.some((file) => file.status !== "ready")) {
    throw new AppError(404, "PROJECT_FILES_NOT_FOUND", "Every selected project file must exist and be ready.");
  }
  const organizationIds = Array.from(new Set(rows.results.map((file) => file.organization_id).filter((value): value is string => Boolean(value))));
  const allowedOrganizations = organizationIds.length === 0 ? new Set<string>() : new Set((await env.DB.prepare(`SELECT organization_id
    FROM organization_members WHERE user_id = ?1 AND status = 'active'
      AND organization_id IN (SELECT value FROM json_each(?2))`).bind(userId, JSON.stringify(organizationIds)).all<{ organization_id: string }>()).results.map((row) => row.organization_id));
  if (rows.results.some((file) => file.owner_user_id !== userId && (!file.organization_id || !allowedOrganizations.has(file.organization_id)))) {
    throw new AppError(403, "PROJECT_FILES_ACCESS_DENIED", "You cannot analyze one or more selected project files.");
  }
  if (rows.results.reduce((sum, file) => sum + file.size_bytes, 0) > 100 * 1024 * 1024) {
    throw new AppError(413, "PROJECT_FILES_TOO_LARGE", "Selected project files are limited to 100 MiB total.");
  }
  const names = new Map<string, number>();
  let extractedBytes = 0;
  const inputFiles: InputFile[] = [];
  for (const file of rows.results) {
    const safeName = safeRelativePath(file.original_name);
    const duplicateNumber = names.get(safeName) ?? 0;
    names.set(safeName, duplicateNumber + 1);
    const path = duplicateNumber === 0 ? safeName : `${duplicateNumber + 1}-${safeName}`;
    const input: InputFile = { path, sizeBytes: file.size_bytes, sha256: file.checksum_sha256 ?? undefined };
    if (isRelevantText(path) && file.size_bytes <= 1_048_576 && extractedBytes + file.size_bytes <= 5 * 1024 * 1024) {
      const object = await env.FILES.get(file.object_key);
      if (!object) throw new AppError(404, "PROJECT_FILE_OBJECT_NOT_FOUND", `The stored object for ${file.original_name} is missing.`);
      input.bytes = new Uint8Array(await object.arrayBuffer());
      extractedBytes += input.bytes.byteLength;
    }
    inputFiles.push(input);
  }
  return analyzeFileSet("files", `${uniqueIds.length} uploaded project file${uniqueIds.length === 1 ? "" : "s"}`, inputFiles, {
    sourceLabel: `${uniqueIds.length} uploaded project file${uniqueIds.length === 1 ? "" : "s"}`,
    retrieval: { mode: "uploaded", provider: "r2", requestCount: uniqueIds.length, mirroredFiles: uniqueIds.length },
  });
}

async function analyzeGithub(env: Env, repositoryUrl: string): Promise<ProjectImportAnalysis> {
  const parsed = parseGithubUrl(repositoryUrl);
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "RoboPartPicker-Worker",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  if (env.GITHUB_TOKEN) headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
  const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}`;
  const metadata = await githubJson(`${base}`, headers) as Record<string, unknown>;
  const branch = typeof metadata.default_branch === "string" ? metadata.default_branch : "HEAD";
  const tree = await githubJson(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, headers) as {
    sha?: string; truncated?: boolean; tree?: GithubTreeEntry[];
  };
  const revision = tree.sha ?? branch;
  const allFiles = (tree.tree ?? []).filter((entry) => entry.type === "blob" && typeof entry.path === "string").slice(0, 10_000);
  const relevant = allFiles.filter((entry) => artifactKind(entry.path!) !== "other" || isProjectMetadata(entry.path!)).slice(0, 500);
  const inputFiles: InputFile[] = relevant.map((entry) => ({
    path: safeRelativePath(entry.path!),
    sizeBytes: typeof entry.size === "number" ? entry.size : 0,
    sourceUrl: `https://github.com/${parsed.owner}/${parsed.repository}/blob/${encodeURIComponent(revision)}/${entry.path!.split("/").map(encodeURIComponent).join("/")}`,
    sourceRevision: revision,
  }));
  let fetchedBytes = 0;
  let fetchedCount = 0;
  let attemptedCount = 0;
  for (const entry of selectGithubFetchCandidates(relevant)) {
    const target = inputFiles.find((file) => file.path === entry.path);
    if (!target || !entry.sha || !isRelevantText(entry.path!) || target.sizeBytes > 256 * 1024 || attemptedCount >= 24 || fetchedBytes + target.sizeBytes > 2 * 1024 * 1024) continue;
    const rawHeaders = new Headers(headers);
    rawHeaders.set("Accept", "application/vnd.github.raw+json");
    attemptedCount += 1;
    let response: Response;
    try {
      response = await fetch(`${base}/git/blobs/${encodeURIComponent(entry.sha)}`, { headers: rawHeaders, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 256 * 1024) continue;
    target.bytes = bytes;
    target.sizeBytes = bytes.byteLength;
    fetchedBytes += bytes.byteLength;
    fetchedCount += 1;
  }
  const license = isRecord(metadata.license) && typeof metadata.license.spdx_id === "string" && metadata.license.spdx_id !== "NOASSERTION"
    ? metadata.license.spdx_id : undefined;
  const description = typeof metadata.description === "string" ? metadata.description : "";
  const topics = Array.isArray(metadata.topics) ? metadata.topics.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  const sourceLabel = `${parsed.owner}/${parsed.repository}`;
  return analyzeFileSet("github", sourceLabel, inputFiles, {
    sourceLabel,
    repositoryUrl: typeof metadata.html_url === "string" ? metadata.html_url : repositoryUrl,
    revision,
    name: typeof metadata.name === "string" ? metadata.name : parsed.repository,
    description,
    owner: parsed.owner,
    license,
    topics,
    totalFiles: allFiles.length,
    truncated: Boolean(tree.truncated || (tree.tree?.length ?? 0) > 10_000),
    retrieval: { mode: "reference", provider: "github", requestCount: 2 + attemptedCount, attemptedFiles: attemptedCount, mirroredFiles: 0 },
  });
}

export async function analyzeFileSet(sourceType: ProjectImportKind, label: string, files: InputFile[], context: {
  sourceLabel: string; repositoryUrl?: string; revision?: string; name?: string; description?: string; owner?: string;
  license?: string; topics?: string[]; totalFiles?: number; truncated?: boolean;
  retrieval?: { mode: "reference" | "uploaded" | "inline"; provider: "github" | "r2" | "request"; requestCount: number; attemptedFiles?: number; mirroredFiles: number };
}): Promise<ProjectImportAnalysis> {
  const relevant = files.filter((file) => artifactKind(file.path) !== "other" || isProjectMetadata(file.path));
  const detected = Array.from(new Set(relevant.map((file) => detectedType(file.path)).filter(Boolean) as string[])).sort();
  const textFiles = new Map(relevant.filter((file) => file.bytes).map((file) => [file.path, decodeText(file.bytes!)]));
  const byteFiles = new Map(relevant.filter((file) => file.bytes).map((file) => [file.path, file.bytes!]));
  const fetchedFiles = relevant.filter((file) => file.bytes).length;
  const fetchedBytes = relevant.reduce((total, file) => total + (file.bytes?.byteLength ?? 0), 0);
  const warnings: string[] = [];
  const portableEntry = [...textFiles].find(([path]) => /(^|\/)rpps\.(ya?ml|json)$/iu.test(path));
  let manifest: PortableRppsManifest | undefined;
  if (portableEntry) {
    const parsed = parsePortableRpps(portableEntry[1]);
    if (parsed.ok) manifest = parsed.data;
    else warnings.push(`RPPS manifest was found but did not validate: ${parsed.errors.slice(0, 5).join("; ")}`);
  }
  if (!manifest && sourceType === "rpps") {
    const onlyText = [...textFiles.values()][0] ?? "";
    const legacyRaw = tryParseData(onlyText);
    const legacy = RppsPackage.safeParse(legacyRaw);
    if (legacy.success) manifest = convertLegacyRpps(legacy.data);
  }
  if (manifest) {
    // Every compiled line carries an extraction method, completeness bucket,
    // confidence and evidence locator; unresolved lines are retained.
    manifest = { ...manifest, components: manifest.components.map((component) => withCompleteness(component, portableEntry?.[0])) };
  }

  const name = context.name || manifest?.project.name || cleanProjectName(label);
  const slug = manifest?.project.slug || slugify(name);
  const artifacts = await Promise.all(relevant.slice(0, 500).map(async (file, index): Promise<ImportedArtifact & { id: string }> => ({
    id: `artifact:${slug}:${index + 1}`,
    path: file.path,
    kind: artifactKind(file.path),
    sizeBytes: Number.isFinite(file.sizeBytes) ? file.sizeBytes : null,
    sha256: file.sha256 ?? (file.bytes ? await sha256Bytes(file.bytes) : undefined),
    sourceUrl: file.sourceUrl,
    sourceRevision: file.sourceRevision,
  })));
  const componentExtraction = manifest
    ? { components: manifest.components, sourcePath: portableEntry?.[0], extractionMethod: "rpps-manifest" as const }
    : extractComponents(textFiles, warnings, slug, byteFiles);
  const components = manifest ? [] : componentExtraction.components;
  const model = extractModelSummary(textFiles);
  const software = extractSoftwarePackages(textFiles);
  const modelCandidates = extractModelPartCandidates(textFiles);
  const configuration = { parameters: extractConfigurationParameters(textFiles) };
  const repository = extractRepositorySignals(relevant);
  const procedureCandidates = extractProcedureCandidates(textFiles, slug);
  const previews = selectPreviewArtifacts(artifacts);
  if (!manifest) {
    manifest = PortableRppsManifest.parse({
      rpps: "0.1",
      project: {
        id: `project:${slug}`,
        name,
        slug,
        summary: (context.description || firstReadmeLine(textFiles) || `Imported from ${context.sourceLabel}`).slice(0, 500),
        description: readmeText(textFiles).slice(0, 40_000) || undefined,
      },
      release: { id: `release:${slug}:0.1.0`, version: "0.1.0" },
      authors: context.owner ? [{ id: `author:github:${slugify(context.owner)}`, name: context.owner }] : [],
      licenses: { software: context.license, documentation: context.license },
      artifacts: artifacts.map(({ sizeBytes: _sizeBytes, sourceUrl, sourceRevision, ...artifact }) => ({
        ...artifact,
        source: sourceUrl ? { url: sourceUrl, revision: sourceRevision } : undefined,
      })),
      components: [...components, ...deriveFabricatedComponents(modelCandidates, slug)],
      interfaces: extractUrdfInterfaces(textFiles, slug),
      procedures: procedureCandidates.map((candidate) => ({
        id: candidate.id,
        kind: candidate.kind,
        title: candidate.title,
        artifactRefs: [],
        steps: candidate.steps.map((instruction, index) => ({ id: `${candidate.id}:step:${index + 1}`, instruction })),
      })),
      standards: undefined,
      contribution: context.repositoryUrl ? { url: `${context.repositoryUrl.replace(/\/$/u, "")}/blob/${encodeURIComponent(context.revision ?? "HEAD")}/CONTRIBUTING.md`, acceptsStructuredProposals: false } : undefined,
      extensions: { "org.robopartpicker.import": { sourceType, sourceLabel: context.sourceLabel, deterministic: true } },
    });
  }
  const report = validatePortableRpps(manifest);
  if (!portableEntry) warnings.push("No portable rpps.yaml manifest was found; a reviewable draft was generated without AI inference.");
  if (context.truncated) warnings.push("The repository tree was truncated by the provider; the inventory may be incomplete.");
  if ((context.retrieval?.attemptedFiles ?? fetchedFiles) > fetchedFiles) warnings.push("Some selected repository files could not be fetched; inventory and source references are preserved, but extracted details may be incomplete.");
  if (!detected.includes("bom")) warnings.push("No recognizable BOM file was found.");
  if (!detected.some((item) => ["cad", "manufacturing"].includes(item))) warnings.push("No native CAD or manufacturing artifact was detected.");
  const summary = manifest.project.summary ?? context.description ?? "";
  const draft = {
    name: manifest.project.name,
    slug: manifest.project.slug ?? slug,
    summary: summary.slice(0, 280),
    description: manifest.project.description ?? readmeText(textFiles).slice(0, 8_000) ?? summary,
    repo_url: context.repositoryUrl,
    license: manifest.licenses.hardware ?? manifest.licenses.software ?? manifest.licenses.documentation,
    tags: Array.from(new Set([...(context.topics ?? []), ...detected])).slice(0, 20),
  };
  const partCandidates = componentExtraction.components.map((component) => ({
    ...component,
    sourcePath: componentExtraction.sourcePath ?? portableEntry?.[0] ?? "unknown",
    confidence: component.confidence ?? 1,
    extractionMethod: componentExtraction.extractionMethod,
  }));
  const extracted: ExtractedProjectIntelligence = {
    parts: { sourcePaths: Array.from(new Set(partCandidates.map((part) => part.sourcePath))), candidates: partCandidates, modelCandidates },
    model,
    software: { packages: software },
    configuration,
    repository,
    procedureCandidates,
    previews,
  };
  const sourceMappings: ProjectImportAnalysis["sourceMappings"] = [
    ...artifacts.map((artifact) => ({
      objectType: "artifact",
      objectStableId: artifact.id,
      sourceUrl: artifact.sourceUrl,
      sourcePath: artifact.path,
      sourceRevision: artifact.sourceRevision,
      parserId: parserFor(artifact.path),
      confidence: artifact.sha256 ? 1 : 0.8,
    })),
    ...partCandidates.map((part) => ({ objectType: "component-candidate", objectStableId: part.id, sourcePath: part.sourcePath, parserId: part.extractionMethod, confidence: part.confidence })),
    ...procedureCandidates.map((procedure) => ({ objectType: "procedure-candidate", objectStableId: procedure.id, sourcePath: procedure.sourcePath, parserId: "markdown-procedure-heuristic-v1", confidence: procedure.confidence })),
  ];
  return {
    schemaVersion: "project-import-analysis/3",
    sourceType,
    sourceLabel: context.sourceLabel,
    analyzedAt: new Date().toISOString(),
    draft,
    inventory: {
      totalFiles: context.totalFiles ?? files.length,
      relevantFiles: relevant.length,
      truncated: Boolean(context.truncated || relevant.length > 500),
      detected,
      artifacts: artifacts.map(({ id: _id, ...artifact }) => artifact),
    },
    retrieval: {
      mode: context.retrieval?.mode ?? "inline",
      provider: context.retrieval?.provider ?? "request",
      requestCount: context.retrieval?.requestCount ?? 0,
      attemptedFiles: context.retrieval?.attemptedFiles ?? fetchedFiles,
      fetchedFiles,
      failedFiles: Math.max(0, (context.retrieval?.attemptedFiles ?? fetchedFiles) - fetchedFiles),
      fetchedBytes,
      inventoryOnlyFiles: Math.max(0, relevant.length - fetchedFiles),
      mirroredFiles: context.retrieval?.mirroredFiles ?? 0,
      limits: {
        maxFetchedFiles: sourceType === "github" ? 24 : relevant.length,
        maxFetchedBytes: sourceType === "github" ? 2 * 1024 * 1024 : 5 * 1024 * 1024,
        maxFileBytes: sourceType === "github" ? 256 * 1024 : 1024 * 1024,
      },
    },
    sourceMappings,
    extracted,
    manifest,
    manifestYaml: stringifyPortableRpps(manifest),
    report,
    importWarnings: Array.from(new Set(warnings)),
    deterministic: true,
    aiUsed: false,
  };
}

export function selectGithubFetchCandidates(entries: GithubTreeEntry[]): GithubTreeEntry[] {
  return entries
    .filter((entry) => typeof entry.path === "string" && isRelevantText(entry.path))
    .sort((left, right) => {
      const priorityDifference = githubFetchPriority(left.path!) - githubFetchPriority(right.path!);
      if (priorityDifference !== 0) return priorityDifference;
      const sizeDifference = (left.size ?? Number.MAX_SAFE_INTEGER) - (right.size ?? Number.MAX_SAFE_INTEGER);
      return sizeDifference !== 0 ? sizeDifference : left.path!.localeCompare(right.path!);
    });
}

function githubFetchPriority(path: string): number {
  const lower = path.toLowerCase();
  if (/(^|\/)rpps\.(ya?ml|json)$/u.test(lower)) return 0;
  if (isBomArtifactPath(lower, ["csv", "json", "yaml", "yml"])) return 1;
  if (/\.(urdf|xacro|mjcf|sdf)$/u.test(lower)) return 2;
  if (/(^|\/)(package\.xml|package\.json|pyproject\.toml|requirements[^/]*\.txt|cargo\.toml|platformio\.ini)$/u.test(lower)) return 3;
  if (/(^|\/)(readme|license|copying|contributing|changelog)(\.|$)/u.test(lower)) return 4;
  if (/(^|\/)(assembly|build|calibration|testing?|operation|maintenance)([^/]*)\.(md|txt|ya?ml)$/u.test(lower)) return 5;
  if (/\.(md|txt)$/u.test(lower)) return 6;
  if (/\.(csv|ya?ml|json|toml|ini|cfg|conf)$/u.test(lower)) return 7;
  return 8;
}

function extractComponents(files: Map<string, string>, warnings: string[], slug: string, byteFiles?: Map<string, Uint8Array>): {
  components: PortableRppsManifest["components"];
  sourcePath?: string;
  extractionMethod: "explicit-bom";
} {
  const candidate = [...files].find(([path]) => isBomArtifactPath(path));
  if (!candidate) return { components: [], extractionMethod: "explicit-bom" };
  let rows: unknown[] = [];
  try {
    if (/\.csv$/iu.test(candidate[0])) {
      const firstLine = candidate[1].slice(0, 8_000).split("\n", 1)[0] ?? "";
      const tabs = (firstLine.match(/\t/gu) ?? []).length;
      const commas = (firstLine.match(/,/gu) ?? []).length;
      rows = parseCsvObjects(candidate[1], tabs > commas ? "\t" : ",");
    }
    else if (/\.xlsx$/iu.test(candidate[0])) {
      const raw = byteFiles?.get(candidate[0]);
      if (!raw) {
        warnings.push(`BOM file ${candidate[0]} was not available in binary form; only text formats were fetched.`);
        return { components: [], sourcePath: candidate[0], extractionMethod: "explicit-bom" };
      }
      try {
        rows = parseXlsxObjects(raw);
      } catch (error) {
        warnings.push(`BOM parser could not read ${candidate[0]}: ${error instanceof Error ? error.message : "invalid xlsx"}`);
        return { components: [], sourcePath: candidate[0], extractionMethod: "explicit-bom" };
      }
    }
    else {
      const parsed = tryParseData(candidate[1]);
      rows = Array.isArray(parsed) ? parsed : isRecord(parsed)
        ? firstArray(parsed, ["bom", "components", "items", "parts"]) : [];
    }
  } catch (error) {
    warnings.push(`BOM parser could not read ${candidate[0]}: ${error instanceof Error ? error.message : "invalid data"}`);
    return { components: [], sourcePath: candidate[0], extractionMethod: "explicit-bom" };
  }
  const components: PortableRppsManifest["components"] = [];
  for (const [index, raw] of rows.slice(0, 10_000).entries()) {
    if (!isRecord(raw)) continue;
    const normalized = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeBomHeader(key), value]));
    const name = firstString(normalized, ["name", "part", "partname", "partnumber", "component", "componentname", "description", "item", "value", "comment", "type", "pcb", "名称", "规格"]);
    if (!name) continue;
    const quantity = firstValue(normalized, ["quantity", "qty", "count", "qtyperassembly", "qtyperboard", "qtyfor1platform", "数量", "用量"])
      ?? firstValue(normalized, Object.keys(normalized).filter((key) => /^qty|^quantity/iu.test(key)));
    const manufacturer = cleanBomValue(firstString(normalized, ["manufacturer", "maker", "mfr", "制造商", "厂商", "品牌"]));
    const mpn = cleanBomValue(firstString(normalized, ["manufacturerpartnumber", "manufacturerpart", "mpn", "partnumber", "sku", "制造商料号", "制造商型号", "型号", "料号", "物料编号", "物料编码"]));
    const ref = firstString(normalized, ["reference", "ref", "designator", "id", "序号", "编号", "位号"]);
    const line = buildBomLine({
      name,
      quantity,
      unit: firstString(normalized, ["unit", "uom", "单位"]),
      manufacturer,
      mpn,
      fabricated: /^(true|yes|fabricated|make)$/iu.test(String(firstValue(normalized, ["fabricated", "makeorbuy"]) ?? "")),
      optional: /^(true|yes|optional)$/iu.test(String(firstValue(normalized, ["optional"]) ?? "")),
      sourcePath: candidate[0],
      rowIndex: index,
      extractionMethod: "explicit-bom",
    });
    components.push({
      ...line,
      id: `component:${slug}:${slugify(ref || name || String(index + 1)).slice(0, 80) || index + 1}`,
      artifactRefs: [],
    });
  }
  if (rows.length && !components.length) warnings.push(`BOM file ${candidate[0]} did not expose recognizable name or quantity columns.`);
  return { components, sourcePath: candidate[0], extractionMethod: "explicit-bom" };
}

function extractUrdfInterfaces(files: Map<string, string>, slug: string): PortableRppsManifest["interfaces"] {
  const candidate = [...files].find(([path]) => /\.urdf(?:\.xacro)?$/iu.test(path));
  if (!candidate) return [];
  const names = [...candidate[1].matchAll(/<link\s+[^>]*name=["']([^"']+)["']/giu)].map((match) => match[1]).slice(0, 100);
  return names.map((name, index) => ({
    id: `interface:${slug}:frame:${slugify(name).slice(0, 80) || index + 1}`,
    name: `${name} coordinate frame`,
    kind: "coordinate-frame" as const,
    description: `Coordinate frame declared by ${candidate[0]}. Conformance to ROS REP-103 has not been inferred.`,
    specifications: { sourceLink: name },
    evidenceRefs: [],
  }));
}

function extractModelSummary(files: Map<string, string>): ExtractedProjectIntelligence["model"] {
  const candidate = [...files].find(([path]) => /\.urdf(?:\.xacro)?$/iu.test(path));
  if (!candidate) return null;
  const [sourcePath, text] = candidate;
  const robotName = text.match(/<robot\s+[^>]*name=["']([^"']+)["']/iu)?.[1];
  const links = [...text.matchAll(/<link\s+[^>]*name=["']([^"']+)["']/giu)].map((match) => match[1]);
  const joints = [...text.matchAll(/<joint\b([^>]*)>([\s\S]*?)<\/joint>/giu)].map((match) => {
    const name = xmlAttribute(match[1], "name") ?? "unnamed-joint";
    const type = (xmlAttribute(match[1], "type") ?? "unknown").toLowerCase();
    const parentTag = match[2].match(/<parent\b([^>]*)\/?\s*>/iu)?.[1] ?? "";
    const childTag = match[2].match(/<child\b([^>]*)\/?\s*>/iu)?.[1] ?? "";
    const axisTag = match[2].match(/<axis\b([^>]*)\/?\s*>/iu)?.[1] ?? "";
    const limitTag = match[2].match(/<limit\b([^>]*)\/?\s*>/iu)?.[1] ?? "";
    return { name, type, parent: xmlAttribute(parentTag, "link"), child: xmlAttribute(childTag, "link"), axis: xmlAttribute(axisTag, "xyz"),
      lower: finiteNumber(xmlAttribute(limitTag, "lower")), upper: finiteNumber(xmlAttribute(limitTag, "upper")),
      effort: finiteNumber(xmlAttribute(limitTag, "effort")), velocity: finiteNumber(xmlAttribute(limitTag, "velocity")) };
  });
  const jointTypes = joints.reduce<Record<string, number>>((counts, joint) => {
    counts[joint.type] = (counts[joint.type] ?? 0) + 1;
    return counts;
  }, {});
  return {
    sourcePath,
    robotName,
    linkCount: links.length,
    jointCount: joints.length,
    movableJointCount: joints.filter((joint) => joint.type !== "fixed").length,
    jointTypes,
    joints: joints.slice(0, 2_000),
    meshPaths: Array.from(new Set([...text.matchAll(/<mesh\s+[^>]*filename=["']([^"']+)["']/giu)].map((match) => match[1]))).slice(0, 2_000),
    materialNames: Array.from(new Set([...text.matchAll(/<material\s+[^>]*name=["']([^"']+)["']/giu)].map((match) => match[1]))).slice(0, 500),
    transmissionCount: [...text.matchAll(/<transmission\b/giu)].length,
  };
}

function extractModelPartCandidates(files: Map<string, string>): ExtractedProjectIntelligence["parts"]["modelCandidates"] {
  const candidate = [...files].find(([path]) => /\.urdf(?:\.xacro)?$/iu.test(path));
  if (!candidate) return [];
  const [sourcePath, text] = candidate;
  const output: ExtractedProjectIntelligence["parts"]["modelCandidates"] = [];
  for (const match of text.matchAll(/<link\s+[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/link>/giu)) {
    const linkName = match[1];
    for (const mesh of match[2].matchAll(/<mesh\s+[^>]*filename=["']([^"']+)["']/giu)) {
      output.push({ name: linkName.replace(/[_-]+/gu, " "), linkName, meshPath: mesh[1], classification: "fabricated-or-assembly", purchasablePartInferred: false, sourcePath, confidence: 0.8 });
      if (output.length >= 2_000) return output;
    }
  }
  return output;
}

function deriveFabricatedComponents(candidates: ExtractedProjectIntelligence["parts"]["modelCandidates"], slug: string): PortableRppsManifest["components"] {
  return candidates.slice(0, 500).map((candidate, index) => ({
    ...buildBomLine({
      name: candidate.name || candidate.linkName,
      quantity: 1,
      fabricated: true,
      sourcePath: candidate.sourcePath,
      extractionMethod: "cad-metadata",
    }),
    id: `component:${slug}:fabricated:${slugify(candidate.linkName || candidate.name || String(index + 1)).slice(0, 80) || index + 1}`,
    artifactRefs: [],
  }));
}

function extractSoftwarePackages(files: Map<string, string>): ExtractedProjectIntelligence["software"]["packages"] {
  const output: ExtractedProjectIntelligence["software"]["packages"] = [];
  for (const [path, text] of files) {
    const lower = path.toLowerCase();
    if (/(^|\/)package\.xml$/u.test(lower)) {
      const name = xmlValue(text, "name");
      if (!name) continue;
      const dependencies = Array.from(new Set([...text.matchAll(/<(?:depend|build_depend|exec_depend|buildtool_depend|test_depend)>\s*([^<]+?)\s*<\//giu)].map((match) => match[1].trim()))).slice(0, 500);
      output.push({ ecosystem: "ros", name, version: xmlValue(text, "version"), dependencies, sourcePath: path });
    } else if (/(^|\/)package\.json$/u.test(lower)) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!isRecord(parsed)) continue;
        const dependencies = [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies]
          .filter(isRecord).flatMap((record) => Object.keys(record)).filter((name, index, values) => values.indexOf(name) === index).slice(0, 500);
        output.push({ ecosystem: "npm", name: typeof parsed.name === "string" ? parsed.name : path, version: typeof parsed.version === "string" ? parsed.version : undefined, dependencies, sourcePath: path });
      } catch { /* Invalid package metadata remains inventoried and untrusted. */ }
    } else if (/(^|\/)requirements(?:[-_.][^/]*)?\.txt$/u.test(lower)) {
      const dependencies = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith("-")).map((line) => line.split(/[<>=!~;\s[]/u, 1)[0]).filter(Boolean).slice(0, 500);
      output.push({ ecosystem: "python", name: path, dependencies: Array.from(new Set(dependencies)), sourcePath: path });
    } else if (/(^|\/)cargo\.toml$/u.test(lower)) {
      const section = text.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/iu)?.[1] ?? "";
      const dependencies = section.split(/\r?\n/u).map((line) => line.match(/^\s*([A-Za-z0-9_-]+)\s*=/u)?.[1]).filter((name): name is string => Boolean(name)).slice(0, 500);
      const name = text.match(/\[package\][\s\S]*?\n\s*name\s*=\s*["']([^"']+)["']/iu)?.[1] ?? path;
      const version = text.match(/\[package\][\s\S]*?\n\s*version\s*=\s*["']([^"']+)["']/iu)?.[1];
      output.push({ ecosystem: "cargo", name, version, dependencies, sourcePath: path });
    } else if (/(^|\/)platformio\.ini$/u.test(lower)) {
      const dependencies = (text.match(/(?:^|\n)\s*lib_deps\s*=([\s\S]*?)(?:\n\[|$)/iu)?.[1] ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).slice(0, 500);
      output.push({ ecosystem: "platformio", name: path, dependencies, sourcePath: path });
    }
    if (output.length >= 200) break;
  }
  return output;
}

function extractConfigurationParameters(files: Map<string, string>): ExtractedProjectIntelligence["configuration"]["parameters"] {
  const output: ExtractedProjectIntelligence["configuration"]["parameters"] = [];
  for (const [path, text] of files) {
    if (!/\.(?:json|ya?ml)$/iu.test(path) || /(?:^|\/)(?:rpps(?:\.lock)?|package)\.(?:json|ya?ml)$/iu.test(path) || isBomArtifactPath(path, ["json", "yaml", "yml"])) continue;
    if (!/(?:^|\/)(?:config|configuration|calibration|params?|settings?)(?:\/|[-_.])/iu.test(path)) continue;
    try {
      const parsed = tryParseData(text);
      collectParameterTypes(parsed, path, "", output, 0);
    } catch { /* Invalid configuration remains an inventoried artifact. */ }
    if (output.length >= 500) break;
  }
  return output.slice(0, 500);
}

function collectParameterTypes(value: unknown, sourcePath: string, keyPath: string, output: ExtractedProjectIntelligence["configuration"]["parameters"], depth: number): void {
  if (output.length >= 500 || depth > 8) return;
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    if (keyPath) output.push({ sourcePath, keyPath, valueType: value === null ? "null" : typeof value as "string" | "number" | "boolean" });
    return;
  }
  if (Array.isArray(value)) {
    value.slice(0, 50).forEach((entry, index) => collectParameterTypes(entry, sourcePath, `${keyPath}[${index}]`, output, depth + 1));
    return;
  }
  if (isRecord(value)) Object.entries(value).slice(0, 200).forEach(([key, entry]) => collectParameterTypes(entry, sourcePath, keyPath ? `${keyPath}.${key}` : key, output, depth + 1));
}

function extractRepositorySignals(files: InputFile[]): ExtractedProjectIntelligence["repository"] {
  const paths = files.map((file) => file.path);
  const byKind = (kind: ImportedArtifact["kind"]) => paths.filter((path) => artifactKind(path) === kind).slice(0, 2_000);
  return {
    readmes: paths.filter((path) => /(^|\/)readme(?:\.[^/]*)?$/iu.test(path)).slice(0, 100),
    licenses: paths.filter((path) => /(^|\/)(?:license|copying|notice)(?:\.[^/]*)?$/iu.test(path)).slice(0, 100),
    contributionGuides: paths.filter((path) => /(^|\/)(?:contributing|code_of_conduct|governance)(?:\.[^/]*)?$/iu.test(path)).slice(0, 100),
    changelogs: paths.filter((path) => /(^|\/)(?:changelog|changes|releases?)(?:\.[^/]*)?$/iu.test(path)).slice(0, 100),
    ciDefinitions: paths.filter((path) => /(^|\/)(?:\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.ya?ml|Jenkinsfile)$/iu.test(path)).slice(0, 200),
    testArtifacts: byKind("test"),
    firmwareArtifacts: byKind("firmware"),
    configurationArtifacts: byKind("configuration"),
    nativeCadArtifacts: byKind("cad"),
    manufacturingArtifacts: byKind("manufacturing"),
  };
}

function selectPreviewArtifacts(artifacts: Array<ImportedArtifact & { id: string }>): ExtractedProjectIntelligence["previews"] {
  const images = artifacts.filter((artifact) => artifact.kind === "image").sort((left, right) => previewImageScore(right.path) - previewImageScore(left.path));
  const modelPriority: Record<string, number> = { urdf: 7, glb: 6, gltf: 5, stl: 4, obj: 3, step: 2, stp: 2 };
  const models = artifacts.map((artifact) => ({ artifact, extension: artifact.path.split(".").at(-1)?.toLowerCase() ?? "" }))
    .filter(({ artifact, extension }) => artifact.kind === "urdf" || extension in modelPriority)
    .sort((left, right) => (modelPriority[right.extension] ?? 0) - (modelPriority[left.extension] ?? 0));
  const model = models[0];
  const kind = model?.artifact.kind === "urdf" ? "urdf" : model?.extension as ExtractedProjectIntelligence["previews"]["modelKind"];
  return { imagePath: images[0]?.path, modelPath: model?.artifact.path, modelKind: kind };
}

function xmlValue(text: string, tag: string): string | undefined { return text.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+?)\\s*</${tag}>`, "iu"))?.[1]?.trim(); }
function xmlAttribute(attributes: string, name: string): string | undefined { return attributes.match(new RegExp(`(?:^|\\s)${name}=["']([^"']+)["']`, "iu"))?.[1]?.trim(); }
function finiteNumber(value: string | undefined): number | undefined { const parsed = Number(value); return value !== undefined && Number.isFinite(parsed) ? parsed : undefined; }
function previewImageScore(path: string): number { const lower = path.toLowerCase(); return /(?:^|\/)(?:cover|hero|render|preview|overview|robot)[-_.]/u.test(lower) ? 10 : /cover|hero|render|preview/u.test(lower) ? 5 : 0; }

const BOM_FILENAME_RE = /^(?:bom|parts(?:[-_ ]list)?|bill[-_ ]of[-_ ]materials)$/iu;

function isBomArtifactPath(path: string, extensions: string[] = ["csv", "json", "yaml", "yml", "xlsx"]): boolean {
  const fileName = path.replace(/\\/gu, "/").split("/").pop() ?? "";
  const match = fileName.match(/^(.+)\.([^.]+)$/u);
  if (!match) return false;
  return extensions.includes(match[2].toLowerCase()) && BOM_FILENAME_RE.test(match[1]);
}

function parseGithubUrl(value: string): { owner: string; repository: string } {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError(422, "UNSUPPORTED_REPOSITORY_URL", "Use a canonical HTTPS GitHub repository URL."); }
  const match = url.pathname.match(/^\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})(?:\.git)?\/?$/u);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || !match) throw new AppError(422, "UNSUPPORTED_REPOSITORY_URL", "Only canonical HTTPS GitHub repository URLs are supported.");
  return { owner: match[1], repository: match[2].replace(/\.git$/u, "") };
}

async function githubJson(url: string, headers: Headers): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new AppError(502, "REPOSITORY_PROVIDER_UNAVAILABLE", "GitHub could not be reached. Try the import again.");
  }
  if (!response.ok) throw classifyGithubProviderError(response.status, response.headers, await response.text().catch(() => ""));
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 8 * 1024 * 1024) throw new AppError(413, "REPOSITORY_TREE_TOO_LARGE", "The repository inventory response is too large.");
  return response.json();
}

export function classifyGithubProviderError(status: number, headers: Headers, bodyText: string): AppError {
  const providerMessage = githubProviderMessage(bodyText);
  const lowerMessage = providerMessage.toLowerCase();
  const rateLimited = headers.get("x-ratelimit-remaining") === "0" || /rate limit|secondary rate limit|abuse detection/u.test(lowerMessage);
  if (status === 404) return new AppError(404, "REPOSITORY_NOT_FOUND", "GitHub could not find that public repository.");
  if (status === 403 && rateLimited) {
    return new AppError(429, "REPOSITORY_RATE_LIMITED", "GitHub rate-limited this repository import. Try again later or configure a GitHub token for authenticated imports.", providerMessage ? [{ message: `GitHub: ${providerMessage}` }] : undefined);
  }
  if (status === 403) {
    return new AppError(502, "REPOSITORY_PROVIDER_DENIED", "GitHub denied this repository import from the analysis service. Confirm the repository is public and try again later.", providerMessage ? [{ message: `GitHub: ${providerMessage}` }] : undefined);
  }
  return new AppError(502, "REPOSITORY_PROVIDER_ERROR", `GitHub returned ${status}.`, providerMessage ? [{ message: `GitHub: ${providerMessage}` }] : undefined);
}

function githubProviderMessage(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message.slice(0, 240);
  } catch { /* GitHub may return non-JSON error pages during incidents. */ }
  return bodyText.trim().replace(/\s+/gu, " ").slice(0, 240);
}

export function artifactKind(path: string): ImportedArtifact["kind"] {
  const lower = path.toLowerCase();
  if (/\.(step|stp|iges|igs|fcstd|f3d|sldprt|sldasm|ipt|iam|3dm|blend|glb|gltf)$/u.test(lower)) return "cad";
  if (/\.(stl|obj|3mf|gcode|dxf|gerber|gbr)$/u.test(lower)) return "manufacturing";
  if (/\.urdf(?:\.xacro)?$/u.test(lower)) return "urdf";
  if (/\.mjcf$/u.test(lower)) return "mjcf";
  if (/\.sdf$/u.test(lower)) return "sdf";
  if (isBomArtifactPath(lower)) return "bom";
  if (/(^|\/)(firmware|src|arduino|platformio)(\/|$)|\.(ino|hex|bin|elf)$/u.test(lower)) return "firmware";
  if (/(^|\/)(config|configuration|calibration)(\/|$)|\.(launch|toml)$/u.test(lower)) return lower.includes("calib") ? "calibration" : "configuration";
  if (/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$|(^|\/)\.gitlab-ci\.ya?ml$|(^|\/)jenkinsfile$/u.test(lower)) return "configuration";
  if (/(^|\/)(tests?|evidence)(\/|$)/u.test(lower)) return "test";
  if (/(^|\/)(package\.json|package\.xml|pyproject\.toml|requirements(?:[-_.][^/]*)?\.txt|cargo\.toml|platformio\.ini|cmakelists\.txt|\.gitmodules)$/u.test(lower)) return "configuration";
  if (/\.(png|jpe?g|webp|gif)$/u.test(lower)) return "image";
  if (/\.(mp4|webm|mov)$/u.test(lower)) return "video";
  if (/(^|\/)(readme|license|contributing|docs?)(\.|\/|$)|\.(md|pdf)$/u.test(lower)) return "documentation";
  return "other";
}

function detectedType(path: string): string | null {
  const kind = artifactKind(path);
  if (kind !== "other") return kind;
  if (/(^|\/)rpps\.(ya?ml|json)$/iu.test(path)) return "rpps";
  if (/cyclonedx|bom\.xml|cdx\./iu.test(path)) return "cyclonedx";
  if (/spdx/iu.test(path)) return "spdx";
  return null;
}

export function isProjectMetadata(path: string): boolean {
  return /(^|\/)(rpps(\.lock)?\.(ya?ml|json)|package\.(xml|json)|pyproject\.toml|requirements(?:[-_.][^/]*)?\.txt|cargo\.toml|platformio\.ini|cmakelists\.txt|\.gitmodules|ros2?\.repos|cyclonedx[^/]*|[^/]*spdx[^/]*|[^/]*oshwa[^/]*)$/iu.test(path);
}

function isRelevantText(path: string): boolean {
  return isProjectMetadata(path) || /\.(md|txt|csv|json|ya?ml|xml|xlsx|urdf|xacro|sdf|mjcf|toml|launch|ini|cfg)$/iu.test(path);
}

function parserFor(path: string): string {
  if (/rpps\./iu.test(path)) return "rpps-portable-0.1";
  if (/\.csv$/iu.test(path)) return "csv-bom-rfc4180";
  if (/\.(json|ya?ml)$/iu.test(path) && isBomArtifactPath(path, ["json", "yaml", "yml"])) return "structured-bom-v1";
  if (/\.urdf(?:\.xacro)?$/iu.test(path)) return "urdf-inventory-v1";
  if (/(^|\/)(package\.(xml|json)|pyproject\.toml|requirements(?:[-_.][^/]*)?\.txt|cargo\.toml|platformio\.ini)$/iu.test(path)) return "software-manifest-v1";
  if (/\.md$/iu.test(path)) return "markdown-procedure-heuristic-v1";
  return "artifact-inventory-v1";
}

function safeRelativePath(value: string): string {
  const normalized = value.replace(/\\/gu, "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:/iu.test(normalized) || /[\u0000-\u001f\u007f]/u.test(normalized)
    || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new AppError(422, "UNSAFE_ARCHIVE_PATH", "The import contains an unsafe or non-portable path.");
  }
  return normalized.slice(0, 1_024);
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  // UTF-16 with a byte-order mark (common for Excel/CSV exports).
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: false }).decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: false }).decode(bytes.subarray(2));
  }
  // Strip a UTF-8 BOM before decoding.
  const offset = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(offset));
}

function readmeText(files: Map<string, string>): string {
  return [...files].find(([path]) => /(^|\/)readme\.md$/iu.test(path))?.[1] ?? "";
}

function firstReadmeLine(files: Map<string, string>): string {
  return readmeText(files).split(/\r?\n/u).map((line) => line.replace(/^#+\s*/u, "").trim()).find((line) => line && !/^[-![]/u.test(line)) ?? "";
}

function tryParseData(text: string): unknown {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? JSON.parse(trimmed) : parseYaml(trimmed, { maxAliasCount: 0, uniqueKeys: true });
}

function firstArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) if (Array.isArray(record[key])) return record[key] as unknown[];
  return [];
}

function cleanBomValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || /^(n\/?a|none|unspecified|未指定|-+|\?+)$/iu.test(trimmed)) return undefined;
  return trimmed;
}
function firstValue(record: Record<string, unknown>, keys: string[]): unknown { for (const key of keys) if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key]; return undefined; }
function firstString(record: Record<string, unknown>, keys: string[]): string | undefined { const value = firstValue(record, keys); return typeof value === "string" || typeof value === "number" ? String(value).trim() || undefined : undefined; }
function cleanProjectName(value: string): string { return value.replace(/\.(zip|ya?ml|json|csv|urdf)$/iu, "").replace(/[-_]+/gu, " ").trim().slice(0, 500) || "Imported robot project"; }
function slugify(value: string): string { return value.toLowerCase().trim().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "imported-robot"; }
function defaultFileName(kind: string): string { return kind === "rpps" ? "rpps.yaml" : kind === "bom" ? "bom.csv" : "robot.urdf"; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
async function sha256Bytes(bytes: Uint8Array): Promise<string> { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); const digest = await crypto.subtle.digest("SHA-256", copy.buffer); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
