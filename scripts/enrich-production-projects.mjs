#!/usr/bin/env node
// Enrich the imported production project corpus with official GitHub repository
// metadata and project-card imagery. The operation is idempotent and bounded:
// it updates only records owned by the robotics catalog importer.
//
// Usage:
//   node scripts/enrich-production-projects.mjs          # fetch/cache + dry-run SQL
//   node scripts/enrich-production-projects.mjs --apply  # execute against production D1
//   node scripts/enrich-production-projects.mjs --refresh # ignore metadata cache
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const LISTS = ["/tmp/top300.ndjson", "/tmp/top300-1500.ndjson"];
const CACHE = ".ingest/github-project-metadata-2026-08-14.json";
const OWNER = "robotics-catalog-import";
const APPLY = process.argv.includes("--apply");
const REFRESH = process.argv.includes("--refresh");
const GRAPHQL_BATCH = 40;
const SQL_BATCH = 80;

const sql = (value) => `'${String(value).replace(/'/g, "''")}'`;
const json = (value) => JSON.stringify(value);

function repositoryCoordinates(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== "github.com") return null;
    const [owner, name] = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").split("/");
    if (!owner || !name) return null;
    return { owner, name };
  } catch {
    return null;
  }
}

function rows() {
  const result = [];
  const seen = new Set();
  for (const path of LISTS) {
    for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
      const row = JSON.parse(line);
      const coordinates = repositoryCoordinates(row.repository_url);
      if (!coordinates || seen.has(row.id)) continue;
      seen.add(row.id);
      result.push({ ...row, ...coordinates });
    }
  }
  return result;
}

function fetchMetadata(projects) {
  if (!REFRESH && existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, "utf8"));
  const output = {};
  for (let start = 0; start < projects.length; start += GRAPHQL_BATCH) {
    const batch = projects.slice(start, start + GRAPHQL_BATCH);
    const fields = batch.map((row, index) => `r${index}: repository(owner: ${json(row.owner)}, name: ${json(row.name)}) {
      nameWithOwner description homepageUrl openGraphImageUrl isArchived isDisabled updatedAt
      owner { login }
      licenseInfo { spdxId }
      defaultBranchRef { target { ... on Commit { oid committedDate } } }
      repositoryTopics(first: 10) { nodes { topic { name } } }
    }`).join("\n");
    const query = `query ProjectMetadata { ${fields} }`;
    let response;
    try {
      response = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    } catch (error) {
      const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout || "") : "";
      if (!stdout) throw error;
      response = JSON.parse(stdout);
    }
    batch.forEach((row, index) => {
      const repository = response.data?.[`r${index}`];
      if (repository) output[row.id] = repository;
    });
    console.log(`metadata ${Math.min(start + batch.length, projects.length)}/${projects.length}`);
  }
  mkdirSync(".ingest", { recursive: true });
  writeFileSync(CACHE, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

function publishability(license, maintainer, revision) {
  if (!license || !maintainer) return "incomplete";
  if (!revision) return "review";
  return "ready";
}

function statementsFor(row, repository) {
  const summary = repository.description?.trim().slice(0, 280) || null;
  const license = repository.licenseInfo?.spdxId && repository.licenseInfo.spdxId !== "NOASSERTION" ? repository.licenseInfo.spdxId : null;
  const maintainer = repository.owner?.login?.trim() || row.owner;
  const revision = repository.defaultBranchRef?.target?.oid || null;
  const docsUrl = repository.homepageUrl?.trim() || null;
  const cover = repository.openGraphImageUrl?.trim() || `https://opengraph.githubassets.com/robopartpicker/${row.owner}/${row.name}`;
  const topics = (repository.repositoryTopics?.nodes ?? []).map((node) => node?.topic?.name).filter(Boolean).slice(0, 10);
  const checked = new Date().toISOString();
  const state = publishability(license, maintainer, revision);
  const projectUpdate = `UPDATE projects SET
    summary = ${summary ? sql(summary) : "summary"},
    license_spdx = COALESCE(license_spdx, ${license ? sql(license) : "NULL"}),
    maintainer = ${sql(maintainer)},
    revision = ${revision ? sql(revision) : "revision"},
    last_checked_at = ${sql(checked)},
    publishability = ${sql(state)}
    WHERE id = ${sql(row.id)} AND owner_user_id = ${sql(OWNER)}`;

  const rppsPairs = [
    ["$.cover_image_url", cover],
    ["$.summary", summary],
    ["$.license", license],
    ["$.docs_url", docsUrl],
    ["$.tags", topics],
    ["$.authors", [{ name: maintainer, role: "upstream owner", url: `https://github.com/${row.owner}` }]],
  ].filter(([, value]) => value !== null && (!(Array.isArray(value)) || value.length > 0));
  const args = rppsPairs.flatMap(([path, value]) => [sql(path), `json(${sql(JSON.stringify(value))})`]);
  const versionUpdate = args.length ? `UPDATE project_versions SET rpps_json = json_set(rpps_json, ${args.join(", ")})
    WHERE project_id = ${sql(row.id)} AND id = (SELECT current_version_id FROM projects WHERE id = ${sql(row.id)} AND owner_user_id = ${sql(OWNER)})` : null;
  return [projectUpdate, versionUpdate].filter(Boolean);
}

function credentialsEnvironment() {
  const env = { ...process.env };
  const credentials = readFileSync("/root/.cloudflare/credentials", "utf8");
  for (const line of credentials.split("\n")) {
    const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/);
    if (match) env[match[1]] = match[2];
  }
  env.CLOUDFLARE_API_TOKEN = env.CF_API_TOKEN;
  env.CLOUDFLARE_ACCOUNT_ID = env.CF_ACCOUNT_ID;
  return env;
}

function main() {
  const projects = rows();
  const metadata = fetchMetadata(projects);
  const statements = projects.flatMap((row) => metadata[row.id] ? statementsFor(row, metadata[row.id]) : []);
  const summary = {
    projects: projects.length,
    metadata: Object.keys(metadata).length,
    statements: statements.length,
    withSummary: Object.values(metadata).filter((value) => value.description).length,
    withLicense: Object.values(metadata).filter((value) => value.licenseInfo?.spdxId && value.licenseInfo.spdxId !== "NOASSERTION").length,
    withCover: Object.values(metadata).filter((value) => value.openGraphImageUrl).length,
    withRevision: Object.values(metadata).filter((value) => value.defaultBranchRef?.target?.oid).length,
  };
  console.log("SUMMARY", JSON.stringify(summary));
  const render = (items) => `${items.map((item) => `${item.trim().replace(/;$/, "")};`).join("\n")}\n`;
  if (!APPLY) {
    writeFileSync("/tmp/enrich-production-projects.sql", render(statements));
    console.log("dry run: wrote /tmp/enrich-production-projects.sql (add --apply to execute)");
    return;
  }

  const env = credentialsEnvironment();
  for (let start = 0; start < statements.length; start += SQL_BATCH) {
    const batch = statements.slice(start, start + SQL_BATCH);
    const file = `/tmp/enrich-production-projects-${String(start / SQL_BATCH).padStart(3, "0")}.sql`;
    writeFileSync(file, render(batch));
    execFileSync("node_modules/.bin/wrangler", ["d1", "execute", "DB", "--env", "production", "--remote", "--file", file], { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] });
    console.log(`applied ${Math.min(start + batch.length, statements.length)}/${statements.length}`);
  }
  console.log("DONE", JSON.stringify(summary));
}

main();
