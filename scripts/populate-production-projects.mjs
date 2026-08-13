#!/usr/bin/env node
// Populate production D1 with harvested real robotics projects.
// Idempotent: skips slugs that already exist. Generates SQL in chunks and
// executes them via `wrangler d1 execute --remote --file` (optionally --apply).
//
// Usage: node scripts/populate-production-projects.mjs [--apply]
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const HARVEST = "/root/robopartpicker/.ingest/bom-harvest-2026-08-12";
const LISTS = ["/tmp/top300.ndjson", "/tmp/top300-1500.ndjson"];
const APPLY = process.argv.includes("--apply");
const ENV = "production";
const OWNER = "robotics-catalog-import";
const CHUNK = 50; // statements per wrangler invocation (D1 query payload limit)
const SYSTEM_USER = `INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
  VALUES ('robotics-catalog-import', 'Open Source Robotics Catalog', 'robotics-catalog@robopartpicker.local', 0, '2026-08-13', '2026-08-13');`;

const sq = (s) => String(s ?? "").replace(/'/g, "''");
const j = (v) => JSON.stringify(v);

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }

function slugOk(slug) { return /^[a-z0-9-]{2,80}$/.test(slug ?? ""); }

function cleanText(raw) {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(/```[\s\S]*?```/g, " ");            // fenced code
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");       // images
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");     // links -> text
  s = s.replace(/<[^>]+>/g, " ");                     // HTML tags
  s = s.replace(/[#>*_`~|]/g, " ");                   // markdown sigils
  s = s.replace(/&[a-z#0-9]+;/gi, " ");               // entities
  return s.replace(/\s+/g, " ").trim();
}

function mapBom(components) {
  const out = [];
  for (const c of components ?? []) {
    if (!c || !c.name) continue;
    const name = String(c.name).slice(0, 500);
    if (!name) continue;
    const qty = Math.max(1, Math.min(100000, Math.round(Number(c.quantity ?? 1) || 1)));
    const item = { name, qty };
    if (c.manufacturer) item.manufacturer = String(c.manufacturer).slice(0, 120);
    if (c.mpn) item.mpn = String(c.mpn).slice(0, 120);
    if (c.fabricated) item.fabricated = true;
    if (c.optional) item.optional = true;
    out.push(item);
  }
  return out;
}

function completenessFor(c) {
  if (c.fabricated) return "custom-fabricated";
  if (c.manufacturer && c.mpn) return "verified";
  if (c.manufacturer || c.mpn) return "probable";
  return "unresolved";
}

function buildStatements(listRow, manifest) {
  const slug = listRow.slug;
  const projectId = listRow.id;
  const draft = manifest.analysis?.draft ?? {};
  const comps = (manifest.analysis?.manifest?.components ?? []).filter((c) => c && c.name);
  const name = (draft.name || slug || "Imported project").slice(0, 500);
  const summary = cleanText(draft.summary).slice(0, 280) || null;
  const description = (draft.description || "").slice(0, 8000) || null;
  const repoUrl = draft.repo_url || listRow.repository_url || null;
  const stars = Number(listRow.stars ?? manifest.stars ?? 0) || null;
  const license = draft.license || null;
  const tags = Array.isArray(draft.tags) ? draft.tags.slice(0, 20) : [];
  const bom = mapBom(comps);
  const version = "0.1.0";
  const now = "2026-08-13T00:00:00.000Z";

  const rpps = {
    rpps_version: "1.0.0",
    name,
    slug,
    version,
    summary: summary ?? undefined,
    description: description ?? undefined,
    license: license ?? undefined,
    repo_url: repoUrl ?? undefined,
    tags,
    bom,
  };
  const versionId = `hv-${projectId}`;
  const rppsJson = j(rpps);

  const stmts = [];
  stmts.push(`INSERT OR IGNORE INTO projects
    (id, slug, name, summary, description, owner_user_id, organization_id, visibility, status,
     current_version_id, license_spdx, repository_url, difficulty, estimated_cost_minor,
     estimated_cost_currency, is_demo, version, upstream_url, upstream_identity, maintainer, revision,
     ingested_at, last_checked_at, publishability, github_stars, created_at, updated_at)
    VALUES ('${projectId}', '${sq(slug)}', '${sq(name)}', ${summary ? `'${sq(summary)}'` : "NULL"}, ${description ? `'${sq(description)}'` : "NULL"},
     '${OWNER}', NULL, 'public', 'published', '${versionId}', ${license ? `'${sq(license)}'` : "NULL"},
     ${repoUrl ? `'${sq(repoUrl)}'` : "NULL"}, NULL, NULL, NULL, 0, 1,
     ${repoUrl ? `'${sq(repoUrl)}'` : "NULL"}, ${repoUrl ? `'${sq(repoUrl.replace(/\.git$/i, "").toLowerCase())}'` : "NULL"},
     NULL, NULL, '${now}', '${now}', 'review', ${stars === null ? "NULL" : stars}, '${now}', '${now}')`);

  stmts.push(`INSERT OR IGNORE INTO project_versions
    (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at)
    VALUES ('${versionId}', '${projectId}', '${version}', '1.0.0', 'Imported from the open-source robotics catalog',
     '${sq(rppsJson)}', 'published', NULL, '${now}', '${now}')`);

  if (bom.length) {
    const bomId = `project-bom-${projectId}`;
    const bomVersionId = `hbv-${projectId}`;
    stmts.push(`INSERT OR IGNORE INTO boms
      (id, project_id, owner_user_id, organization_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
      VALUES ('${bomId}', '${projectId}', '${OWNER}', NULL, '${sq(slug)}-bom', '${sq(name)} BOM', '${bomVersionId}', 'public', 0, '${now}', '${now}')`);
    stmts.push(`INSERT OR IGNORE INTO bom_versions
      (id, bom_id, version_label, notes, currency, created_by_user_id, created_at)
      VALUES ('${bomVersionId}', '${bomId}', '${version}', 'Generated from the published RPPS package', 'USD', NULL, '${now}')`);
    bom.forEach((item, i) => {
      const c = comps[i] ?? {};
      stmts.push(`INSERT OR IGNORE INTO bom_items
        (id, bom_version_id, component_id, slot_key, description, quantity, unit, selected_supplier_offer_id,
         target_unit_price_minor, notes, extraction_method, completeness, evidence_locator, confidence, sort_order)
        VALUES ('hbi-${projectId}-${i}', '${bomVersionId}', NULL, '${sq(item.name).slice(0, 120)}', '${sq(item.name)}', ${item.qty}, 'each',
         NULL, NULL, NULL, 'explicit-bom', '${completenessFor(c)}', ${repoUrl ? `'${sq(repoUrl)}'` : "NULL"}, NULL, ${i})`);
    });
  }
  return { stmts, withBom: bom.length > 0, bomCount: bom.length };
}

function main() {
  const listRows = [];
  for (const list of LISTS) {
    for (const line of readFileSync(list, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      if (slugOk(r.slug)) listRows.push(r);
    }
  }
  const manifestBySlug = new Map();
  for (const f of readdirSync(HARVEST)) {
    if (!f.startsWith("manifest-") || !f.endsWith(".json")) continue;
    const d = readJson(join(HARVEST, f));
    if (d.ok && d.slug) manifestBySlug.set(d.slug, d);
  }

  const chunks = [];
  let current = [SYSTEM_USER];
  let projects = 0;
  let bomProjects = 0;
  let totalBom = 0;
  for (const row of listRows) {
    const manifest = manifestBySlug.get(row.slug);
    if (!manifest) continue;
    const { stmts, withBom, bomCount } = buildStatements(row, manifest);
    projects += 1;
    if (withBom) { bomProjects += 1; totalBom += bomCount; }
    for (const s of stmts) {
      current.push(s);
      if (current.length >= CHUNK) { chunks.push(current); current = []; }
    }
  }
  if (current.length) chunks.push(current);

  mkdirSync("/tmp", { recursive: true });
  const render = (statements) => statements.map((s) => (s.trimEnd().endsWith(";") ? s : `${s};`)).join("\n");
  const summary = { projects, bomProjects, totalBom, chunks: chunks.length, statements: chunks.reduce((n, c) => n + c.length, 0) };
  console.log("SUMMARY", JSON.stringify(summary));
  if (!APPLY) {
    writeFileSync("/tmp/populate-projects-dry.sql", render(chunks.flat()));
    console.log("dry run: wrote /tmp/populate-projects-dry.sql (add --apply to execute)");
    return;
  }

  const creds = readFileSync("/root/.cloudflare/credentials", "utf8");
  const env = { ...process.env };
  for (const line of creds.split("\n")) {
    const m = line.match(/^export\s+([A-Z_]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  env.CLOUDFLARE_API_TOKEN = env.CF_API_TOKEN;
  env.CLOUDFLARE_ACCOUNT_ID = env.CF_ACCOUNT_ID;

  chunks.forEach((chunk, i) => {
    const file = `/tmp/populate-projects-${String(i).padStart(3, "0")}.sql`;
    writeFileSync(file, render(chunk));
    console.log(`executing chunk ${i + 1}/${chunks.length} (${chunk.length} stmts)`);
    const out = execFileSync("node_modules/.bin/wrangler",
      ["d1", "execute", "DB", "--env", ENV, "--remote", "--file", file],
      { env, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
    console.log(out.slice(-200));
  });
  console.log("DONE");
}

main();
