import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  extractRepositoryDescription,
  githubRepositoryParts,
  githubRevisionTreeUrl,
  immutableGithubBlobUrl,
  normalizeGithubRepositoryDescription,
  repositoryDescriptionNeedsCleanup,
  summarizeRepositoryText,
  validateReviewedRepositoryMetadataQuality,
  validateReviewedRepositoryMetadataWave,
  type ReviewedRepositoryMetadataDefinition,
  type ReviewedRepositoryMetadataWave,
} from "../src/lib/reviewed-repository-metadata";

type EnvName = "production" | "preview";
type GapRow = {
  slug: string;
  name: string;
  project_kind: string;
  repository_url: string | null;
  revision: string | null;
  summary: string | null;
  description: string | null;
  license_spdx: string | null;
  docs_url: string | null;
};
type GitHubResult = { ok: boolean; status: number; data: unknown };
type GitHubBytesResult = { ok: boolean; status: number; data: Uint8Array | null };

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const outputIndex = args.indexOf("--output");
const descriptionQuality = args.includes("--description-quality");
const env = (envIndex >= 0 ? args[envIndex + 1] : undefined) as EnvName | undefined;
const outputPath = resolve(outputIndex >= 0 && args[outputIndex + 1]
  ? args[outputIndex + 1]
  : descriptionQuality
    ? "data/project-waves/2026-08-20-reviewed-description-quality.json"
    : "data/project-waves/2026-08-20-reviewed-repository-metadata.json");
const write = args.includes("--write");

if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/prepare-reviewed-repository-metadata-wave.ts --env production|preview [--description-quality] [--output path] [--write]");
  process.exit(2);
}

function credentialsEnvironment(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  try {
    const credentials = readFileSync("/root/.cloudflare/credentials", "utf8");
    for (const line of credentials.split("\n")) {
      const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/u);
      if (match) childEnv[match[1]] = match[2];
    }
  } catch {
    // The caller may already provide Cloudflare credentials.
  }
  childEnv.CLOUDFLARE_API_TOKEN ??= childEnv.CF_API_TOKEN;
  childEnv.CLOUDFLARE_ACCOUNT_ID ??= childEnv.CF_ACCOUNT_ID;
  childEnv.CLOUDFLARE_EMAIL ??= childEnv.CF_EMAIL;
  delete childEnv.CF_API_TOKEN;
  delete childEnv.CF_ACCOUNT_ID;
  delete childEnv.CF_EMAIL;
  return childEnv;
}

const childEnv = credentialsEnvironment();
const githubToken = childEnv.GITHUB_TOKEN
  ?? execFileSync("gh", ["auth", "token"], { encoding: "utf8", env: childEnv }).trim();

function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfterSeconds = Number(response?.headers.get("retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return Math.min(60_000, retryAfterSeconds * 1_000);
  return Math.min(30_000, (2 ** attempt) * 1_000 + Math.floor(Math.random() * 500));
}

function githubFailure(result: GitHubResult): string {
  return `HTTP ${result.status}${typeof result.data === "string" ? `: ${result.data}` : ""}`;
}

function wranglerRows(command: string): Array<Record<string, unknown>> {
  const output = execFileSync("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env!, "--remote", "--command", command, "--json", "--yes",
  ], {
    cwd: process.cwd(),
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed.flatMap((page) => page.results ?? []);
}

function loadGapRows(): GapRow[] {
  const rows = wranglerRows(`SELECT p.slug, p.name, p.project_kind, p.repository_url, p.revision, p.summary, p.description, p.license_spdx,
    json_extract(pv.rpps_json, '$.docs_url') AS docs_url
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.deleted_at IS NULL${descriptionQuality ? "" : " AND ((p.summary IS NULL OR trim(p.summary) = '') OR (p.description IS NULL OR trim(p.description) = '') OR (p.license_spdx IS NULL OR trim(p.license_spdx) = ''))"}
    ORDER BY p.slug`) as unknown as GapRow[];
  return descriptionQuality
    ? rows.filter((row) => Boolean(row.repository_url && row.revision) && repositoryDescriptionNeedsCleanup(row.description))
    : rows;
}

async function github(path: string): Promise<GitHubResult> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/${path}`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${githubToken}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "RoboPartPicker reviewed metadata wave",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs(attempt)));
      continue;
    }
    if (response.ok) return { ok: true, status: response.status, data: await response.json() };
    if (response.status === 404) return { ok: false, status: 404, data: null };
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
      const resetAt = Number.isFinite(resetSeconds) ? new Date(resetSeconds * 1_000).toISOString() : "unknown";
      return { ok: false, status: 403, data: `GitHub core API quota exhausted until ${resetAt}` };
    }
    if ([403, 429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs(attempt, response)));
      continue;
    }
    return { ok: false, status: response.status, data: await response.text() };
  }
  return { ok: false, status: 599, data: null };
}

async function githubBytes(path: string): Promise<GitHubBytesResult> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/${path}`, {
        headers: {
          accept: "application/vnd.github.raw+json",
          authorization: `Bearer ${githubToken}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "RoboPartPicker reviewed metadata wave",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs(attempt)));
      continue;
    }
    if (response.ok) return { ok: true, status: response.status, data: new Uint8Array(await response.arrayBuffer()) };
    if (response.status === 404) return { ok: false, status: 404, data: null };
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      return { ok: false, status: 403, data: null };
    }
    if ([403, 429, 500, 502, 503, 504].includes(response.status)) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs(attempt, response)));
      continue;
    }
    return { ok: false, status: response.status, data: null };
  }
  return { ok: false, status: 599, data: null };
}

async function githubFileBytes(
  data: { content?: string; path?: string },
  owner: string,
  repo: string,
  revision: string,
): Promise<Uint8Array> {
  if (typeof data.content === "string") return Buffer.from(data.content.replace(/\s/gu, ""), "base64");
  if (!data.path) throw new Error("GitHub content response omitted path");
  const path = data.path.split("/").map(encodeURIComponent).join("/");
  const result = await githubBytes(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(revision)}`);
  if (!result.ok || !result.data) throw new Error(`GitHub raw content returned HTTP ${result.status}`);
  return result.data;
}

function textHash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isEmpty(value: string | null): boolean {
  return !value?.trim();
}

async function prepareDefinition(row: GapRow): Promise<ReviewedRepositoryMetadataDefinition> {
  const missingSummary = !descriptionQuality && isEmpty(row.summary);
  const missingDescription = descriptionQuality ? repositoryDescriptionNeedsCleanup(row.description) : isEmpty(row.description);
  const missingLicense = !descriptionQuality && isEmpty(row.license_spdx);
  const updates: ReviewedRepositoryMetadataDefinition["updates"] = {};
  const sources: ReviewedRepositoryMetadataDefinition["sources"] = {};
  const parts = row.repository_url ? githubRepositoryParts(row.repository_url) : null;

  let repositoryDescription: string | null = null;
  if (missingDescription && parts) {
    const result = await github(`repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`);
    if (!result.ok) throw new Error(`${row.slug}: repository metadata returned ${githubFailure(result)}`);
    const data = result.data as { description?: string | null };
    const normalized = normalizeGithubRepositoryDescription(data.description);
    const candidate = normalized || null;
    const cjkLength = candidate?.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
    repositoryDescription = candidate && (candidate.length >= 15 || cjkLength >= 6) && !/^(?:n\/?a|none|no description|todo|test(?:ing)?)\.?$/iu.test(candidate) && !repositoryDescriptionNeedsCleanup(candidate)
      ? candidate
      : null;
  }

  let readmeBytes: Uint8Array | null = null;
  let readmePath: string | null = null;
  let readmeDescription = "";
  if ((missingSummary || (missingDescription && !repositoryDescription)) && parts && row.revision) {
    const result = await github(`repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}/readme?ref=${encodeURIComponent(row.revision)}`);
    if (result.ok) {
      const data = result.data as { content?: string; path?: string };
      if (data.path) {
        readmeBytes = await githubFileBytes(data, parts.owner, parts.repo, row.revision);
        readmePath = data.path;
        const candidate = extractRepositoryDescription(Buffer.from(readmeBytes).toString("utf8"));
        readmeDescription = repositoryDescriptionNeedsCleanup(candidate) ? "" : candidate;
      }
    } else if (result.status !== 404) {
      throw new Error(`${row.slug}: README request returned ${githubFailure(result)}`);
    }
  }

  if (missingDescription) {
    if (repositoryDescription && row.repository_url) {
      const bytes = Buffer.from(repositoryDescription, "utf8");
      updates.description = repositoryDescription;
      sources.description = {
        derivation: "github-repository-description",
        source_url: row.repository_url,
        sha256: textHash(bytes),
        size_bytes: bytes.byteLength,
      };
    } else if (readmeDescription && readmeBytes && readmePath && row.repository_url && row.revision) {
      updates.description = readmeDescription;
      sources.description = {
        derivation: "readme-description",
        source_url: immutableGithubBlobUrl(row.repository_url, row.revision, readmePath),
        path: readmePath,
        sha256: textHash(readmeBytes),
        size_bytes: readmeBytes.byteLength,
      };
    } else {
      throw new Error(`${row.slug}: no source-backed description could be resolved`);
    }
  }

  if (missingSummary) {
    const sourceText = readmeDescription || row.description?.trim() || "";
    const summary = summarizeRepositoryText(sourceText);
    if (!summary) throw new Error(`${row.slug}: no source-backed summary could be resolved`);
    if (!readmeBytes || !readmePath || !row.repository_url || !row.revision) {
      throw new Error(`${row.slug}: summary requires an immutable pinned README source`);
    }
    updates.summary = summary;
    sources.summary = {
      derivation: "readme-summary",
      source_url: immutableGithubBlobUrl(row.repository_url, row.revision, readmePath),
      path: readmePath,
      sha256: textHash(readmeBytes),
      size_bytes: readmeBytes.byteLength,
    };
  }

  if (missingLicense) {
    if (parts && row.repository_url && row.revision) {
      const result = await github(`repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}/license?ref=${encodeURIComponent(row.revision)}`);
      if (result.ok) {
        const data = result.data as { content?: string; path?: string; license?: { spdx_id?: string | null } };
        if (!data.path) throw new Error(`${row.slug}: GitHub license response omitted path`);
        const bytes = await githubFileBytes(data, parts.owner, parts.repo, row.revision);
        const spdxId = data.license?.spdx_id?.trim() || "NOASSERTION";
        updates.license_spdx = spdxId;
        sources.license_spdx = {
          derivation: "github-license-file",
          source_url: immutableGithubBlobUrl(row.repository_url, row.revision, data.path),
          path: data.path,
          sha256: textHash(bytes),
          size_bytes: bytes.byteLength,
          spdx_id: spdxId,
        };
      } else if (result.status === 404) {
        updates.license_spdx = "NOASSERTION";
        sources.license_spdx = {
          derivation: "github-license-absence",
          source_url: githubRevisionTreeUrl(row.repository_url, row.revision),
        };
      } else {
        throw new Error(`${row.slug}: GitHub license request returned ${githubFailure(result)}`);
      }
    } else if (row.project_kind === "commercial_showcase" && row.docs_url) {
      updates.license_spdx = "NOASSERTION";
      sources.license_spdx = {
        derivation: "commercial-catalog-status",
        source_url: row.docs_url,
      };
    } else {
      throw new Error(`${row.slug}: no source-backed license status could be resolved`);
    }
  }

  return {
    slug: row.slug,
    name: row.name,
    project_kind: row.project_kind,
    repository_url: row.repository_url,
    revision: row.revision,
    updates,
    sources,
  };
}

const rows = loadGapRows();
const projects = new Array<ReviewedRepositoryMetadataDefinition>(rows.length);
const errors: string[] = [];
let cursor = 0;
let completed = 0;

async function worker(): Promise<void> {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= rows.length) return;
    try {
      projects[index] = await prepareDefinition(rows[index]);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    completed += 1;
    if (completed % 10 === 0 || completed === rows.length) {
      console.log(`JCODE_PROGRESS ${JSON.stringify({ current: completed, total: rows.length, unit: "projects", message: `metadata sources prepared; ${errors.length} errors` })}`);
    }
  }
}

await Promise.all(Array.from({ length: 10 }, () => worker()));
if (errors.length) throw new Error(`Repository metadata wave preparation failed:\n${errors.join("\n")}`);

const wave: ReviewedRepositoryMetadataWave = {
  wave: descriptionQuality ? "reviewed-description-quality-2026-08-20" : "reviewed-repository-metadata-2026-08-20",
  schema_version: 1,
  reviewed_at: new Date().toISOString(),
  projects: projects.sort((left, right) => left.slug.localeCompare(right.slug)),
};
const validationErrors = validateReviewedRepositoryMetadataWave(wave);
validationErrors.push(...validateReviewedRepositoryMetadataQuality(wave));
if (validationErrors.length) throw new Error(`Generated wave failed validation:\n${validationErrors.join("\n")}`);

const descriptions = wave.projects.flatMap((project) => project.updates.description ? [project.updates.description] : []);
const summary = {
  env,
  projects: wave.projects.length,
  summaries: wave.projects.filter((project) => project.updates.summary).length,
  descriptions: descriptions.length,
  licenses: wave.projects.filter((project) => project.updates.license_spdx).length,
  concreteLicenses: wave.projects.filter((project) => project.updates.license_spdx && project.updates.license_spdx !== "NOASSERTION").length,
  noAssertion: wave.projects.filter((project) => project.updates.license_spdx === "NOASSERTION").length,
  descriptionLengths: descriptions.length ? {
    min: Math.min(...descriptions.map((value) => value.length)),
    max: Math.max(...descriptions.map((value) => value.length)),
    average: Math.round(descriptions.reduce((total, value) => total + value.length, 0) / descriptions.length),
  } : null,
  output: outputPath,
  wrote: write,
};

if (write) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(wave, null, 2)}\n`);
}
console.log(JSON.stringify(summary, null, 2));
if (!write) console.log("Dry run complete. Pass --write to create the reviewed wave file; no production data was modified.");
