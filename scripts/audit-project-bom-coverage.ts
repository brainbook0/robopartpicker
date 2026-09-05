#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";

type EnvName = "local" | "preview" | "production";
const args = process.argv.slice(2);
const index = args.indexOf("--env");
const env = index >= 0 ? args[index + 1] as EnvName : undefined;
if (!env || !["local", "preview", "production"].includes(env)) {
  console.error("Usage: tsx scripts/audit-project-bom-coverage.ts --env local|preview|production");
  process.exit(2);
}

function query<T>(sql: string): T[] {
  const command = env === "local"
    ? ["d1", "execute", "robopartpicker", "--local", "--json", "--command", sql]
    : ["d1", "execute", "DB", "--env", env, "--remote", "--json", "--command", sql];
  const output = execFileSync("node_modules/.bin/wrangler", command, { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const parsed = JSON.parse(output) as Array<{ results?: T[] }>;
  return parsed.flatMap((page) => page.results ?? []);
}

const states = query<{ state: string; projects: number; lines: number }>(`SELECT bv.publication_state AS state,
    COUNT(DISTINCT b.project_id) AS projects, COUNT(bi.id) AS lines
  FROM boms b JOIN bom_versions bv ON bv.id = b.current_version_id
  LEFT JOIN bom_items bi ON bi.bom_version_id = bv.id
  WHERE b.is_demo = 0 GROUP BY bv.publication_state ORDER BY bv.publication_state`);
const checks = query<Record<string, number>>(`SELECT
  (SELECT COUNT(*) FROM projects p WHERE p.deleted_at IS NULL AND p.is_demo = 0 AND p.status = 'published' AND p.visibility IN ('public','unlisted')) AS catalog_projects,
  (SELECT COUNT(DISTINCT b.project_id) FROM boms b JOIN projects p ON p.id = b.project_id WHERE b.is_demo = 0 AND p.deleted_at IS NULL AND p.is_demo = 0 AND p.status = 'published' AND p.visibility IN ('public','unlisted')) AS projects_with_state,
  (SELECT COUNT(*) FROM boms b JOIN bom_versions bv ON bv.id = b.current_version_id JOIN bom_items bi ON bi.bom_version_id = bv.id WHERE b.is_demo = 0 AND bv.publication_state NOT IN ('verified','partial')) AS hidden_state_lines,
  (SELECT COUNT(*) FROM boms b JOIN bom_versions bv ON bv.id = b.current_version_id JOIN bom_items bi ON bi.bom_version_id = bv.id WHERE b.is_demo = 0 AND bv.publication_state IN ('verified','partial') AND (bi.evidence_locator IS NULL OR trim(bi.evidence_locator) = '')) AS public_lines_without_evidence,
  (SELECT COUNT(*) FROM boms b JOIN bom_versions bv ON bv.id = b.current_version_id JOIN bom_items bi ON bi.bom_version_id = bv.id WHERE b.is_demo = 0 AND bv.publication_state IN ('verified','partial') AND (bi.quantity IS NULL OR bi.quantity <= 0)) AS public_lines_with_invalid_quantity,
  (SELECT COUNT(*) FROM bom_generation_runs WHERE compiler_version = 'bom-compiler/1' AND policy_version = 'bom-publication/1' AND status = 'confirmed') AS compiler_runs`)[0] ?? {};
const ok = Number(checks.catalog_projects) === Number(checks.projects_with_state)
  && Number(checks.hidden_state_lines) === 0
  && Number(checks.public_lines_without_evidence) === 0
  && Number(checks.public_lines_with_invalid_quantity) === 0
  && Number(checks.compiler_runs) === Number(checks.catalog_projects);
console.log(JSON.stringify({ ok, environment: env, states, checks }, null, 2));
if (!ok) process.exit(1);
