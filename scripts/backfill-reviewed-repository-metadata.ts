import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildReviewedRepositoryMetadataForwardSql,
  buildReviewedRepositoryMetadataRollbackSql,
  extractRepositoryDescription,
  githubRepositoryParts,
  prepareRepositoryMetadataEvidence,
  serializeReviewedRepositoryMetadataRpps,
  summarizeRepositoryText,
  validateReviewedRepositoryMetadataQuality,
  validateReviewedRepositoryMetadataWave,
  type PreparedRepositoryMetadataEvidence,
  type PreparedReviewedRepositoryMetadata,
  type ReviewedMetadataField,
  type ReviewedRepositoryMetadataDefinition,
  type ReviewedRepositoryMetadataRow,
  type ReviewedRepositoryMetadataSource,
  type ReviewedRepositoryMetadataWave,
} from "../src/lib/reviewed-repository-metadata";
import { sqlString } from "../src/lib/physical-design-wave-import";
import { normalizeRppsForWrite } from "../src/lib/rpps/schema";

type EnvName = "production" | "preview";
type GitHubResult = { ok: boolean; status: number; data: unknown };
type GitHubBytesResult = { ok: boolean; status: number; data: Uint8Array | null };
type EvidenceStateRow = {
  evidence_id: string;
  source_type: string;
  source_url: string | null;
  title: string;
  publisher: string | null;
  retrieved_at: string;
  confidence: number;
  content_hash: string | null;
  excerpt: string | null;
  claim_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  claim_key: string | null;
  claim_value: string | null;
  claim_confidence: number | null;
};

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const waveIndex = args.indexOf("--wave");
const env = (envIndex >= 0 ? args[envIndex + 1] : undefined) as EnvName | undefined;
const wavePath = resolve(waveIndex >= 0 && args[waveIndex + 1]
  ? args[waveIndex + 1]
  : "data/project-waves/2026-08-20-reviewed-repository-metadata.json");
const apply = args.includes("--apply");
const scratch = process.env.JCODE_SCRATCH_DIR;
const batchSize = 25;

if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/backfill-reviewed-repository-metadata.ts --env production|preview [--wave path] [--apply]");
  process.exit(2);
}
if (!scratch) {
  console.error("JCODE_SCRATCH_DIR is required so generated SQL, rollback, and verification artifacts stay outside the repository.");
  process.exit(2);
}
if (apply && env === "production" && process.env.ALLOW_PRODUCTION_REPOSITORY_METADATA !== "1") {
  console.error("Production apply is blocked. Set ALLOW_PRODUCTION_REPOSITORY_METADATA=1 only after reviewing the source-verified dry run and rollback artifacts.");
  process.exit(2);
}

const wave = JSON.parse(readFileSync(wavePath, "utf8")) as ReviewedRepositoryMetadataWave;
const definitionErrors = validateReviewedRepositoryMetadataWave(wave);
definitionErrors.push(...validateReviewedRepositoryMetadataQuality(wave));
if (definitionErrors.length) throw new Error(`Invalid reviewed repository metadata wave:\n${definitionErrors.join("\n")}`);

function credentialsEnvironment(): NodeJS.ProcessEnv {
  const childEnv = { ...process.env };
  try {
    const credentials = readFileSync("/root/.cloudflare/credentials", "utf8");
    for (const line of credentials.split("\n")) {
      const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/u);
      if (match) childEnv[match[1]] = match[2];
    }
  } catch {
    // The caller may already provide credentials.
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

function publicOrigin(environment: EnvName): string {
  return environment === "production"
    ? "https://robopartpicker-production.ludomi2502.workers.dev"
    : "https://robopartpicker-preview.ludomi2502.workers.dev";
}

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
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed.flatMap((page) => page.results ?? []);
}

function executeSqlFile(path: string): void {
  execFileSync("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env!, "--remote", "--file", path, "--yes",
  ], {
    cwd: process.cwd(),
    env: childEnv,
    maxBuffer: 256 * 1024 * 1024,
    stdio: "inherit",
  });
}

function loadCatalogRows(): ReviewedRepositoryMetadataRow[] {
  return wranglerRows(`SELECT p.id, p.slug, p.name, p.project_kind, p.repository_url, p.revision, p.summary, p.description, p.license_spdx,
    p.visibility, p.status, p.updated_at, p.current_version_id, pv.rpps_json
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.deleted_at IS NULL
    ORDER BY p.slug`) as unknown as ReviewedRepositoryMetadataRow[];
}

function chunked<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function loadEvidenceState(expected: PreparedRepositoryMetadataEvidence[]): Map<string, EvidenceStateRow[]> {
  const byId = new Map<string, EvidenceStateRow[]>();
  for (const ids of chunked(expected.map((item) => item.evidenceId), 100)) {
    const rows = wranglerRows(`SELECT e.id AS evidence_id, e.source_type, e.source_url, e.title, e.publisher, e.retrieved_at, e.confidence, e.content_hash, e.excerpt,
      ec.id AS claim_id, ec.entity_type, ec.entity_id, ec.claim_key, ec.claim_value, ec.confidence AS claim_confidence
      FROM evidence e LEFT JOIN evidence_claims ec ON ec.evidence_id = e.id
      WHERE e.id IN (${ids.map(sqlString).join(", ")})`) as unknown as EvidenceStateRow[];
    for (const row of rows) {
      const current = byId.get(row.evidence_id) ?? [];
      current.push(row);
      byId.set(row.evidence_id, current);
    }
  }
  return byId;
}

function exactEvidenceState(
  state: Map<string, EvidenceStateRow[]>,
  projectId: string,
  evidence: PreparedRepositoryMetadataEvidence,
): boolean {
  const rows = state.get(evidence.evidenceId) ?? [];
  return rows.length === 1
    && rows[0].source_type === evidence.sourceType
    && rows[0].source_url === evidence.source.source_url
    && rows[0].title === evidence.title
    && rows[0].publisher === evidence.publisher
    && rows[0].retrieved_at === wave.reviewed_at
    && Number(rows[0].confidence) === evidence.confidence
    && rows[0].content_hash === evidence.contentHash
    && rows[0].excerpt === evidence.excerpt
    && rows[0].claim_id === evidence.claimId
    && rows[0].entity_type === "project"
    && rows[0].entity_id === projectId
    && rows[0].claim_key === `${evidence.field}.source`
    && rows[0].claim_value === evidence.value
    && Number(rows[0].claim_confidence) === evidence.confidence;
}

function noEvidenceState(state: Map<string, EvidenceStateRow[]>, evidence: PreparedRepositoryMetadataEvidence): boolean {
  return (state.get(evidence.evidenceId) ?? []).length === 0;
}

function empty(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

function rppsField(current: Record<string, unknown>, field: ReviewedMetadataField): unknown {
  return field === "license_spdx" ? current.license : current[field];
}

function exactRppsEvidence(current: Record<string, unknown>, evidence: PreparedRepositoryMetadataEvidence): boolean {
  const list = Array.isArray(current.evidence) ? current.evidence : [];
  const matches = list.filter((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const item = candidate as Record<string, unknown>;
    return item.claim === evidence.excerpt
      && item.source_type === evidence.sourceType
      && item.source_url === evidence.source.source_url
      && item.retrieved_at === wave.reviewed_at
      && Number(item.confidence) === evidence.confidence;
  });
  return matches.length === 1;
}

function prepareProject(
  definition: ReviewedRepositoryMetadataDefinition,
  row: ReviewedRepositoryMetadataRow,
  evidenceState: Map<string, EvidenceStateRow[]>,
): { project: PreparedReviewedRepositoryMetadata | null; alreadyApplied: boolean } {
  if (row.slug !== definition.slug || row.name !== definition.name || row.project_kind !== definition.project_kind) {
    throw new Error(`${definition.slug}: catalog identity changed`);
  }
  if (row.repository_url !== definition.repository_url || row.revision !== definition.revision) {
    throw new Error(`${definition.slug}: repository identity or pinned revision changed`);
  }
  if (row.visibility !== "public" || row.status !== "published") throw new Error(`${definition.slug}: project must remain public and published`);
  if (!row.current_version_id || !row.rpps_json) throw new Error(`${definition.slug}: current project version is missing`);

  const current = normalizeRppsForWrite(
    JSON.parse(row.rpps_json),
    publicOrigin(env!),
  ) as Record<string, unknown>;
  const evidence = prepareRepositoryMetadataEvidence(wave.wave, definition);
  for (const item of evidence) {
    if (item.source.derivation === "commercial-catalog-status" && current.docs_url !== item.source.source_url) {
      throw new Error(`${definition.slug}: commercial source page no longer matches RPPS docs_url`);
    }
  }

  const targetFields = evidence.map((item) => item.field);
  const exactColumns = targetFields.every((field) => {
    const column = field === "license_spdx" ? row.license_spdx : row[field];
    return column === definition.updates[field];
  });
  const exactRpps = targetFields.every((field) => rppsField(current, field) === definition.updates[field])
    && evidence.every((item) => exactRppsEvidence(current, item));
  const exactDbEvidence = evidence.every((item) => exactEvidenceState(evidenceState, row.id, item));
  if (exactColumns && exactRpps && exactDbEvidence) return { project: null, alreadyApplied: true };

  const pristineColumns = targetFields.every((field) => {
    const column = field === "license_spdx" ? row.license_spdx : row[field];
    return empty(column);
  });
  const pristineRpps = targetFields.every((field) => empty(rppsField(current, field)));
  const pristineEvidence = evidence.every((item) => noEvidenceState(evidenceState, item));
  if (!pristineColumns || !pristineRpps || !pristineEvidence) {
    throw new Error(`${definition.slug}: metadata state is neither pristine nor the exact reviewed wave`);
  }

  const nextSummary = definition.updates.summary ?? row.summary;
  const nextDescription = definition.updates.description ?? row.description;
  const nextLicenseSpdx = definition.updates.license_spdx ?? row.license_spdx;
  const priorEvidence = Array.isArray(current.evidence) ? current.evidence : [];
  const nextRpps = {
    ...current,
    summary: nextSummary ?? undefined,
    description: nextDescription ?? undefined,
    license: nextLicenseSpdx ?? undefined,
    evidence: [
      ...priorEvidence,
      ...evidence.map((item) => ({
        claim: item.excerpt,
        source_type: item.sourceType,
        source_url: item.source.source_url,
        retrieved_at: wave.reviewed_at,
        confidence: item.confidence,
      })),
    ],
  };
  let nextRppsJson: string;
  try {
    nextRppsJson = serializeReviewedRepositoryMetadataRpps(nextRpps as unknown as Record<string, unknown>);
  } catch (error) {
    throw new Error(`${definition.slug}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    alreadyApplied: false,
    project: {
      definition,
      row,
      nextSummary,
      nextDescription,
      nextLicenseSpdx,
      nextRppsJson,
      evidence,
    },
  };
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
          "user-agent": "RoboPartPicker reviewed metadata verification",
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
          "user-agent": "RoboPartPicker reviewed metadata verification",
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

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifySource(
  definition: ReviewedRepositoryMetadataDefinition,
  field: ReviewedMetadataField,
  source: ReviewedRepositoryMetadataSource,
): Promise<void> {
  if (source.derivation === "commercial-catalog-status") return;
  if (!definition.repository_url || !definition.revision) throw new Error(`${definition.slug}/${field}: pinned repository identity is missing`);
  const parts = githubRepositoryParts(definition.repository_url);
  if (!parts) throw new Error(`${definition.slug}/${field}: repository URL is not GitHub`);

  if (source.derivation === "readme-summary" || source.derivation === "readme-description") {
    const path = source.path!.split("/").map(encodeURIComponent).join("/");
    const result = await github(`repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}/contents/${path}?ref=${encodeURIComponent(definition.revision)}`);
    if (!result.ok) throw new Error(`${definition.slug}/${field}: README source returned ${githubFailure(result)}`);
    const data = result.data as { content?: string; path?: string };
    if (data.path !== source.path) throw new Error(`${definition.slug}/${field}: README source path changed`);
    const bytes = await githubFileBytes(data, parts.owner, parts.repo, definition.revision);
    if (bytes.byteLength !== source.size_bytes || digest(bytes) !== source.sha256) throw new Error(`${definition.slug}/${field}: README bytes failed size/hash verification`);
    const description = extractRepositoryDescription(bytes.toString("utf8"));
    const expected = source.derivation === "readme-summary" ? summarizeRepositoryText(description) : description;
    if (expected !== definition.updates[field]) throw new Error(`${definition.slug}/${field}: reviewed derivation no longer matches the source bytes`);
    return;
  }

  if (source.derivation === "github-repository-description") {
    const result = await github(`repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}`);
    if (!result.ok) throw new Error(`${definition.slug}/${field}: repository metadata returned ${githubFailure(result)}`);
    const data = result.data as { description?: string | null };
    const description = data.description?.trim() || "";
    const bytes = Buffer.from(description, "utf8");
    if (description !== definition.updates.description || bytes.byteLength !== source.size_bytes || digest(bytes) !== source.sha256) {
      throw new Error(`${definition.slug}/${field}: repository description changed after review`);
    }
    return;
  }

  const result = await github(`repos/${encodeURIComponent(parts.owner)}/${encodeURIComponent(parts.repo)}/license?ref=${encodeURIComponent(definition.revision)}`);
  if (source.derivation === "github-license-absence") {
    if (result.status !== 404) throw new Error(`${definition.slug}/${field}: a license is now detectable at the pinned revision`);
    return;
  }
  if (!result.ok) throw new Error(`${definition.slug}/${field}: license source returned ${githubFailure(result)}`);
  const data = result.data as { content?: string; path?: string; license?: { spdx_id?: string | null } };
  if (data.path !== source.path) throw new Error(`${definition.slug}/${field}: license path changed`);
  const bytes = await githubFileBytes(data, parts.owner, parts.repo, definition.revision);
  const spdxId = data.license?.spdx_id?.trim() || "NOASSERTION";
  if (spdxId !== source.spdx_id || spdxId !== definition.updates.license_spdx
    || bytes.byteLength !== source.size_bytes || digest(bytes) !== source.sha256) {
    throw new Error(`${definition.slug}/${field}: license detection failed SPDX, size, or hash verification`);
  }
}

async function verifySources(): Promise<number> {
  const jobs = new Map<string, { definition: ReviewedRepositoryMetadataDefinition; field: ReviewedMetadataField; source: ReviewedRepositoryMetadataSource }>();
  for (const definition of wave.projects) {
    for (const item of prepareRepositoryMetadataEvidence(wave.wave, definition)) {
      const key = JSON.stringify([definition.repository_url, definition.revision, item.source]);
      jobs.set(key, { definition, field: item.field, source: item.source });
    }
  }
  const entries = [...jobs.values()];
  const errors: string[] = [];
  let cursor = 0;
  let completed = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= entries.length) return;
      const job = entries[index];
      try {
        await verifySource(job.definition, job.field, job.source);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
      completed += 1;
      if (completed % 10 === 0 || completed === entries.length) {
        console.log(`JCODE_PROGRESS ${JSON.stringify({ current: completed, total: entries.length, unit: "sources", message: `immutable metadata sources verified; ${errors.length} errors` })}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 10 }, () => worker()));
  if (errors.length) throw new Error(`Reviewed metadata source verification failed:\n${errors.join("\n")}`);
  return entries.length;
}

function gapRows(rows: ReviewedRepositoryMetadataRow[]): ReviewedRepositoryMetadataRow[] {
  return rows.filter((row) => empty(row.summary) || empty(row.description) || empty(row.license_spdx));
}

function writeSqlArtifacts(projects: PreparedReviewedRepositoryMetadata[], now: string): { forward: string[]; rollback: string[] } {
  const forward: string[] = [];
  const rollback: string[] = [];
  const stamp = now.replace(/[:.]/gu, "-");
  for (const [index, batch] of chunked(projects, batchSize).entries()) {
    const part = String(index + 1).padStart(3, "0");
    const forwardPath = join(scratch!, `reviewed-repository-metadata-${env}-${stamp}-part-${part}.sql`);
    const rollbackPath = join(scratch!, `rollback-reviewed-repository-metadata-${env}-${stamp}-part-${part}.sql`);
    writeFileSync(forwardPath, buildReviewedRepositoryMetadataForwardSql(batch, wave, now));
    writeFileSync(rollbackPath, buildReviewedRepositoryMetadataRollbackSql(batch, wave, now));
    forward.push(forwardPath);
    rollback.push(rollbackPath);
  }
  return { forward, rollback };
}

function verifyApplied(projects: PreparedReviewedRepositoryMetadata[]): void {
  const rows = loadCatalogRows();
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const expectedEvidence = projects.flatMap((project) => project.evidence);
  const state = loadEvidenceState(expectedEvidence);
  for (const [index, project] of projects.entries()) {
    const row = bySlug.get(project.row.slug);
    if (!row) throw new Error(`${project.row.slug}: postflight project missing`);
    if (row.summary !== project.nextSummary || row.description !== project.nextDescription || row.license_spdx !== project.nextLicenseSpdx || row.rpps_json !== project.nextRppsJson) {
      throw new Error(`${project.row.slug}: postflight normalized or RPPS metadata mismatch`);
    }
    if (!project.evidence.every((item) => exactEvidenceState(state, row.id, item))) throw new Error(`${project.row.slug}: postflight evidence mismatch`);
    if ((index + 1) % 25 === 0 || index + 1 === projects.length) {
      console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: projects.length, unit: "postflight projects", message: `${project.row.slug}: metadata and provenance verified` })}`);
    }
  }
  const remaining = gapRows(rows);
  if (remaining.length) throw new Error(`Postflight still found ${remaining.length} projects with empty metadata: ${remaining.slice(0, 20).map((row) => row.slug).join(", ")}`);
}

function verifyRolledBack(projects: PreparedReviewedRepositoryMetadata[]): void {
  const rows = loadCatalogRows();
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const state = loadEvidenceState(projects.flatMap((project) => project.evidence));
  for (const project of projects) {
    const row = bySlug.get(project.row.slug);
    if (!row) throw new Error(`${project.row.slug}: rollback project missing`);
    if (row.summary !== project.row.summary || row.description !== project.row.description || row.license_spdx !== project.row.license_spdx
      || row.updated_at !== project.row.updated_at || row.rpps_json !== project.row.rpps_json) {
      throw new Error(`${project.row.slug}: rollback did not restore original metadata`);
    }
    if (!project.evidence.every((item) => noEvidenceState(state, item))) throw new Error(`${project.row.slug}: rollback left deterministic evidence rows`);
  }
}

mkdirSync(scratch, { recursive: true });
const now = new Date().toISOString();
const stamp = now.replace(/[:.]/gu, "-");
const reportPath = join(scratch, `reviewed-repository-metadata-${env}-${stamp}.json`);

const catalogRows = loadCatalogRows();
const bySlug = new Map(catalogRows.map((row) => [row.slug, row]));
const waveSlugs = new Set(wave.projects.map((project) => project.slug));
const missingFromCatalog = wave.projects.filter((project) => !bySlug.has(project.slug)).map((project) => project.slug);
const missingFromWave = gapRows(catalogRows).filter((row) => !waveSlugs.has(row.slug)).map((row) => row.slug);
if (missingFromCatalog.length || missingFromWave.length) {
  throw new Error(`Reviewed wave no longer covers the exact production gap set: ${JSON.stringify({ missingFromCatalog, missingFromWave })}`);
}

const allExpectedEvidence = wave.projects.flatMap((definition) => prepareRepositoryMetadataEvidence(wave.wave, definition));
const evidenceState = loadEvidenceState(allExpectedEvidence);
const prepared: PreparedReviewedRepositoryMetadata[] = [];
const alreadyApplied: string[] = [];
for (const definition of wave.projects) {
  const row = bySlug.get(definition.slug)!;
  const result = prepareProject(definition, row, evidenceState);
  if (result.project) prepared.push(result.project);
  if (result.alreadyApplied) alreadyApplied.push(definition.slug);
}

const sourceVerified = await verifySources();
const artifacts = writeSqlArtifacts(prepared, now);
const report = {
  mode: apply ? "apply" : "dry-run",
  env,
  wave: wave.wave,
  reviewedAt: wave.reviewed_at,
  waveProjects: wave.projects.length,
  sourceVerified,
  prepared: prepared.length,
  alreadyApplied: alreadyApplied.length,
  updates: {
    summaries: prepared.filter((project) => project.definition.updates.summary).length,
    descriptions: prepared.filter((project) => project.definition.updates.description).length,
    licenses: prepared.filter((project) => project.definition.updates.license_spdx).length,
  },
  forwardSql: artifacts.forward,
  rollbackSql: artifacts.rollback,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));

if (!apply) {
  console.log("Dry run complete. Every external source was revalidated. No production writes were performed.");
  process.exit(0);
}
if (prepared.length === 0) {
  console.log("The exact reviewed repository metadata wave is already applied. No writes were needed.");
  process.exit(0);
}

try {
  for (const [index, path] of artifacts.forward.entries()) {
    executeSqlFile(path);
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: artifacts.forward.length, unit: "D1 batches", message: `applied metadata batch ${index + 1}` })}`);
  }
  verifyApplied(prepared);
  console.log(JSON.stringify({ applied: prepared.length, alreadyApplied: alreadyApplied.length, sourceVerified, report: reportPath, rollback: artifacts.rollback }, null, 2));
} catch (error) {
  let rollbackError: unknown = null;
  try {
    for (const path of [...artifacts.rollback].reverse()) executeSqlFile(path);
    verifyRolledBack(prepared);
  } catch (caught) {
    rollbackError = caught;
  }
  const originalMessage = error instanceof Error ? error.message : String(error);
  const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : rollbackError ? String(rollbackError) : "rollback verified";
  throw new Error(`Repository metadata apply failed: ${originalMessage}; ${rollbackMessage}`);
}
