#!/usr/bin/env tsx
/** Backfill source-backed identity, price, and supplier links into public RPPS BOM JSON. */
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { promisify } from "node:util";
import type { RppsPackage } from "../src/lib/rpps/schema";
import { enrichRppsBomPricing, type RppsPricingRow } from "./rpps-pricing-backfill-lib";

const exec = promisify(execFile);
type Environment = "production" | "preview";
type Args = { env?: Environment; apply: boolean };
type SourceRow = {
  project_id: string;
  slug: string;
  version_id: string;
  rpps_json: string;
  sort_order: number;
  description: string;
  manufacturer: string;
  manufacturer_part_number: string;
  unit_price_minor: number;
  product_url: string;
};

type ProjectChange = {
  projectId: string;
  slug: string;
  versionId: string;
  before: string;
  after: string;
  changedLines: number;
  rows: RppsPricingRow[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--env") {
      const value = argv[++index];
      if (value !== "production" && value !== "preview") throw new Error("--env must be production or preview");
      args.env = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.env) throw new Error("explicit --env production or --env preview is required");
  return args;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  env: Environment,
  sql: string,
): Promise<T[]> {
  const { stdout } = await exec("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env, "--remote", "--json", "--command", sql,
  ], { env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const statements = JSON.parse(stdout) as Array<{ results?: T[] }>;
  return statements.flatMap((statement) => statement.results ?? []);
}

async function executeFile(env: Environment, file: string): Promise<void> {
  await exec("node_modules/.bin/wrangler", [
    "d1", "execute", "DB", "--env", env, "--remote", "--file", file,
  ], { env: process.env, maxBuffer: 64 * 1024 * 1024 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRows = await query<SourceRow>(args.env!, `SELECT
      p.id AS project_id, p.slug, pv.id AS version_id, pv.rpps_json,
      bi.sort_order, bi.description, m.name AS manufacturer,
      c.manufacturer_part_number, so.unit_price_minor, so.product_url
    FROM projects p
    JOIN project_versions pv ON pv.id = p.current_version_id
    JOIN boms b ON b.project_id = p.id
    JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
    JOIN components c ON c.id = bi.component_id
    JOIN manufacturers m ON m.id = c.manufacturer_id
    JOIN supplier_offers so ON so.component_id = c.id
    JOIN evidence e ON e.source_url = so.product_url AND e.publisher = 'DigiKey'
    WHERE p.owner_user_id = 'robotics-catalog-import'
      AND p.deleted_at IS NULL
      AND c.provenance_label = 'supplier-source'
      AND c.manufacturer_part_number IS NOT NULL
      AND so.supplier_id = 'sup_digikey'
      AND so.unit_price_minor > 0
      AND so.stock_quantity > 0
      AND length(e.content_hash) = 64
    ORDER BY p.slug, bi.sort_order`);
  if (!sourceRows.length) throw new Error("no exact source-backed RPPS pricing rows found");

  const byProject = new Map<string, SourceRow[]>();
  for (const row of sourceRows) byProject.set(row.project_id, [...(byProject.get(row.project_id) ?? []), row]);
  const changes: ProjectChange[] = [];
  for (const rows of byProject.values()) {
    const first = rows[0];
    if (rows.some((row) => row.version_id !== first.version_id || row.rpps_json !== first.rpps_json)) {
      throw new Error(`inconsistent current project version rows for ${first.slug}`);
    }
    const rpps = JSON.parse(first.rpps_json) as RppsPackage;
    const pricingRows: RppsPricingRow[] = rows.map((row) => ({
      sortOrder: Number(row.sort_order),
      description: row.description,
      manufacturer: row.manufacturer,
      manufacturerPartNumber: row.manufacturer_part_number,
      unitPriceMinor: Number(row.unit_price_minor),
      productUrl: row.product_url,
    }));
    const enriched = enrichRppsBomPricing(rpps, pricingRows);
    const after = JSON.stringify(enriched.rpps);
    if (after === first.rpps_json) continue;
    changes.push({
      projectId: first.project_id,
      slug: first.slug,
      versionId: first.version_id,
      before: first.rpps_json,
      after,
      changedLines: enriched.changedLines,
      rows: pricingRows,
    });
  }
  if (!changes.length) {
    console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", env: args.env, projectsChanged: 0, linesChanged: 0, note: "already up to date" }, null, 2));
    return;
  }

  const generatedAt = new Date().toISOString();
  const forward = [
    `-- ${basename(import.meta.url)} generated ${generatedAt}`,
    `-- env=${args.env} apply=${args.apply}`,
    ...changes.map((change) => `UPDATE project_versions SET rpps_json = ${sqlString(change.after)} WHERE id = ${sqlString(change.versionId)} AND project_id = ${sqlString(change.projectId)} AND rpps_json = ${sqlString(change.before)};`),
  ];
  const rollback = [
    `-- rollback for ${basename(import.meta.url)} generated ${generatedAt}`,
    `-- env=${args.env}`,
    ...changes.map((change) => `UPDATE project_versions SET rpps_json = ${sqlString(change.before)} WHERE id = ${sqlString(change.versionId)} AND project_id = ${sqlString(change.projectId)} AND rpps_json = ${sqlString(change.after)};`),
  ];
  const scratch = process.env.JCODE_SCRATCH_DIR || "/root/.jcode/scratch";
  const stamp = generatedAt.replace(/[:.]/g, "-");
  const sqlPath = `${scratch}/backfill-rpps-pricing-${args.env}-${stamp}.sql`;
  const rollbackPath = `${scratch}/rollback-rpps-pricing-${args.env}-${stamp}.sql`;
  writeFileSync(sqlPath, `${forward.join("\n")}\n`);
  writeFileSync(rollbackPath, `${rollback.join("\n")}\n`);

  console.log(JSON.stringify({
    mode: args.apply ? "apply" : "dry-run",
    env: args.env,
    sqlPath,
    rollbackPath,
    projectsChanged: changes.length,
    linesChanged: changes.reduce((sum, change) => sum + change.changedLines, 0),
    projects: changes.map((change) => ({ slug: change.slug, lines: change.rows.map((row) => ({ sortOrder: row.sortOrder, mpn: row.manufacturerPartNumber, unitPriceMinor: row.unitPriceMinor })) })),
  }, null, 2));
  if (!args.apply) {
    console.log("DRY RUN ONLY. Review both SQL artifacts, then rerun with --apply if intended.");
    return;
  }

  await executeFile(args.env!, sqlPath);
  const observedRows = await query<{ id: string; rpps_json: string }>(args.env!, `SELECT id, rpps_json FROM project_versions WHERE id IN (${changes.map((change) => sqlString(change.versionId)).join(",")})`);
  const observed = new Map(observedRows.map((row) => [row.id, row.rpps_json]));
  const failed = changes.filter((change) => observed.get(change.versionId) !== change.after);
  if (failed.length) throw new Error(`post-backfill verification failed for ${failed.map((change) => change.slug).join(", ")}; rollback SQL: ${rollbackPath}`);
  console.log(JSON.stringify({ verifiedProjects: changes.length, verifiedLines: changes.reduce((sum, change) => sum + change.changedLines, 0), rollbackPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
