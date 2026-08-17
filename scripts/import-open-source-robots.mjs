#!/usr/bin/env node
// Import harvested open-source robot hardware repos into D1 as metadata-only
// physical_design projects. Idempotent: skips any upstream_identity or slug
// already present. Uses the Cloudflare D1 REST API directly for reliability.
//
// Usage: node scripts/import-open-source-robots.mjs [--env production] [--apply]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENV_INDEX = process.argv.indexOf("--env");
const ENV = ENV_INDEX >= 0 ? process.argv[ENV_INDEX + 1] : "production";
const APPLY = process.argv.includes("--apply");
const OWNER = "robotics-catalog-import";
const DB_IDS = {
  production: "10c57e79-e34f-4643-8c4e-4f0c7968a74d",
  preview: "af9e3aaa-4e74-4083-8317-a642bf0e07a6",
};
const DB = DB_IDS[ENV];
if (!DB) throw new Error("--env must be production or preview");

const SCRATCH = process.env.JCODE_SCRATCH_DIR ?? "/root/.jcode/scratch";
const NDJSON = join(SCRATCH, "open-source-robots.ndjson");

function loadCreds() {
  const env = { ...process.env };
  for (const line of readFileSync("/root/.cloudflare/credentials", "utf8").split("\n")) {
    const m = line.match(/^export\s+([A-Z_]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const creds = loadCreds();
const API = `https://api.cloudflare.com/client/v4/accounts/${creds.CF_ACCOUNT_ID}/d1/database/${DB}/query`;

async function d1(sql) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.CF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      const json = await res.json();
      if (!json.success) throw new Error(JSON.stringify(json.errors).slice(0, 400));
      return json.result;
    } catch (error) {
      if (attempt === 7) throw error;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const sqlString = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const sqlNumber = (v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "NULL");

function canonicalUpstream(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return url.replace(/\.git$/i, "").toLowerCase();
  }
}

function stableId(prefix, seed) {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
  }
  const hex = `${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
  return `${prefix}_${hex}${hex}`.slice(0, prefix.length + 1 + 32);
}

function buildStatements(c, now) {
  const upstream = canonicalUpstream(c.repository_url);
  const projectId = c.id;
  const versionId = stableId("pver", `${projectId}:version:${c.revision || c.default_branch || "head"}`);
  const tags = Array.from(new Set([c.category, "open-source", ...(c.topics ?? [])])).slice(0, 15);
  const rpps = {
    rpps_version: "1.0.0",
    name: c.name,
    slug: c.slug,
    version: "0.1.0",
    summary: c.summary,
    license: c.license ?? undefined,
    repo_url: c.repository_url,
    project_kind: "physical_design",
    robot_category: c.category,
    tags,
    bom: [],
    reproducibility: { access: "open-source", design_files: false, bom: false, cad: false, assembly: false, pricing: false },
  };
  const rppsJson = JSON.stringify(rpps);
  const body = `${c.summary}`;

  const projectInsert = `INSERT INTO projects (id, slug, name, summary, description, owner_user_id, organization_id, visibility, status, current_version_id, license_spdx, repository_url, difficulty, estimated_cost_minor, estimated_cost_currency, is_demo, version, upstream_url, upstream_identity, maintainer, revision, ingested_at, last_checked_at, publishability, github_stars, project_kind, robot_category, created_at, updated_at) VALUES (${sqlString(projectId)}, ${sqlString(c.slug)}, ${sqlString(c.name)}, ${sqlString(c.summary)}, NULL, '${OWNER}', NULL, 'public', 'published', ${sqlString(versionId)}, ${sqlString(c.license ?? null)}, ${sqlString(c.repository_url)}, NULL, NULL, NULL, 0, 1, ${sqlString(c.repository_url)}, ${sqlString(upstream)}, ${sqlString(c.maintainer ?? null)}, ${sqlString(c.revision || null)}, ${sqlString(now)}, ${sqlString(now)}, 'review', ${sqlNumber(c.stars ?? null)}, 'physical_design', ${sqlString(c.category)}, ${sqlString(now)}, ${sqlString(now)});`;
  const versionInsert = `INSERT INTO project_versions (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at) VALUES (${sqlString(versionId)}, ${sqlString(projectId)}, '0.1.0', '1.0.0', 'Imported from the open-source robot hardware harvest. Metadata only; CAD, BOM, files, and assembly evidence are pending enrichment.', ${sqlString(rppsJson)}, 'published', '${OWNER}', ${sqlString(now)}, ${sqlString(now)});`;
  const searchDelete = `DELETE FROM search_index WHERE entity_type = 'project' AND entity_id = ${sqlString(projectId)};`;
  const searchInsert = `INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('project', ${sqlString(projectId)}, ${sqlString(c.name)}, ${sqlString(body)}, ${sqlString(tags.join(" "))});`;
  return [projectInsert, versionInsert, searchDelete, searchInsert];
}

async function main() {
  const candidates = readFileSync(NDJSON, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  if (candidates.length === 0) throw new Error(`No candidates found at ${NDJSON}`);

  const existingRows = (await d1("SELECT id, slug, lower(repository_url) AS repo, lower(upstream_identity) AS upstream FROM projects WHERE deleted_at IS NULL;")).map((r) => r.results ?? []).flat();
  const existingUpstream = new Set(existingRows.map((r) => (r.upstream ?? r.repo ?? "").toLowerCase()).filter(Boolean));
  const existingSlugs = new Set(existingRows.map((r) => r.slug?.toLowerCase()).filter(Boolean));

  const fresh = [];
  for (const c of candidates) {
    const upstream = canonicalUpstream(c.repository_url);
    if (existingUpstream.has(upstream.toLowerCase())) continue;
    if (existingSlugs.has(c.slug.toLowerCase())) continue;
    fresh.push(c);
    existingUpstream.add(upstream.toLowerCase());
    existingSlugs.add(c.slug.toLowerCase());
  }

  console.log(`candidates ${candidates.length}; new ${fresh.length}; skipped ${candidates.length - fresh.length}`);

  const now = new Date().toISOString();
  const statements = fresh.flatMap((c) => buildStatements(c, now));
  console.log(`total statements ${statements.length}`);

  if (!APPLY) {
    const out = join(SCRATCH, "open-source-robots-import.sql");
    writeFileSync(out, statements.join("\n"));
    console.log(`DRY RUN: wrote ${out}. Re-run with --apply to execute.`);
    return;
  }

  const BATCH = 60; // statements per REST request (15 projects)
  let done = 0;
  for (let start = 0; start < statements.length; start += BATCH) {
    const batch = statements.slice(start, start + BATCH);
    const sql = batch.join("\n");
    await d1(sql);
    done += batch.length;
    process.stdout.write(`JCODE_PROGRESS ${JSON.stringify({ current: done, total: statements.length, unit: "statements", message: `imported ${done} statements` })}\n`);
  }
  console.log("DONE", JSON.stringify({ projects: fresh.length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
