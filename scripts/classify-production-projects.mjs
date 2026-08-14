#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyHarvestedProject } from "./project-kind-classifier.mjs";

const LISTS = ["/tmp/top300.ndjson", "/tmp/top300-1500.ndjson"];
const HARVEST_DIR = ".ingest/bom-harvest-2026-08-12";
const METADATA_CACHE = ".ingest/github-project-metadata-2026-08-14.json";
const OWNER = "robotics-catalog-import";
const APPLY = process.argv.includes("--apply");
const ENV_INDEX = process.argv.indexOf("--env");
const ENV = ENV_INDEX >= 0 ? process.argv[ENV_INDEX + 1] : null;
const SQL_BATCH = 100;

if (APPLY && ENV !== "production") throw new Error("production writes require --apply --env production");
if (!APPLY && ENV && ENV !== "production") throw new Error("--env must be production when supplied");

const sql = (value) => `'${String(value).replace(/'/g, "''")}'`;
const rows = LISTS.flatMap((file) => readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse));
const rowBySlug = new Map(rows.map((row) => [row.slug, row]));
const metadata = JSON.parse(readFileSync(METADATA_CACHE, "utf8"));
const classified = [];

for (const file of readdirSync(HARVEST_DIR).filter((name) => name.startsWith("manifest-") && name.endsWith(".json")).sort()) {
  const record = JSON.parse(readFileSync(join(HARVEST_DIR, file), "utf8"));
  const row = rowBySlug.get(record.slug);
  if (!row) continue;
  const result = classifyHarvestedProject(record, metadata[row.id] ?? null);
  classified.push({ ...row, ...result });
}

const counts = Object.fromEntries(["physical_design", "robotics_software", "commercial_showcase", "unknown"].map((kind) => [kind, classified.filter((row) => row.kind === kind).length]));
const statements = classified.map((row) => `UPDATE projects SET project_kind = ${sql(row.kind)} WHERE id = ${sql(row.id)} AND owner_user_id = ${sql(OWNER)}`);
const sqlPath = "/tmp/classify-production-projects.sql";
writeFileSync(sqlPath, `${statements.map((statement) => `${statement};`).join("\n")}\n`);
console.log("SUMMARY", JSON.stringify({ rows: rows.length, classified: classified.length, counts, sqlPath }));
for (const kind of ["physical_design", "robotics_software", "unknown"]) {
  console.log(`${kind}: ${classified.filter((row) => row.kind === kind).slice(0, 12).map((row) => row.slug).join(", ")}`);
}

if (!APPLY) {
  console.log("DRY RUN ONLY. Review the SQL artifact, then rerun with --apply --env production.");
  process.exit(0);
}

function credentialsEnvironment() {
  const env = { ...process.env };
  for (const line of readFileSync("/root/.cloudflare/credentials", "utf8").split("\n")) {
    const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/);
    if (match) env[match[1]] = match[2];
  }
  env.CLOUDFLARE_API_TOKEN = env.CF_API_TOKEN;
  env.CLOUDFLARE_ACCOUNT_ID = env.CF_ACCOUNT_ID;
  return env;
}

const env = credentialsEnvironment();
for (let start = 0; start < statements.length; start += SQL_BATCH) {
  const batch = statements.slice(start, start + SQL_BATCH);
  const file = `/tmp/classify-production-projects-${String(start / SQL_BATCH).padStart(3, "0")}.sql`;
  writeFileSync(file, `${batch.map((statement) => `${statement};`).join("\n")}\n`);
  execFileSync("node_modules/.bin/wrangler", ["d1", "execute", "DB", "--env", "production", "--remote", "--file", file], {
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
  console.log(`applied ${Math.min(start + batch.length, statements.length)}/${statements.length}`);
}
console.log("DONE", JSON.stringify({ classified: classified.length, counts }));
