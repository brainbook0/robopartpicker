import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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
type CleanupWave = {
  wave: string;
  schema_version: number;
  reviewed_at: string;
  contract: string;
  expected: Record<string, number>;
  targets: CleanupTarget[];
};
type PreparedProject = {
  target: CleanupTarget;
  row: ProjectRow;
  originalRppsJson: string;
  cleanedRppsJson: string;
  originalBomRows: BomItemRow[];
  removedBomRows: BomItemRow[];
};

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] as EnvName : undefined;
const waveIndex = args.indexOf("--wave");
const wavePath = resolve(waveIndex >= 0 ? args[waveIndex + 1] : "data/project-waves/2026-08-20-inferred-project-content-cleanup.json");
const apply = args.includes("--apply");
const scratch = process.env.JCODE_SCRATCH_DIR;
if (env !== "production" && env !== "preview") {
  console.error("Usage: tsx scripts/backfill-inferred-project-content.ts --env production|preview [--wave path] [--apply]");
  process.exit(2);
}
if (!scratch) {
  console.error("JCODE_SCRATCH_DIR is required so SQL, rollback, and reports stay outside the repository.");
  process.exit(2);
}
if (apply && env === "production" && process.env.ALLOW_PRODUCTION_INFERRED_CONTENT_CLEANUP !== "1") {
  console.error("Production apply is blocked. Set ALLOW_PRODUCTION_INFERRED_CONTENT_CLEANUP=1 only after reviewing the checked-in wave, dry run, SQL, and rollback.");
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
    "d1", "execute", "DB", "--env", env!, "--remote", "--command", command, "--json", "--yes",
  ], { cwd: process.cwd(), env: childEnv, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] });
  const parsed = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  return parsed.flatMap((page) => page.results ?? []);
}
function executeSqlFile(path: string): void {
  execFileSync("node_modules/.bin/wrangler", ["d1", "execute", "DB", "--env", env!, "--remote", "--file", path, "--yes"], {
    cwd: process.cwd(), env: childEnv, maxBuffer: 256 * 1024 * 1024, stdio: "inherit",
  });
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function publicOrigin(environment: EnvName): string {
  return environment === "production"
    ? "https://robopartpicker-production.ludomi2502.workers.dev"
    : "https://robopartpicker-preview.ludomi2502.workers.dev";
}
function sqlValue(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot serialize non-finite SQL number ${String(value)}`);
    return String(value);
  }
  return sqlString(value);
}
function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
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

const wave = JSON.parse(readFileSync(wavePath, "utf8")) as CleanupWave;
const SHA_RE = /^[a-f0-9]{64}$/u;
const errors: string[] = [];
if (wave.wave !== "inferred-project-content-cleanup-2026-08-20") errors.push("unexpected wave id");
if (wave.schema_version !== 1) errors.push("schema_version must be 1");
if (wave.contract !== "remove-only-exact-legacy-inference-v1") errors.push("cleanup contract mismatch");
if (!Number.isFinite(Date.parse(wave.reviewed_at))) errors.push("reviewed_at must be an ISO timestamp");
if (!Array.isArray(wave.targets) || wave.targets.length === 0) errors.push("targets must not be empty");
const seenSlugs = new Set<string>();
for (const target of wave.targets ?? []) {
  if (seenSlugs.has(target.slug)) errors.push(`${target.slug}: duplicate target`);
  seenSlugs.add(target.slug);
  if (!SHA_RE.test(target.original_rpps_sha256) || !SHA_RE.test(target.cleaned_rpps_sha256)) errors.push(`${target.slug}: invalid RPPS hash`);
  if (target.normalized_bom_original_count > 0 && (!target.normalized_bom_version_id || !SHA_RE.test(target.normalized_bom_original_sha256 ?? ""))) errors.push(`${target.slug}: invalid original normalized BOM fingerprint`);
  if (target.normalized_bom_cleaned_count > 0 && !SHA_RE.test(target.normalized_bom_cleaned_sha256 ?? "")) errors.push(`${target.slug}: invalid cleaned normalized BOM fingerprint`);
  if (target.normalized_bom_removed_count !== target.cleanup.removedAiBomLines) errors.push(`${target.slug}: normalized/RPPS removal counts differ`);
  if (target.normalized_bom_original_count - target.normalized_bom_removed_count !== target.normalized_bom_cleaned_count) errors.push(`${target.slug}: normalized BOM counts do not reconcile`);
}
if (Number(wave.expected.projects) !== wave.targets.length) errors.push("expected project count mismatch");
if (["dependent_alternative_links", "dependent_build_item_links", "dependent_rfq_item_links"].some((key) => Number(wave.expected[key]) !== 0)) errors.push("wave contains dependent AI BOM workflow links");
if (errors.length) throw new Error(`Invalid inferred-content cleanup wave: ${errors.join("; ")}`);
if (apply) {
  const relativeWavePath = relative(process.cwd(), wavePath).replace(/\\/gu, "/");
  if (!relativeWavePath || relativeWavePath.startsWith("../")) throw new Error("Apply requires a checked-in wave inside the repository");
  const tracked = execFileSync("git", ["show", `HEAD:${relativeWavePath}`], { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 });
  if (digest(tracked.toString("utf8")) !== digest(readFileSync(wavePath, "utf8"))) throw new Error("Apply requires the exact checked-in HEAD wave");
}

function loadProjectRows(): ProjectRow[] {
  const rows: ProjectRow[] = [];
  for (const group of chunks(wave.targets.map((target) => target.slug), 100)) {
    rows.push(...wranglerRows(`SELECT p.id, p.slug, p.project_kind, p.difficulty, p.estimated_cost_minor, p.estimated_cost_currency,
      p.updated_at, p.current_version_id, pv.rpps_json FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
      WHERE p.deleted_at IS NULL AND p.slug IN (${group.map(sqlString).join(", ")}) ORDER BY p.slug`) as unknown as ProjectRow[]);
  }
  return rows;
}
function loadBomRows(): BomItemRow[] {
  const targets = wave.targets.filter((target) => target.normalized_bom_original_count > 0);
  const rows: BomItemRow[] = [];
  for (const group of chunks(targets.map((target) => target.slug), 50)) {
    rows.push(...wranglerRows(`SELECT p.slug, b.current_version_id AS bom_version_id,
      bi.id, bi.component_id, bi.slot_key, bi.description, bi.quantity, bi.unit, bi.selected_supplier_offer_id,
      bi.target_unit_price_minor, bi.notes, bi.sort_order, bi.extraction_method, bi.completeness, bi.evidence_locator, bi.confidence
      FROM projects p JOIN boms b ON b.project_id = p.id JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
      WHERE p.slug IN (${group.map(sqlString).join(", ")}) ORDER BY p.slug, bi.id`) as unknown as BomItemRow[]);
  }
  return rows;
}
function bomBySlug(rows: BomItemRow[]): Map<string, BomItemRow[]> {
  const result = new Map<string, BomItemRow[]>();
  for (const row of rows) {
    const list = result.get(row.slug) ?? [];
    list.push(row);
    result.set(row.slug, list);
  }
  return result;
}
function exactColumns(row: ProjectRow, target: CleanupTarget, state: "original" | "cleaned"): boolean {
  const prefix = state === "original" ? "original" : "cleaned";
  return row.difficulty === target[`${prefix}_difficulty`]
    && row.estimated_cost_minor === target[`${prefix}_estimated_cost_minor`]
    && row.estimated_cost_currency === target[`${prefix}_estimated_cost_currency`];
}
function exactBomState(rows: BomItemRow[], target: CleanupTarget, state: "original" | "cleaned"): boolean {
  const count = state === "original" ? target.normalized_bom_original_count : target.normalized_bom_cleaned_count;
  const hash = state === "original" ? target.normalized_bom_original_sha256 : target.normalized_bom_cleaned_sha256;
  return rows.length === count && (count === 0 ? hash === null : digest(canonicalBomRows(rows)) === hash);
}

const rows = loadProjectRows();
const bySlug = new Map(rows.map((row) => [row.slug, row]));
const bomState = bomBySlug(loadBomRows());
if (rows.length !== wave.targets.length) throw new Error(`Catalog identity mismatch: expected ${wave.targets.length} rows, found ${rows.length}`);
const prepared: PreparedProject[] = [];
const alreadyApplied: string[] = [];
for (const target of wave.targets) {
  const row = bySlug.get(target.slug);
  if (!row || row.id !== target.project_id || row.project_kind !== target.project_kind || row.current_version_id !== target.version_id) throw new Error(`${target.slug}: project identity changed`);
  const currentHash = digest(row.rpps_json);
  const currentBom = bomState.get(target.slug) ?? [];
  if (currentHash === target.cleaned_rpps_sha256) {
    if (!exactColumns(row, target, "cleaned") || !exactBomState(currentBom, target, "cleaned")) throw new Error(`${target.slug}: cleaned state is incomplete or drifted`);
    alreadyApplied.push(target.slug);
    continue;
  }
  if (currentHash !== target.original_rpps_sha256 || row.updated_at !== target.original_updated_at || !exactColumns(row, target, "original") || !exactBomState(currentBom, target, "original")) {
    throw new Error(`${target.slug}: current project or normalized BOM no longer matches the reviewed original fingerprint`);
  }
  const cleanup = cleanInferredProjectContent(JSON.parse(row.rpps_json), publicOrigin(env));
  if (digest(cleanup.rppsJson) !== target.cleaned_rpps_sha256 || JSON.stringify(cleanup.stats) !== JSON.stringify(target.cleanup)) throw new Error(`${target.slug}: cleanup transformation changed after review`);
  const orderedBom = [...currentBom].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
  orderedBom.forEach((item, index) => { if (item.sort_order !== index) throw new Error(`${target.slug}: normalized BOM order drifted at ${item.id}`); });
  prepared.push({ target, row, originalRppsJson: row.rpps_json, cleanedRppsJson: cleanup.rppsJson, originalBomRows: orderedBom, removedBomRows: orderedBom.slice(0, target.normalized_bom_removed_count) });
}

if (prepared.some((project) => project.target.normalized_bom_removed_count > 0)) {
  const dependencyRows = wranglerRows(`WITH ai_items AS (
    SELECT bi.id FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    JOIN boms b ON b.project_id = p.id JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
    WHERE EXISTS (SELECT 1 FROM json_each(pv.rpps_json, '$.evidence') e
      WHERE json_extract(e.value, '$.source_type') = 'inference'
        AND instr(json_extract(e.value, '$.claim'), 'Bill of materials derived from repository text by') = 1)
      AND bi.sort_order < CAST(substr((SELECT json_extract(e2.value, '$.claim') FROM json_each(pv.rpps_json, '$.evidence') e2
        WHERE json_extract(e2.value, '$.source_type') = 'inference' AND instr(json_extract(e2.value, '$.claim'), 'Bill of materials derived from repository text by') = 1 LIMIT 1),
        instr((SELECT json_extract(e3.value, '$.claim') FROM json_each(pv.rpps_json, '$.evidence') e3 WHERE json_extract(e3.value, '$.source_type') = 'inference' AND instr(json_extract(e3.value, '$.claim'), 'Bill of materials derived from repository text by') = 1 LIMIT 1), '; ') + 2) AS INTEGER)
  ) SELECT
    (SELECT COUNT(*) FROM bom_item_alternatives bia JOIN ai_items ai ON ai.id = bia.bom_item_id) AS alternative_links,
    (SELECT COUNT(*) FROM build_items bli JOIN ai_items ai ON ai.id = bli.source_bom_item_id) AS build_item_links,
    (SELECT COUNT(*) FROM rfq_line_items ri JOIN ai_items ai ON ai.id = ri.bom_item_id) AS rfq_item_links`);
  const dependencies = dependencyRows[0] ?? {};
  if (["alternative_links", "build_item_links", "rfq_item_links"].some((key) => Number(dependencies[key]) !== 0)) throw new Error(`AI BOM dependencies appeared after review: ${JSON.stringify(dependencies)}`);
}

function stateGuard(project: PreparedProject, rppsJson: string, difficulty: string | null, costMinor: number | null, costCurrency: string | null, updatedAt?: string): string {
  const { target } = project;
  return `p.id = ${sqlString(target.project_id)} AND p.slug = ${sqlString(target.slug)} AND p.project_kind = ${sqlString(target.project_kind)} AND p.current_version_id = ${sqlString(target.version_id)} AND p.deleted_at IS NULL${updatedAt ? ` AND p.updated_at = ${sqlString(updatedAt)}` : ""} AND p.difficulty IS ${sqlValue(difficulty)} AND p.estimated_cost_minor IS ${sqlValue(costMinor)} AND p.estimated_cost_currency IS ${sqlValue(costCurrency)} AND pv.id = p.current_version_id AND pv.project_id = p.id AND pv.rpps_json = ${sqlString(rppsJson)}`;
}
function buildForwardSql(projects: PreparedProject[], now: string): string {
  const lines = ["-- Guarded removal of exact legacy inferred project content."];
  for (const project of projects) {
    const { target } = project;
    const originalGuard = stateGuard(project, project.originalRppsJson, target.original_difficulty, target.original_estimated_cost_minor, target.original_estimated_cost_currency, target.original_updated_at);
    if (target.normalized_bom_removed_count > 0) {
      lines.push(`DELETE FROM bom_items
WHERE bom_version_id = ${sqlString(target.normalized_bom_version_id)} AND sort_order < ${target.normalized_bom_removed_count}
  AND EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE ${originalGuard})
  AND (SELECT COUNT(*) FROM bom_items WHERE bom_version_id = ${sqlString(target.normalized_bom_version_id)}) = ${target.normalized_bom_original_count};`);
      if (target.normalized_bom_cleaned_count > 0) lines.push(`UPDATE bom_items SET sort_order = sort_order - ${target.normalized_bom_removed_count}
WHERE bom_version_id = ${sqlString(target.normalized_bom_version_id)} AND sort_order >= ${target.normalized_bom_removed_count}
  AND EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE ${originalGuard})
  AND (SELECT COUNT(*) FROM bom_items WHERE bom_version_id = ${sqlString(target.normalized_bom_version_id)}) = ${target.normalized_bom_cleaned_count};`);
    }
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(project.cleanedRppsJson)}
WHERE id = ${sqlString(target.version_id)} AND project_id = ${sqlString(target.project_id)} AND rpps_json = ${sqlString(project.originalRppsJson)}${target.normalized_bom_removed_count > 0 ? ` AND (SELECT COUNT(*) FROM bom_items WHERE bom_version_id = ${sqlString(target.normalized_bom_version_id)}) = ${target.normalized_bom_cleaned_count}` : ""};`);
    lines.push(`UPDATE projects SET difficulty = ${sqlValue(target.cleaned_difficulty)}, estimated_cost_minor = ${sqlValue(target.cleaned_estimated_cost_minor)}, estimated_cost_currency = ${sqlValue(target.cleaned_estimated_cost_currency)}, updated_at = ${sqlString(now)}
WHERE id = ${sqlString(target.project_id)} AND slug = ${sqlString(target.slug)} AND project_kind = ${sqlString(target.project_kind)} AND current_version_id = ${sqlString(target.version_id)} AND deleted_at IS NULL AND updated_at = ${sqlString(target.original_updated_at)} AND difficulty IS ${sqlValue(target.original_difficulty)} AND estimated_cost_minor IS ${sqlValue(target.original_estimated_cost_minor)} AND estimated_cost_currency IS ${sqlValue(target.original_estimated_cost_currency)}
  AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(target.version_id)} AND pv.project_id = ${sqlString(target.project_id)} AND pv.rpps_json = ${sqlString(project.cleanedRppsJson)});`);
  }
  return `${lines.join("\n")}\n`;
}
function buildRollbackSql(projects: PreparedProject[], now: string): string {
  const lines = ["-- Guarded rollback for exact legacy inferred project content cleanup."];
  for (const project of [...projects].reverse()) {
    const { target } = project;
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(project.originalRppsJson)}
WHERE id = ${sqlString(target.version_id)} AND project_id = ${sqlString(target.project_id)} AND rpps_json = ${sqlString(project.cleanedRppsJson)};`);
    lines.push(`UPDATE projects SET difficulty = ${sqlValue(target.original_difficulty)}, estimated_cost_minor = ${sqlValue(target.original_estimated_cost_minor)}, estimated_cost_currency = ${sqlValue(target.original_estimated_cost_currency)}, updated_at = ${sqlString(target.original_updated_at)}
WHERE id = ${sqlString(target.project_id)} AND slug = ${sqlString(target.slug)} AND project_kind = ${sqlString(target.project_kind)} AND current_version_id = ${sqlString(target.version_id)} AND deleted_at IS NULL AND updated_at = ${sqlString(now)} AND difficulty IS ${sqlValue(target.cleaned_difficulty)} AND estimated_cost_minor IS ${sqlValue(target.cleaned_estimated_cost_minor)} AND estimated_cost_currency IS ${sqlValue(target.cleaned_estimated_cost_currency)}
  AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(target.version_id)} AND pv.project_id = ${sqlString(target.project_id)} AND pv.rpps_json = ${sqlString(project.originalRppsJson)});`);
    if (target.normalized_bom_removed_count > 0) {
      if (target.normalized_bom_cleaned_count > 0) lines.push(`UPDATE bom_items SET sort_order = sort_order + ${target.normalized_bom_removed_count}
WHERE bom_version_id = ${sqlString(target.normalized_bom_version_id)}
  AND EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE ${stateGuard(project, project.originalRppsJson, target.original_difficulty, target.original_estimated_cost_minor, target.original_estimated_cost_currency)})
  AND (SELECT COUNT(*) FROM bom_items WHERE bom_version_id = ${sqlString(target.normalized_bom_version_id)}) = ${target.normalized_bom_cleaned_count};`);
      const restoredValues = project.removedBomRows.map((item) => `(${BOM_COLUMNS.map((column) => sqlValue(item[column] as string | number | null)).join(", ")})`).join(",\n  ");
      lines.push(`WITH restored (${BOM_COLUMNS.join(", ")}) AS (VALUES
  ${restoredValues}
)
INSERT INTO bom_items (${BOM_COLUMNS.join(", ")})
SELECT ${BOM_COLUMNS.map((column) => `restored.${column}`).join(", ")} FROM restored
WHERE EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE ${stateGuard(project, project.originalRppsJson, target.original_difficulty, target.original_estimated_cost_minor, target.original_estimated_cost_currency)})
  AND NOT EXISTS (SELECT 1 FROM bom_items existing WHERE existing.id = restored.id);`);
    }
  }
  return `${lines.join("\n")}\n`;
}

mkdirSync(scratch, { recursive: true });
const now = new Date().toISOString();
const stamp = now.replace(/[:.]/gu, "-");
const batches = chunks(prepared, 5);
const forwardPaths: string[] = [];
const rollbackPaths: string[] = [];
for (const [index, batch] of batches.entries()) {
  const part = String(index + 1).padStart(3, "0");
  const forwardPath = join(scratch, `inferred-project-content-${env}-${stamp}-part-${part}.sql`);
  const rollbackPath = join(scratch, `rollback-inferred-project-content-${env}-${stamp}-part-${part}.sql`);
  writeFileSync(forwardPath, buildForwardSql(batch, now));
  writeFileSync(rollbackPath, buildRollbackSql(batch, now));
  forwardPaths.push(forwardPath);
  rollbackPaths.push(rollbackPath);
}
const reportPath = join(scratch, `inferred-project-content-${env}-${stamp}.json`);
const report = {
  mode: apply ? "apply" : "dry-run",
  env,
  wave: wave.wave,
  reviewedAt: wave.reviewed_at,
  waveProjects: wave.targets.length,
  prepared: prepared.length,
  alreadyApplied: alreadyApplied.length,
  expected: wave.expected,
  forwardSql: forwardPaths,
  rollbackSql: rollbackPaths,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, report: reportPath }, null, 2));
if (!apply) {
  console.log("Dry run complete. Exact RPPS, project-column, and normalized BOM fingerprints were verified. No writes were performed.");
  process.exit(0);
}
if (prepared.length === 0) {
  console.log("The exact inferred-content cleanup wave is already applied. No writes were needed.");
  process.exit(0);
}

function verifyState(projects: PreparedProject[], state: "original" | "cleaned"): void {
  const currentRows = new Map(loadProjectRows().map((row) => [row.slug, row]));
  const currentBom = bomBySlug(loadBomRows());
  for (const [index, project] of projects.entries()) {
    const row = currentRows.get(project.target.slug);
    const expectedHash = state === "original" ? project.target.original_rpps_sha256 : project.target.cleaned_rpps_sha256;
    if (!row || digest(row.rpps_json) !== expectedHash || !exactColumns(row, project.target, state) || !exactBomState(currentBom.get(project.target.slug) ?? [], project.target, state)) {
      throw new Error(`${project.target.slug}: ${state} postflight state mismatch`);
    }
    if ((index + 1) % 25 === 0 || index + 1 === projects.length) console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: projects.length, unit: "postflight projects", message: `${project.target.slug}: ${state} state verified` })}`);
  }
}
function remainingPollution(): Record<string, number> {
  const result = wranglerRows(`SELECT
    (SELECT COUNT(*) FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id, json_each(pv.rpps_json, '$.evidence') e WHERE p.deleted_at IS NULL AND json_extract(e.value, '$.source_type') = 'inference') AS inference_entries,
    (SELECT COUNT(*) FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id, json_each(pv.rpps_json, '$.assembly') a WHERE p.deleted_at IS NULL AND json_extract(a.value, '$.title') = 'Fabricate and assemble the structure') AS generic_assembly_entries,
    (SELECT COUNT(*) FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM json_each(pv.rpps_json, '$.evidence') e WHERE json_extract(e.value, '$.source_type') = 'inference' AND instr(json_extract(e.value, '$.claim'), 'Bill of materials derived from repository text by') = 1)) AS ai_bom_projects`);
  const row = result[0] ?? {};
  return { inference_entries: Number(row.inference_entries), generic_assembly_entries: Number(row.generic_assembly_entries), ai_bom_projects: Number(row.ai_bom_projects) };
}

const executed: number[] = [];
try {
  for (const [index, path] of forwardPaths.entries()) {
    executed.push(index);
    executeSqlFile(path);
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: forwardPaths.length, unit: "D1 batches", message: `cleanup batch ${index + 1} applied` })}`);
  }
  verifyState(prepared, "cleaned");
  const remaining = remainingPollution();
  if (Object.values(remaining).some((value) => value !== 0)) throw new Error(`Postflight inferred-content signatures remain: ${JSON.stringify(remaining)}`);
  console.log(JSON.stringify({ applied: prepared.length, alreadyApplied: alreadyApplied.length, batches: forwardPaths.length, remaining, report: reportPath, rollback: rollbackPaths }, null, 2));
} catch (error) {
  let rollbackError: unknown = null;
  try {
    for (const index of [...executed].reverse()) executeSqlFile(rollbackPaths[index]);
    verifyState(executed.flatMap((index) => batches[index]), "original");
  } catch (caught) {
    rollbackError = caught;
  }
  const originalMessage = error instanceof Error ? error.message : String(error);
  const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : rollbackError ? String(rollbackError) : "rollback verified";
  throw new Error(`Inferred project content cleanup failed: ${originalMessage}; ${rollbackMessage}`);
}
