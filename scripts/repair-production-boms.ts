#!/usr/bin/env tsx
/**
 * Safely repair normalized production/preview BOM data from the committed real-BOM snapshot.
 *
 * Defaults to dry-run. Production writes require --env production --apply and should not be run
 * without an operator-reviewed /tmp/repair-production-boms-*.sql artifact.
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { promisify } from "node:util";
import {
  buildComponentMatcher,
  isFalsePartitionTableBom,
  repairBomItems,
} from "./bom-repair-lib";
import type { BomItemLike, BomSnapshot } from "./bom-repair-lib";

const exec = promisify(execFile);
const SNAPSHOT = "data/bom-snapshots/2026-08-12-real-boms.json";

interface Args { env?: "production" | "preview"; apply: boolean; allowNameMatch: boolean }
interface DbProjectRow { project_id: string; slug: string; version_id: string; rpps_json: string }
interface CatalogRow { id: string; name: string; manufacturer_part_number: string | null; offer_count: number }

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, allowNameMatch: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-name-match") args.allowNameMatch = true;
    else if (arg === "--env") {
      const env = argv[++i];
      if (env !== "production" && env !== "preview") throw new Error("--env must be production or preview");
      args.env = env;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.env) throw new Error("explicit --env production or --env preview is required");
  return args;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function query(env: string, sql: string): Promise<any[]> {
  const { stdout } = await exec("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env, "--remote", "--json", "--command", sql,
  ], { env: process.env, maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout).flatMap((statement: any) => statement.results ?? []);
}

async function executeFile(env: string, file: string): Promise<void> {
  await exec("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env, "--remote", "--file", file,
  ], { env: process.env, maxBuffer: 64 * 1024 * 1024 });
}

function asBomItems(items: unknown[]): BomItemLike[] {
  return items.filter((item): item is BomItemLike => Boolean(item) && typeof item === "object");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as BomSnapshot;
  const projectIds = snapshot.projects.map((project) => project.project_id);
  const versionIds = snapshot.projects.map((project) => project.version_id);
  const sqlPath = `/tmp/repair-${args.env}-boms-${Date.now()}.sql`;

  const [catalog, projectRows] = await Promise.all([
    query(args.env, `SELECT c.id, c.name, c.manufacturer_part_number, COUNT(so.id) AS offer_count
      FROM components c
      LEFT JOIN supplier_offers so ON so.component_id = c.id
      WHERE c.deleted_at IS NULL AND c.is_demo = 0
      GROUP BY c.id, c.name, c.manufacturer_part_number`),
    query(args.env, `SELECT p.id AS project_id, p.slug, pv.id AS version_id, pv.rpps_json
      FROM projects p
      JOIN project_versions pv ON pv.id = p.current_version_id
      WHERE p.deleted_at IS NULL
        AND p.id IN (${projectIds.map(sqlString).join(",")})
        AND pv.id IN (${versionIds.map(sqlString).join(",")})`),
  ]) as [CatalogRow[], DbProjectRow[]];

  const matcher = buildComponentMatcher(catalog, { allowNameMatch: args.allowNameMatch });
  const rowsByVersion = new Map(projectRows.map((row) => [row.version_id, row]));
  const statements: string[] = [
    `-- ${basename(import.meta.url)} generated ${new Date().toISOString()}`,
    `-- env=${args.env} apply=${args.apply} snapshot=${SNAPSHOT}`,
    "BEGIN TRANSACTION;",
  ];

  let projectsSeen = 0;
  let sourceLines = 0;
  let keptProjects = 0;
  let removedFalseBoms = 0;
  let removedFalseLines = 0;
  let exactMpnMatches = 0;
  let exactNameMatches = 0;
  let matchedWithOffers = 0;
  let resultingLines = 0;
  let resultingPricedLines = 0;

  for (const snapshotProject of snapshot.projects) {
    const row = rowsByVersion.get(snapshotProject.version_id);
    if (!row) continue;
    projectsSeen += 1;
    const snapshotBom = asBomItems(snapshotProject.bom);
    sourceLines += snapshotBom.length;

    let rpps: any;
    try { rpps = JSON.parse(row.rpps_json); } catch { rpps = {}; }
    const currentBom = Array.isArray(rpps.bom) ? asBomItems(rpps.bom) : snapshotBom;
    const candidateBom = currentBom.length ? currentBom : snapshotBom;

    if (isFalsePartitionTableBom(snapshotBom) || isFalsePartitionTableBom(candidateBom)) {
      removedFalseBoms += 1;
      removedFalseLines += candidateBom.length;
      rpps.bom = [];
    } else {
      keptProjects += 1;
      const repaired = repairBomItems(snapshotBom, matcher);
      rpps.bom = repaired.items;
      exactMpnMatches += repaired.mpnMatches;
      exactNameMatches += repaired.nameMatches;
      matchedWithOffers += repaired.pricedLines;
      resultingLines += repaired.items.length;
      resultingPricedLines += repaired.items.filter((item) => typeof item.component_id === "string").length;
    }

    statements.push(`UPDATE project_versions SET rpps_json = ${sqlString(JSON.stringify(rpps))} WHERE id = ${sqlString(row.version_id)} AND project_id = ${sqlString(row.project_id)};`);
  }

  statements.push("COMMIT;");
  writeFileSync(sqlPath, `${statements.join("\n")}\n`);

  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    env: args.env,
    sqlPath,
    projectsSeen,
    sourceLines,
    keptProjects,
    removedFalseBoms,
    removedFalseLines,
    exactMpnMatches,
    exactNameMatches,
    componentsWithOffersMatched: matchedWithOffers,
    resultingLines,
    resultingPricedLines,
    resultingPricedLineCoverage: resultingLines ? resultingPricedLines / resultingLines : 0,
    note: args.allowNameMatch ? "unique exact normalized name matching enabled" : "name matching disabled; pass --allow-name-match to enable unique exact normalized name matches",
  }, null, 2));

  if (!args.apply) {
    console.log("DRY RUN ONLY. Review SQL under /tmp, then rerun with --apply if intended. Production was not modified.");
    return;
  }
  await executeFile(args.env, sqlPath);
  console.log(`Applied ${statements.length - 3} bounded project_version updates from ${sqlPath}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
