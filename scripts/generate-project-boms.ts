#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { compileProjectBom, type BomCompilerArtifact, type CompiledProjectBom } from "../src/lib/bom-compiler";
import { parseExplicitBomArtifact, type ExplicitBomParseResult } from "../src/lib/bom-source-adapters";
import { buildCampaignPublicationSql, buildExactComponentMatcher, selectBomSourcePaths } from "./lib/bom-campaign";

const exec = promisify(execFile);
const MAX_FETCHED_ARTIFACTS = 24;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

type EnvName = "local" | "preview" | "production";
type ProjectKind = "physical_design" | "robotics_software" | "commercial_showcase" | "unknown";
type ProjectRow = {
  id: string; slug: string; name: string; owner_user_id: string | null; organization_id: string | null;
  visibility: "private" | "organization" | "unlisted" | "public"; project_kind: string;
  repository_url: string | null; revision: string | null; existing_bom_id: string | null;
  existing_version_count: number;
};
type OfficialLine = {
  project_id: string; description: string; quantity: number; unit: string; manufacturer: string | null;
  mpn: string | null; evidence_locator: string; optional: number;
};
type TreeEntry = { path: string; type: string; size?: number };
type ResultRow = { projectId: string; slug: string; projectKind: ProjectKind; publicationState: string; lineCount: number; artifactCount: number; sourceRevision: string | null; sourceFingerprint: string; error?: string };

const args = process.argv.slice(2);
const env = valueAfter("--env") as EnvName | undefined;
const apply = args.includes("--apply");
const noFetch = args.includes("--no-fetch");
const slugFilter = new Set((valueAfter("--slugs") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
const limit = Number(valueAfter("--limit") ?? 0);
if (!env || !["local", "preview", "production"].includes(env)) {
  console.error("Usage: tsx scripts/generate-project-boms.ts --env local|preview|production [--slugs a,b] [--limit N] [--no-fetch] [--apply]");
  process.exit(2);
}

async function main() {
  const outputRoot = resolve(`.ingest/bom-generation-campaign/${env}`);
  mkdirSync(outputRoot, { recursive: true });
  const projects = (await query<ProjectRow>(`SELECT p.id, p.slug, p.name, p.owner_user_id, p.organization_id, p.visibility,
      p.project_kind, p.repository_url, p.revision,
      (SELECT b.id FROM boms b WHERE b.project_id = p.id AND b.is_demo = 0 ORDER BY b.updated_at DESC LIMIT 1) AS existing_bom_id,
      (SELECT COUNT(*) FROM bom_versions bv JOIN boms b ON b.id = bv.bom_id WHERE b.project_id = p.id AND b.is_demo = 0) AS existing_version_count
    FROM projects p WHERE p.deleted_at IS NULL AND p.is_demo = 0 AND p.status = 'published' AND p.visibility IN ('public', 'unlisted')
    ORDER BY p.slug`))
    .filter((project) => slugFilter.size === 0 || slugFilter.has(project.slug))
    .slice(0, limit > 0 ? limit : undefined);
  const components = await query<{ id: string; manufacturer: string | null; mpn: string | null }>(`SELECT c.id, m.name AS manufacturer, c.manufacturer_part_number AS mpn
    FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
    WHERE c.deleted_at IS NULL AND c.is_demo = 0 AND c.manufacturer_part_number IS NOT NULL`);
  const officialLines = await query<OfficialLine>(`SELECT b.project_id, bi.description, bi.quantity, bi.unit, m.name AS manufacturer,
      c.manufacturer_part_number AS mpn, bi.evidence_locator, bi.optional
    FROM boms b JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
    LEFT JOIN components c ON c.id = bi.component_id LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
    WHERE b.is_demo = 0 AND bi.included = 1 AND bi.extraction_method = 'explicit-official-bom'
      AND bi.evidence_locator IS NOT NULL AND trim(bi.evidence_locator) <> ''`);
  const existingRuns = new Set((await loadExistingRuns())
    .map((row) => `${row.project_id}\u0000${row.source_fingerprint}`));
  const matchComponent = buildExactComponentMatcher(components);
  const officialByProject = new Map<string, OfficialLine[]>();
  officialLines.forEach((line) => officialByProject.set(line.project_id, [...(officialByProject.get(line.project_id) ?? []), line]));

  const results: ResultRow[] = [];
  const statementGroups: string[][] = [];
  for (const [index, project] of projects.entries()) {
    const projectKind = normalizeProjectKind(project.project_kind);
    process.stdout.write(`[${index + 1}/${projects.length}] ${project.slug} ... `);
    let compiled: CompiledProjectBom;
    let campaignError: string | undefined;
    try {
      const source = await sourceArtifacts(project, projectKind, officialByProject.get(project.id) ?? []);
      compiled = await compileProjectBom({
        projectId: project.id,
        projectKind,
        commercial: projectKind === "commercial_showcase",
        sourceRevision: source.revision,
        sourceInventoryComplete: source.inventoryComplete,
        artifacts: source.artifacts,
      });
      if (source.error && compiled.publicationState === "unavailable") campaignError = source.error;
    } catch (error) {
      campaignError = error instanceof Error ? error.message : "source campaign failed";
      compiled = await compileProjectBom({ projectId: project.id, projectKind, commercial: projectKind === "commercial_showcase", sourceRevision: project.revision, sourceInventoryComplete: false, artifacts: [] });
      if (projectKind === "physical_design") compiled = { ...compiled, publicationState: "draft" };
    }
    const key = `${project.id}\u0000${compiled.sourceFingerprint}`;
    const row: ResultRow = {
      projectId: project.id, slug: project.slug, projectKind, publicationState: compiled.publicationState,
      lineCount: compiled.lines.length, artifactCount: compiled.artifacts.length, sourceRevision: compiled.sourceRevision,
      sourceFingerprint: compiled.sourceFingerprint, ...(campaignError ? { error: campaignError } : {}),
    };
    results.push(row);
    if (existingRuns.has(key)) {
      console.log(`${row.publicationState}, ${row.lineCount} lines, unchanged`);
      continue;
    }
    const identity = deterministicIds(project.id, compiled.sourceFingerprint, project.existing_bom_id);
    statementGroups.push(buildCampaignPublicationSql({
      project: {
        id: project.id, slug: project.slug, name: project.name, ownerUserId: project.owner_user_id,
        organizationId: project.organization_id, visibility: project.visibility, existingBomId: project.existing_bom_id,
        existingVersionCount: Number(project.existing_version_count ?? 0),
      },
      compiled,
      now: new Date().toISOString(),
      matchComponent,
      ids: identity,
    }));
    console.log(`${row.publicationState}, ${row.lineCount} lines, ${row.artifactCount} artifacts`);
  }

  const waves = packWaves(statementGroups, 400, 1_500_000);
  const waveFiles = waves.map((statements, index) => {
    const path = join(outputRoot, `wave-${String(index + 1).padStart(3, "0")}.sql`);
    writeFileSync(path, `${statements.join("\n")}\n`);
    return path;
  });
  const stateCounts = Object.fromEntries([...new Set(results.map((row) => row.publicationState))].sort().map((state) => [state, results.filter((row) => row.publicationState === state).length]));
  const manifest = {
    schemaVersion: "bom-campaign/1", environment: env, generatedAt: new Date().toISOString(), apply,
    projectsSeen: projects.length, projectsPlanned: statementGroups.length, waves: waveFiles, stateCounts,
    totalLines: results.reduce((sum, row) => sum + row.lineCount, 0), failures: results.filter((row) => row.error), results,
  };
  const manifestPath = join(outputRoot, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ projectsSeen: projects.length, projectsPlanned: statementGroups.length, waves: waveFiles.length, stateCounts, totalLines: manifest.totalLines, failures: manifest.failures.length, manifestPath }, null, 2));
  if (!apply) {
    console.log("DRY RUN ONLY. Add --apply after reviewing the manifest and SQL waves.");
    return;
  }
  for (const [index, file] of waveFiles.entries()) {
    console.log(`Applying wave ${index + 1}/${waveFiles.length}: ${file}`);
    await executeSqlFile(file);
  }
  const audit = await query<{ state: string; projects: number; lines: number }>(`SELECT bv.publication_state AS state, COUNT(DISTINCT b.project_id) AS projects, COUNT(bi.id) AS lines
    FROM boms b JOIN bom_versions bv ON bv.id = b.current_version_id LEFT JOIN bom_items bi ON bi.bom_version_id = bv.id
    WHERE b.is_demo = 0 GROUP BY bv.publication_state ORDER BY bv.publication_state`);
  console.log(JSON.stringify({ applied: true, audit }, null, 2));
}

async function sourceArtifacts(project: ProjectRow, projectKind: ProjectKind, official: OfficialLine[]): Promise<{ revision: string | null; artifacts: BomCompilerArtifact[]; inventoryComplete: boolean; error?: string }> {
  if (official.length > 0) {
    const text = JSON.stringify({ items: official.map((line) => ({ name: line.description, quantity: line.quantity, unit: line.unit, manufacturer: line.manufacturer, mpn: line.mpn, optional: line.optional === 1, evidenceLocator: line.evidence_locator })) });
    const parsed = parseExplicitBomArtifact({ path: "normalized-official-bom.json", text });
    parsed.candidates.forEach((candidate, index) => {
      candidate.sourceLocator = official[index]?.evidence_locator ?? candidate.sourceLocator;
    });
    return { revision: project.revision, inventoryComplete: true, artifacts: [{ path: "normalized-official-bom.json", checksumSha256: sha256(Buffer.from(text)), sourceUrl: project.repository_url ?? undefined, sourceRevision: project.revision ?? undefined, parse: parsed }] };
  }
  if (projectKind !== "physical_design" || noFetch) return { revision: project.revision, artifacts: [], inventoryComplete: true };
  const github = parseGithubRepository(project.repository_url);
  if (!github) return { revision: project.revision, artifacts: [], inventoryComplete: true };
  try {
    const revision = await ghText(["api", `repos/${github.owner}/${github.repo}/commits/${project.revision || "HEAD"}`, "--jq", ".sha"]);
    const tree = JSON.parse(await ghText(["api", `repos/${github.owner}/${github.repo}/git/trees/${revision}?recursive=1`])) as { tree?: TreeEntry[]; truncated?: boolean };
    const sourcePaths = selectBomSourcePaths((tree.tree ?? []).filter((entry) => entry.type === "blob"));
    const selected = sourcePaths.slice(0, MAX_FETCHED_ARTIFACTS);
    const artifacts: BomCompilerArtifact[] = [];
    let bytesSeen = 0;
    for (const path of selected) {
      const bytes = await fetchRawBytes(github.owner, github.repo, revision, path);
      bytesSeen += bytes.byteLength;
      if (bytesSeen > MAX_TOTAL_BYTES) break;
      const text = /\.xlsx$/iu.test(path) ? undefined : new TextDecoder().decode(bytes);
      if (/(^|\/)readme/iu.test(path) && !/(?:bill of materials|\bbom\b)/iu.test(text ?? "")) continue;
      const parse = parseExplicitBomArtifact({ path, text, bytes: new Uint8Array(bytes) });
      artifacts.push({ path, checksumSha256: sha256(bytes), sourceUrl: `${project.repository_url}/blob/${revision}/${path}`, sourceRevision: revision, parse });
    }
    return {
      revision,
      artifacts,
      inventoryComplete: !tree.truncated && sourcePaths.length <= MAX_FETCHED_ARTIFACTS && bytesSeen <= MAX_TOTAL_BYTES,
    };
  } catch (error) {
    return { revision: project.revision, artifacts: [], inventoryComplete: false, error: error instanceof Error ? error.message : "GitHub source retrieval failed" };
  }
}

async function query<T>(sql: string): Promise<T[]> {
  const command = wranglerArgs(["--json", "--command", sql]);
  const { stdout } = await exec("node_modules/.bin/wrangler", command, { cwd: process.cwd(), env: process.env, maxBuffer: 128 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as Array<{ results?: T[] }>;
  return parsed.flatMap((page) => page.results ?? []);
}

async function loadExistingRuns(): Promise<Array<{ project_id: string; source_fingerprint: string }>> {
  const columns = await query<{ name: string }>("PRAGMA table_info('bom_generation_runs')");
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("compiler_version") || !names.has("policy_version")) {
    console.warn("Schema predates migration 0032; existing compiler-v1 runs are empty for dry-run planning.");
    return [];
  }
  return query<{ project_id: string; source_fingerprint: string }>(`SELECT project_id, source_fingerprint FROM bom_generation_runs
    WHERE compiler_version = 'bom-compiler/1' AND policy_version = 'bom-publication/1' AND status = 'confirmed'`);
}

async function executeSqlFile(path: string): Promise<void> {
  await exec("node_modules/.bin/wrangler", wranglerArgs(["--file", path]), { cwd: process.cwd(), env: process.env, maxBuffer: 128 * 1024 * 1024 });
}

function wranglerArgs(tail: string[]): string[] {
  return env === "local"
    ? ["d1", "execute", "robopartpicker", "--local", ...tail]
    : ["d1", "execute", "DB", "--env", env!, "--remote", ...tail];
}

async function ghText(command: string[]): Promise<string> {
  const { stdout } = await exec("gh", command, { env: process.env, maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

async function fetchRawBytes(owner: string, repo: string, revision: string, path: string): Promise<Buffer> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(revision)}/${encodedPath}`;
  let lastError = "raw source fetch failed";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "error" });
      if (!response.ok) throw new Error(`raw source HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`${path}: ${lastError}`);
}

function parseGithubRepository(value: string | null): { owner: string; repo: string } | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.toLocaleLowerCase("en-US") !== "github.com") return null;
    const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
    const repo = rawRepo?.replace(/\.git$/iu, "");
    return owner && repo ? { owner, repo } : null;
  } catch { return null; }
}

function normalizeProjectKind(value: string): ProjectKind {
  return ["physical_design", "robotics_software", "commercial_showcase"].includes(value) ? value as ProjectKind : "unknown";
}

function deterministicIds(projectId: string, fingerprint: string, existingBomId: string | null) {
  const id = (label: string) => uuidFromHash(`${label}\u0000${projectId}\u0000${fingerprint}`);
  return { runId: id("run"), bomId: existingBomId ?? id("bom"), versionId: id("version") };
}

function uuidFromHash(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hash[12] = "4"; hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  const text = hash.join("");
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

function packWaves(groups: string[][], maxStatements: number, maxBytes: number): string[][] {
  const waves: string[][] = [];
  let current: string[] = [];
  let bytes = 0;
  for (const group of groups) {
    const groupBytes = Buffer.byteLength(group.join("\n"));
    if (current.length > 0 && (current.length + group.length > maxStatements || bytes + groupBytes > maxBytes)) {
      waves.push(current); current = []; bytes = 0;
    }
    current.push(...group); bytes += groupBytes;
  }
  if (current.length) waves.push(current);
  return waves;
}

function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function valueAfter(flag: string): string | undefined { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
