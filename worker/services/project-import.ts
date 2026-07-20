import { unzipSync } from "fflate";
import { parse as parseYaml } from "yaml";
import { RppsPackage } from "../../src/lib/rpps/schema";
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

export type ProjectImportKind = "github" | "rpps" | "bom" | "urdf" | "archive";
export type ImportedArtifact = {
  path: string;
  kind: "documentation" | "cad" | "manufacturing" | "urdf" | "mjcf" | "sdf" | "firmware" | "configuration" | "calibration" | "test" | "bom" | "image" | "video" | "other";
  sizeBytes: number | null;
  sha256?: string;
  sourceUrl?: string;
  sourceRevision?: string;
};
export type ProjectImportAnalysis = {
  schemaVersion: "project-import-analysis/2";
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
  sourceMappings: Array<{ objectType: string; objectStableId: string; sourceUrl?: string; sourcePath: string; sourceRevision?: string; parserId: string; confidence: number }>;
  manifest: PortableRppsManifest;
  manifestYaml: string;
  report: RppsValidationReport;
  importWarnings: string[];
  deterministic: true;
  aiUsed: false;
};

type InputFile = { path: string; sizeBytes: number; bytes?: Uint8Array; sourceUrl?: string; sourceRevision?: string };

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
  return analyzeFileSet("archive", file.original_name, inventory, { sourceLabel: file.original_name });
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
    sha?: string; truncated?: boolean; tree?: Array<{ path?: string; type?: string; size?: number; sha?: string; url?: string }>;
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
  for (const entry of relevant) {
    const target = inputFiles.find((file) => file.path === entry.path);
    if (!target || !entry.sha || !isRelevantText(entry.path!) || target.sizeBytes > 256 * 1024 || fetchedCount >= 24 || fetchedBytes + target.sizeBytes > 2 * 1024 * 1024) continue;
    const rawHeaders = new Headers(headers);
    rawHeaders.set("Accept", "application/vnd.github.raw+json");
    const response = await fetch(`${base}/git/blobs/${encodeURIComponent(entry.sha)}`, { headers: rawHeaders, redirect: "error", signal: AbortSignal.timeout(10_000) });
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
  });
}

async function analyzeFileSet(sourceType: ProjectImportKind, label: string, files: InputFile[], context: {
  sourceLabel: string; repositoryUrl?: string; revision?: string; name?: string; description?: string; owner?: string;
  license?: string; topics?: string[]; totalFiles?: number; truncated?: boolean;
}): Promise<ProjectImportAnalysis> {
  const relevant = files.filter((file) => artifactKind(file.path) !== "other" || isProjectMetadata(file.path));
  const detected = Array.from(new Set(relevant.map((file) => detectedType(file.path)).filter(Boolean) as string[])).sort();
  const textFiles = new Map(relevant.filter((file) => file.bytes).map((file) => [file.path, decodeText(file.bytes!)]));
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

  const name = context.name || manifest?.project.name || cleanProjectName(label);
  const slug = manifest?.project.slug || slugify(name);
  const artifacts = await Promise.all(relevant.slice(0, 500).map(async (file, index): Promise<ImportedArtifact & { id: string }> => ({
    id: `artifact:${slug}:${index + 1}`,
    path: file.path,
    kind: artifactKind(file.path),
    sizeBytes: Number.isFinite(file.sizeBytes) ? file.sizeBytes : null,
    sha256: file.bytes ? await sha256Bytes(file.bytes) : undefined,
    sourceUrl: file.sourceUrl,
    sourceRevision: file.sourceRevision,
  })));
  const components = manifest ? [] : extractComponents(textFiles, warnings, slug);
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
      components,
      interfaces: extractUrdfInterfaces(textFiles, slug),
      standards: undefined,
      contribution: context.repositoryUrl ? { url: `${context.repositoryUrl.replace(/\/$/u, "")}/blob/${encodeURIComponent(context.revision ?? "HEAD")}/CONTRIBUTING.md`, acceptsStructuredProposals: false } : undefined,
      extensions: { "org.robopartpicker.import": { sourceType, sourceLabel: context.sourceLabel, deterministic: true } },
    });
  }
  const report = validatePortableRpps(manifest);
  if (!portableEntry) warnings.push("No portable rpps.yaml manifest was found; a reviewable draft was generated without AI inference.");
  if (context.truncated) warnings.push("The repository tree was truncated by the provider; the inventory may be incomplete.");
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
  const sourceMappings = artifacts.map((artifact) => ({
    objectType: "artifact",
    objectStableId: artifact.id,
    sourceUrl: artifact.sourceUrl,
    sourcePath: artifact.path,
    sourceRevision: artifact.sourceRevision,
    parserId: parserFor(artifact.path),
    confidence: artifact.sha256 ? 1 : 0.8,
  }));
  return {
    schemaVersion: "project-import-analysis/2",
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
    sourceMappings,
    manifest,
    manifestYaml: stringifyPortableRpps(manifest),
    report,
    importWarnings: Array.from(new Set(warnings)),
    deterministic: true,
    aiUsed: false,
  };
}

function extractComponents(files: Map<string, string>, warnings: string[], slug: string): PortableRppsManifest["components"] {
  const candidate = [...files].find(([path]) => /(^|\/)(bom|bill[-_ ]?of[-_ ]?materials|parts?)([^/]*)\.(csv|json|ya?ml)$/iu.test(path));
  if (!candidate) return [];
  let rows: unknown[] = [];
  try {
    if (/\.csv$/iu.test(candidate[0])) rows = parseCsvObjects(candidate[1]);
    else {
      const parsed = tryParseData(candidate[1]);
      rows = Array.isArray(parsed) ? parsed : isRecord(parsed)
        ? firstArray(parsed, ["bom", "components", "items", "parts"]) : [];
    }
  } catch (error) {
    warnings.push(`BOM parser could not read ${candidate[0]}: ${error instanceof Error ? error.message : "invalid data"}`);
    return [];
  }
  const components: PortableRppsManifest["components"] = [];
  for (const [index, raw] of rows.slice(0, 10_000).entries()) {
    if (!isRecord(raw)) continue;
    const normalized = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value]));
    const name = firstString(normalized, ["name", "part", "component", "description", "item"]);
    if (!name) continue;
    const quantity = positiveNumber(firstValue(normalized, ["quantity", "qty", "count"])) ?? 1;
    const manufacturer = firstString(normalized, ["manufacturer", "maker", "mfr"]);
    const mpn = firstString(normalized, ["manufacturerpartnumber", "mpn", "partnumber", "sku"]);
    const ref = firstString(normalized, ["reference", "ref", "designator", "id"]);
    components.push({
      id: `component:${slug}:${slugify(ref || name || String(index + 1)).slice(0, 80) || index + 1}`,
      name: name.slice(0, 500),
      quantity,
      unit: firstString(normalized, ["unit", "uom"])?.slice(0, 40) || "each",
      manufacturer: manufacturer?.slice(0, 160),
      mpn: mpn?.slice(0, 160),
      fabricated: /^(true|yes|fabricated|make)$/iu.test(String(firstValue(normalized, ["fabricated", "makeorbuy"]) ?? "")),
      optional: /^(true|yes|optional)$/iu.test(String(firstValue(normalized, ["optional"]) ?? "")),
      artifactRefs: [],
    });
  }
  if (rows.length && !components.length) warnings.push(`BOM file ${candidate[0]} did not expose recognizable name or quantity columns.`);
  return components;
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

function parseCsvObjects(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n") { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map(normalizeHeader) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function parseGithubUrl(value: string): { owner: string; repository: string } {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError(422, "UNSUPPORTED_REPOSITORY_URL", "Use a canonical HTTPS GitHub repository URL."); }
  const match = url.pathname.match(/^\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})(?:\.git)?\/?$/u);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || !match) throw new AppError(422, "UNSUPPORTED_REPOSITORY_URL", "Only canonical HTTPS GitHub repository URLs are supported.");
  return { owner: match[1], repository: match[2].replace(/\.git$/u, "") };
}

async function githubJson(url: string, headers: Headers): Promise<unknown> {
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new AppError(response.status === 404 ? 404 : 502, "REPOSITORY_PROVIDER_ERROR", `GitHub returned ${response.status}.`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 8 * 1024 * 1024) throw new AppError(413, "REPOSITORY_TREE_TOO_LARGE", "The repository inventory response is too large.");
  return response.json();
}

function artifactKind(path: string): ImportedArtifact["kind"] {
  const lower = path.toLowerCase();
  if (/\.(step|stp|iges|igs|fcstd|f3d|sldprt|sldasm|ipt|iam|3dm|blend)$/u.test(lower)) return "cad";
  if (/\.(stl|obj|3mf|gcode|dxf|gerber|gbr)$/u.test(lower)) return "manufacturing";
  if (/\.urdf(?:\.xacro)?$/u.test(lower)) return "urdf";
  if (/\.mjcf$/u.test(lower)) return "mjcf";
  if (/\.sdf$/u.test(lower)) return "sdf";
  if (/(^|\/)(bom|bill[-_ ]?of[-_ ]?materials|parts?)([^/]*)\.(csv|json|ya?ml|xlsx)$/u.test(lower)) return "bom";
  if (/(^|\/)(firmware|src|arduino|platformio)(\/|$)|\.(ino|hex|bin|elf)$/u.test(lower)) return "firmware";
  if (/(^|\/)(config|configuration|calibration)(\/|$)|\.(launch|toml)$/u.test(lower)) return lower.includes("calib") ? "calibration" : "configuration";
  if (/(^|\/)(tests?|evidence)(\/|$)/u.test(lower)) return "test";
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

function isProjectMetadata(path: string): boolean {
  return /(^|\/)(rpps(\.lock)?\.(ya?ml|json)|package\.xml|ros2?\.repos|cyclonedx[^/]*|[^/]*spdx[^/]*|[^/]*oshwa[^/]*)$/iu.test(path);
}

function isRelevantText(path: string): boolean {
  return isProjectMetadata(path) || /\.(md|txt|csv|json|ya?ml|xml|urdf|xacro|sdf|mjcf|toml|launch|ini|cfg)$/iu.test(path);
}

function parserFor(path: string): string {
  if (/rpps\./iu.test(path)) return "rpps-portable-0.1";
  if (/\.csv$/iu.test(path)) return "csv-bom-rfc4180";
  if (/\.(json|ya?ml)$/iu.test(path) && /bom|parts?/iu.test(path)) return "structured-bom-v1";
  if (/\.urdf(?:\.xacro)?$/iu.test(path)) return "urdf-inventory-v1";
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
  if (bytes.includes(0)) return "";
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
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

function normalizeHeader(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/gu, ""); }
function firstValue(record: Record<string, unknown>, keys: string[]): unknown { for (const key of keys) if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key]; return undefined; }
function firstString(record: Record<string, unknown>, keys: string[]): string | undefined { const value = firstValue(record, keys); return typeof value === "string" || typeof value === "number" ? String(value).trim() || undefined : undefined; }
function positiveNumber(value: unknown): number | undefined { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000 ? parsed : undefined; }
function cleanProjectName(value: string): string { return value.replace(/\.(zip|ya?ml|json|csv|urdf)$/iu, "").replace(/[-_]+/gu, " ").trim().slice(0, 500) || "Imported robot project"; }
function slugify(value: string): string { return value.toLowerCase().trim().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "imported-robot"; }
function defaultFileName(kind: string): string { return kind === "rpps" ? "rpps.yaml" : kind === "bom" ? "bom.csv" : "robot.urdf"; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
async function sha256Bytes(bytes: Uint8Array): Promise<string> { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); const digest = await crypto.subtle.digest("SHA-256", copy.buffer); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
