import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cleanInferredProjectContent, type InferredProjectCleanupStats } from "../src/lib/inferred-project-cleanup";
import { sqlString } from "../src/lib/physical-design-wave-import";

type EnvName = "production" | "preview";
type ProjectRow = {
  id: string;
  slug: string;
  project_kind: string;
  difficulty: string | null;
  estimated_cost_minor: number | null;
  estimated_cost_currency: string | null;
  updated_at: string;
  current_version_id: string;
  rpps_json: string;
};
type BomItemRow = {
  slug: string;
  bom_version_id: string;
  id: string;
  component_id: string | null;
  slot_key: string;
  description: string;
  quantity: number;
  unit: string;
  selected_supplier_offer_id: string | null;
  target_unit_price_minor: number | null;
  notes: string | null;
  sort_order: number;
  extraction_method: string;
  completeness: string;
  evidence_locator: string | null;
  confidence: number | null;
};

type CleanupTarget = {
  slug: string;
  project_id: string;
  project_kind: string;
  version_id: string;
  original_updated_at: string;
  original_rpps_sha256: string;
  cleaned_rpps_sha256: string;
  original_difficulty: string | null;
  cleaned_difficulty: string | null;
  original_estimated_cost_minor: number | null;
  cleaned_estimated_cost_minor: number | null;
  original_estimated_cost_currency: string | null;
  cleaned_estimated_cost_currency: string | null;
  normalized_bom_version_id: string | null;
  normalized_bom_original_count: number;
  normalized_bom_original_sha256: string | null;
  normalized_bom_cleaned_count: number;
  normalized_bom_cleaned_sha256: string | null;
  normalized_bom_removed_count: number;
  cleanup: InferredProjectCleanupStats;
};

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : "production";
const outputIndex = args.indexOf("--output");
const outputPath = resolve(outputIndex >= 0 ? args[outputIndex + 1] : "data/project-waves/2026-08-20-inferred-project-content-cleanup.json");
if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/prepare-inferred-project-content-cleanup.ts [--env production|preview] [--output path]");
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
  ], { cwd: process.cwd(), env: childEnv, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed.flatMap((page) => page.results ?? []);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const BOM_COLUMNS: Array<keyof Omit<BomItemRow, "slug">> = [
  "bom_version_id", "id", "component_id", "slot_key", "description", "quantity", "unit",
  "selected_supplier_offer_id", "target_unit_price_minor", "notes", "sort_order", "extraction_method",
  "completeness", "evidence_locator", "confidence",
];

function canonicalBomRows(rows: BomItemRow[]): string {
  return JSON.stringify([...rows]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => Object.fromEntries(BOM_COLUMNS.map((column) => [column, row[column]]))));
}

function publicOrigin(environment: EnvName): string {
  return environment === "production"
    ? "https://robopartpicker-production.ludomi2502.workers.dev"
    : "https://robopartpicker-preview.ludomi2502.workers.dev";
}

const projectRows = wranglerRows(`SELECT p.id, p.slug, p.project_kind, p.difficulty, p.estimated_cost_minor, p.estimated_cost_currency,
  p.updated_at, p.current_version_id, pv.rpps_json
  FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
  WHERE p.deleted_at IS NULL AND (
    EXISTS (SELECT 1 FROM json_each(pv.rpps_json, '$.evidence') e WHERE json_extract(e.value, '$.source_type') = 'inference')
    OR EXISTS (SELECT 1 FROM json_each(pv.rpps_json, '$.assembly') a WHERE json_extract(a.value, '$.title') = 'Fabricate and assemble the structure')
  ) ORDER BY p.slug`) as unknown as ProjectRow[];

const slugs = projectRows.map((row) => row.slug);
const bomRows = slugs.length === 0 ? [] : wranglerRows(`SELECT p.slug, b.current_version_id AS bom_version_id,
  bi.id, bi.component_id, bi.slot_key, bi.description, bi.quantity, bi.unit, bi.selected_supplier_offer_id,
  bi.target_unit_price_minor, bi.notes, bi.sort_order, bi.extraction_method, bi.completeness, bi.evidence_locator, bi.confidence
  FROM projects p JOIN boms b ON b.project_id = p.id JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
  WHERE p.slug IN (${slugs.map(sqlString).join(", ")}) ORDER BY p.slug, bi.id`) as unknown as BomItemRow[];
const bomBySlug = new Map<string, BomItemRow[]>();
for (const row of bomRows) {
  const list = bomBySlug.get(row.slug) ?? [];
  list.push(row);
  bomBySlug.set(row.slug, list);
}

const dependencyRows = wranglerRows(`WITH ai_items AS (
  SELECT bi.id FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
  JOIN boms b ON b.project_id = p.id JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
  WHERE EXISTS (SELECT 1 FROM json_each(pv.rpps_json, '$.evidence') e
    WHERE json_extract(e.value, '$.source_type') = 'inference'
      AND instr(json_extract(e.value, '$.claim'), 'Bill of materials derived from repository text by') = 1)
) SELECT
  (SELECT COUNT(*) FROM bom_item_alternatives bia JOIN ai_items ai ON ai.id = bia.bom_item_id) AS alternative_links,
  (SELECT COUNT(*) FROM build_items bli JOIN ai_items ai ON ai.id = bli.source_bom_item_id) AS build_item_links,
  (SELECT COUNT(*) FROM rfq_line_items ri JOIN ai_items ai ON ai.id = ri.bom_item_id) AS rfq_item_links`);
const dependencies = dependencyRows[0] ?? {};
if (["alternative_links", "build_item_links", "rfq_item_links"].some((key) => Number(dependencies[key]) !== 0)) {
  throw new Error(`AI-derived BOM items have dependent workflow records: ${JSON.stringify(dependencies)}`);
}

const targets: CleanupTarget[] = [];
for (const [index, row] of projectRows.entries()) {
  const cleanup = cleanInferredProjectContent(JSON.parse(row.rpps_json), publicOrigin(env));
  if (cleanup.stats.inferenceEntries === 0 && cleanup.stats.removedGenericAssembly === 0) {
    throw new Error(`${row.slug}: selected by the production query but no supported cleanup signature was found`);
  }
  const cleanedDifficulty = cleanup.stats.removedUnsourcedDifficulty && row.difficulty === "intermediate" ? null : row.difficulty;
  const removedCostMinor = cleanup.stats.removedCostUsd == null ? null : Math.round(cleanup.stats.removedCostUsd * 100);
  const clearProjectCost = removedCostMinor !== null && row.estimated_cost_minor === removedCostMinor;
  const cleanedCostMinor = clearProjectCost ? null : row.estimated_cost_minor;
  const cleanedCostCurrency = clearProjectCost ? null : row.estimated_cost_currency;
  const normalizedBom = bomBySlug.get(row.slug) ?? [];
  if (cleanup.stats.removedAiBomLines > 0 && normalizedBom.length < cleanup.stats.removedAiBomLines) {
    throw new Error(`${row.slug}: RPPS removes ${cleanup.stats.removedAiBomLines} AI BOM lines but normalized BOM contains only ${normalizedBom.length}`);
  }
  if (cleanup.stats.removedAiBomLines === 0 && normalizedBom.length > 0) {
    // Non-AI BOMs remain untouched and are intentionally excluded from this wave fingerprint.
  }
  const aiBomRows = cleanup.stats.removedAiBomLines > 0
    ? [...normalizedBom].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
    : [];
  aiBomRows.forEach((item, itemIndex) => {
    if (item.sort_order !== itemIndex) throw new Error(`${row.slug}: normalized BOM sort order is not a contiguous source-order sequence at ${item.id}`);
  });
  const removedBomRows = aiBomRows.slice(0, cleanup.stats.removedAiBomLines);
  const retainedBomRows = aiBomRows.slice(cleanup.stats.removedAiBomLines).map((item) => ({
    ...item,
    sort_order: item.sort_order - cleanup.stats.removedAiBomLines,
  }));
  const bomVersionIds = [...new Set(aiBomRows.map((item) => item.bom_version_id))];
  if (bomVersionIds.length > 1) throw new Error(`${row.slug}: AI BOM rows span multiple current BOM versions`);
  targets.push({
    slug: row.slug,
    project_id: row.id,
    project_kind: row.project_kind,
    version_id: row.current_version_id,
    original_updated_at: row.updated_at,
    original_rpps_sha256: digest(row.rpps_json),
    cleaned_rpps_sha256: digest(cleanup.rppsJson),
    original_difficulty: row.difficulty,
    cleaned_difficulty: cleanedDifficulty,
    original_estimated_cost_minor: row.estimated_cost_minor,
    cleaned_estimated_cost_minor: cleanedCostMinor,
    original_estimated_cost_currency: row.estimated_cost_currency,
    cleaned_estimated_cost_currency: cleanedCostCurrency,
    normalized_bom_version_id: bomVersionIds[0] ?? null,
    normalized_bom_original_count: aiBomRows.length,
    normalized_bom_original_sha256: aiBomRows.length ? digest(canonicalBomRows(aiBomRows)) : null,
    normalized_bom_cleaned_count: retainedBomRows.length,
    normalized_bom_cleaned_sha256: retainedBomRows.length ? digest(canonicalBomRows(retainedBomRows)) : null,
    normalized_bom_removed_count: removedBomRows.length,
    cleanup: cleanup.stats,
  });
  if ((index + 1) % 25 === 0 || index + 1 === projectRows.length) {
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: projectRows.length, unit: "projects", message: `${row.slug}: inferred cleanup fingerprinted` })}`);
  }
}

const sum = (select: (target: CleanupTarget) => number): number => targets.reduce((total, target) => total + select(target), 0);
const wave = {
  wave: "inferred-project-content-cleanup-2026-08-20",
  schema_version: 1,
  reviewed_at: new Date().toISOString(),
  contract: "remove-only-exact-legacy-inference-v1",
  expected: {
    projects: targets.length,
    inference_entries: sum((target) => target.cleanup.inferenceEntries),
    generic_assembly_entries: sum((target) => target.cleanup.removedGenericAssembly),
    ai_bom_projects: targets.filter((target) => target.cleanup.removedAiBomLines > 0).length,
    ai_bom_lines: sum((target) => target.cleanup.removedAiBomLines),
    normalized_ai_bom_lines: sum((target) => target.normalized_bom_removed_count),
    removed_dof: sum((target) => Number(target.cleanup.removedDof)),
    removed_time: sum((target) => Number(target.cleanup.removedTimeHours)),
    removed_cost: sum((target) => Number(target.cleanup.removedCostUsd !== null)),
    removed_generic_compute: sum((target) => Number(target.cleanup.removedGenericCompute)),
    removed_unsourced_difficulty: sum((target) => Number(target.cleanup.removedUnsourcedDifficulty)),
    removed_unsupported_ros_none: sum((target) => Number(target.cleanup.removedUnsupportedRosNone)),
    removed_basic_tools: sum((target) => target.cleanup.removedBasicTools),
    removed_basic_skills: sum((target) => target.cleanup.removedBasicSkills),
    dependent_alternative_links: Number(dependencies.alternative_links),
    dependent_build_item_links: Number(dependencies.build_item_links),
    dependent_rfq_item_links: Number(dependencies.rfq_item_links),
  },
  targets,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(wave, null, 2)}\n`);
console.log(JSON.stringify({ env, output: outputPath, expected: wave.expected, wrote: true }, null, 2));
