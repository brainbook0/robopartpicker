import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  validateReviewedProjectFileDedupeWave,
  type ReviewedProjectFileDedupeDecision,
  type ReviewedProjectFileDedupeSource,
  type ReviewedProjectFileDedupeWave,
  type ReviewedProjectFileLink,
  type ReviewedProjectMediaRelink,
} from "../src/lib/reviewed-project-file-dedupe";
import { sqlString } from "../src/lib/physical-design-wave-import";

type EnvName = "production" | "preview";
type DuplicateRow = {
  project_id: string;
  slug: string;
  current_version_id: string;
  repository_url: string | null;
  revision: string | null;
  path_key: string;
  file_id: string;
  project_version_id: string;
  purpose: string;
  relative_path: string;
  link_created_at: string;
  object_key: string;
  original_name: string;
  media_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  kind: string;
  status: string;
  visibility: string;
};
type MediaRow = {
  id: string;
  project_id: string;
  file_id: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
};

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : "production";
const outputIndex = args.indexOf("--output");
const output = resolve(outputIndex >= 0 ? args[outputIndex + 1] : "data/project-waves/2026-08-20-reviewed-project-file-dedupe.json");
const write = args.includes("--write");
if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/prepare-reviewed-project-file-dedupe.ts [--env production|preview] [--output path] [--write]");
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
    // Wrangler may already have credentials from the caller.
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
function wranglerRows(command: string): Array<Record<string, unknown>> {
  const output = execFileSync("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env, "--remote", "--command", command, "--json", "--yes",
  ], {
    cwd: process.cwd(),
    env: childEnv,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed.flatMap((page) => page.results ?? []);
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function githubRawUrl(repositoryUrl: string, revision: string, path: string): string {
  const url = new URL(repositoryUrl);
  const parts = url.pathname.replace(/\.git$/iu, "").replace(/^\/+|\/+$/gu, "").split("/");
  if (url.hostname.toLowerCase() !== "github.com" || parts.length !== 2 || parts.some((part) => !part)) {
    throw new Error(`Unsupported repository URL ${repositoryUrl}`);
  }
  return `https://raw.githubusercontent.com/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/${revision}/${encodedPath(path)}`;
}

async function fetchPinnedSource(sourceUrl: string, expectedSize: number, expectedSha: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${sourceUrl}?review=${Date.now()}`, { headers: { accept: "application/octet-stream" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== expectedSize || sha !== expectedSha) {
        throw new Error(`source bytes ${bytes.byteLength}/${sha} != ${expectedSize}/${expectedSha}`);
      }
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 500));
    }
  }
  throw lastError;
}

function toLink(row: DuplicateRow): ReviewedProjectFileLink {
  if (!row.checksum_sha256) throw new Error(`${row.slug}/${row.relative_path}/${row.file_id}: missing checksum_sha256`);
  return {
    project_id: row.project_id,
    project_version_id: row.project_version_id,
    file_id: row.file_id,
    purpose: row.purpose,
    relative_path: row.relative_path,
    created_at: row.link_created_at,
    object_key: row.object_key,
    original_name: row.original_name,
    media_type: row.media_type,
    size_bytes: Number(row.size_bytes),
    checksum_sha256: row.checksum_sha256,
    kind: row.kind,
    status: row.status as "ready",
    visibility: row.visibility as "public",
  };
}

const duplicateRows = wranglerRows(`WITH duplicate_paths AS (
  SELECT pf.project_id, lower(pf.relative_path) AS path_key
  FROM project_files pf
  JOIN projects p ON p.id = pf.project_id
  JOIN files f ON f.id = pf.file_id
  WHERE p.deleted_at IS NULL AND f.deleted_at IS NULL AND pf.relative_path IS NOT NULL
    AND (pf.project_version_id IS NULL OR pf.project_version_id = p.current_version_id)
  GROUP BY pf.project_id, lower(pf.relative_path)
  HAVING COUNT(*) > 1
)
SELECT p.id AS project_id, p.slug, p.current_version_id, p.repository_url, p.revision,
  d.path_key, pf.file_id, pf.project_version_id, pf.purpose, pf.relative_path, pf.created_at AS link_created_at,
  f.object_key, f.original_name, f.media_type, f.size_bytes, f.checksum_sha256, f.kind, f.status, f.visibility
FROM duplicate_paths d
JOIN projects p ON p.id = d.project_id
JOIN project_files pf ON pf.project_id = p.id AND lower(pf.relative_path) = d.path_key
JOIN files f ON f.id = pf.file_id
WHERE f.deleted_at IS NULL AND (pf.project_version_id IS NULL OR pf.project_version_id = p.current_version_id)
ORDER BY p.slug, d.path_key, pf.created_at, pf.file_id`) as unknown as DuplicateRow[];

const grouped = new Map<string, DuplicateRow[]>();
for (const row of duplicateRows) {
  const key = `${row.project_id}\0${row.path_key}`;
  const current = grouped.get(key) ?? [];
  current.push(row);
  grouped.set(key, current);
}
const projectIds = [...new Set(duplicateRows.map((row) => row.project_id))];
const mediaRows = projectIds.length === 0 ? [] : wranglerRows(`SELECT id, project_id, file_id, caption, alt_text, sort_order, created_at
  FROM project_media WHERE project_id IN (${projectIds.map(sqlString).join(", ")}) ORDER BY project_id, sort_order, id`) as unknown as MediaRow[];
const mediaByFile = new Map<string, MediaRow[]>();
for (const media of mediaRows) {
  const key = `${media.project_id}\0${media.file_id}`;
  const current = mediaByFile.get(key) ?? [];
  current.push(media);
  mediaByFile.set(key, current);
}

const decisions: ReviewedProjectFileDedupeDecision[] = [];
for (const rows of grouped.values()) {
  if (rows.length !== 2) throw new Error(`${rows[0]?.slug}/${rows[0]?.path_key}: expected exactly two current links, found ${rows.length}`);
  const direct = rows.filter((row) => row.object_key.startsWith("harvest-file:"));
  const old = rows.filter((row) => row.object_key.startsWith("catalog-completeness/"));
  if (direct.length !== 1 || old.length !== 1) {
    throw new Error(`${rows[0].slug}/${rows[0].path_key}: expected one direct harvest and one catalog-completeness object`);
  }
  const keep = toLink(direct[0]);
  const drop = toLink(old[0]);
  const sameContent = keep.checksum_sha256 === drop.checksum_sha256 && keep.size_bytes === drop.size_bytes;
  let source: ReviewedProjectFileDedupeSource;
  if (sameContent) {
    source = {
      mode: "managed_exact_duplicate",
      canonical_object_provenance: "direct_harvest",
      checksum_sha256: keep.checksum_sha256,
      size_bytes: keep.size_bytes,
    };
  } else {
    const row = direct[0];
    if (row.slug !== "flix" || row.path_key !== "docs/book/firmware.md") {
      throw new Error(`${row.slug}/${row.path_key}: unreviewed conflicting duplicate content`);
    }
    if (!row.repository_url) {
      throw new Error(`${row.slug}/${row.path_key}: missing repository identity`);
    }
    const revision = "03084a672ac30d2e8bc2ca513b4025c2961c1ad4";
    const sourceUrl = githubRawUrl(row.repository_url, revision, keep.relative_path);
    await fetchPinnedSource(sourceUrl, keep.size_bytes, keep.checksum_sha256);
    source = {
      mode: "pinned_repository_revision",
      repository_url: row.repository_url,
      revision,
      path: keep.relative_path,
      source_url: sourceUrl,
      checksum_sha256: keep.checksum_sha256,
      size_bytes: keep.size_bytes,
    };
  }
  const mediaRelinks: ReviewedProjectMediaRelink[] = (mediaByFile.get(`${drop.project_id}\0${drop.file_id}`) ?? []).map((media) => ({
    id: media.id,
    project_id: media.project_id,
    old_file_id: drop.file_id,
    new_file_id: keep.file_id,
    caption: media.caption,
    alt_text: media.alt_text,
    sort_order: Number(media.sort_order),
    created_at: media.created_at,
  }));
  decisions.push({
    slug: direct[0].slug,
    project_id: direct[0].project_id,
    project_version_id: direct[0].current_version_id,
    path_key: direct[0].path_key,
    source,
    keep,
    drop,
    media_relinks: mediaRelinks,
  });
}

decisions.sort((a, b) => a.slug.localeCompare(b.slug) || a.path_key.localeCompare(b.path_key));
const wave: ReviewedProjectFileDedupeWave = {
  wave: "reviewed-project-file-dedupe-2026-08-20",
  schema_version: 1,
  reviewed_at: new Date().toISOString(),
  contract: "For every current-version path collision, retain the direct source-harvest link, detach only the redundant catalog-completeness link, preserve both managed file records and R2 objects, and relink dependent project media before detaching its redundant link. Equal-content decisions are guarded by exact SHA-256 and size; the sole differing-content decision is pinned to the current upstream git revision.",
  expected: {
    projects: new Set(decisions.map((decision) => decision.project_id)).size,
    duplicate_groups: decisions.length,
    removed_links: decisions.length,
    media_relinks: decisions.reduce((total, decision) => total + decision.media_relinks.length, 0),
    conflicting_content_groups: decisions.filter((decision) => decision.source.mode === "pinned_repository_revision").length,
  },
  decisions,
};
const errors = validateReviewedProjectFileDedupeWave(wave);
if (errors.length) throw new Error(`Generated file dedupe wave failed validation:\n${errors.join("\n")}`);
const report = {
  env,
  projects: wave.expected.projects,
  duplicateGroups: wave.expected.duplicate_groups,
  exactContentGroups: decisions.filter((decision) => decision.source.mode === "managed_exact_duplicate").length,
  conflictingContentGroups: wave.expected.conflicting_content_groups,
  mediaRelinks: wave.expected.media_relinks,
  keepPurposes: Object.fromEntries([...new Set(decisions.map((decision) => decision.keep.purpose))].sort().map((purpose) => [purpose, decisions.filter((decision) => decision.keep.purpose === purpose).length])),
  output,
  wrote: write,
};
if (write) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(wave, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
