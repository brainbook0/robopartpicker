#!/usr/bin/env tsx
/**
 * Import exact, source-backed DigiKey BOM pricing evidence.
 *
 * Dry-run is the default. Production writes require explicit --env production
 * and --apply. Every accepted result must have passed the exact DigiKey detail
 * parser, have a positive quantity-one price, and map to an unchanged normalized
 * BOM line. The script emits forward and rollback SQL before any write.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { canonicalImportedPriceBreaks, IMPORTED_EXACT_MATCH_RISK_LABEL } from "../src/lib/bom-pricing-import";
import { promisify } from "node:util";
import { pairSnapshotItemsWithNormalizedLines, type BomItemLike, type BomSnapshot } from "./bom-repair-lib";
import { normalizeDigiKeyMpn, type DigiKeyProduct } from "./digikey-product-parser";

const exec = promisify(execFile);
const SNAPSHOT = "data/bom-snapshots/2026-08-12-real-boms.json";

type Environment = "production" | "preview";
type Args = { env?: Environment; manifest?: string; apply: boolean };
type ManifestResult = {
  originalMpn: string;
  queryMpn: string;
  status: string;
  searchKey: string;
  searchSha256?: string;
  detailKey?: string;
  detailSha256?: string;
  product?: DigiKeyProduct;
};
type Manifest = { generatedAt: string; results: ManifestResult[] };
type ResolvedResult = ManifestResult & { product: DigiKeyProduct };
type ManufacturerRow = { id: string; slug: string; name: string };
type ComponentRow = { id: string; manufacturer_id: string | null; manufacturer_part_number: string | null };
type ProjectRow = { project_id: string; version_id: string };
type BomRow = {
  project_id: string;
  bom_version_id: string;
  id: string;
  description: string;
  sort_order: number;
  component_id: string | null;
  selected_supplier_offer_id: string | null;
  completeness: string;
  confidence: number | null;
  evidence_locator: string | null;
};

type ImportRecord = {
  result: ResolvedResult;
  evidenceKey: string;
  manufacturerId: string;
  manufacturerSlug: string;
  insertManufacturer: boolean;
  componentId: string;
  componentSlug: string;
  offerId: string;
  evidenceId: string;
  historyId: string;
  priceMinor: number;
  observedAt: string;
  expiresAt: string;
  lines: Array<{ projectId: string; bomVersionId: string; item: BomItemLike; row: BomRow }>;
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
    } else if (arg === "--manifest") args.manifest = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.env) throw new Error("explicit --env production or --env preview is required");
  if (!args.manifest) throw new Error("--manifest is required");
  return args;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullable(value: string | number | null): string {
  if (value === null) return "NULL";
  return typeof value === "number" ? String(value) : sqlString(value);
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 58);
  return slug || "component";
}

function priceMinor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`invalid positive USD price: ${value}`);
  return Math.round((value + Number.EPSILON) * 100);
}

function evidenceKey(result: ManifestResult): string {
  return result.detailKey ?? result.searchKey;
}

function evidenceSha256(result: ManifestResult): string {
  const hash = result.detailKey ? result.detailSha256 : result.searchSha256;
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error(`missing valid SHA-256 for selected evidence page ${evidenceKey(result)}`);
  }
  return hash.toLowerCase();
}

function validateResult(result: ManifestResult): asserts result is ResolvedResult {
  if (result.status !== "resolved" || !result.product) throw new Error(`result ${result.queryMpn} is not resolved with exact product evidence`);
  if (normalizeDigiKeyMpn(result.product.manufacturerProductNumber) !== normalizeDigiKeyMpn(result.queryMpn)) {
    throw new Error(`exact MPN mismatch for ${result.originalMpn}`);
  }
  if (!/^raw-collection\/2026-08-14\/bom-pricing\/digikey(?:-generic)?\//.test(evidenceKey(result))) {
    throw new Error(`unexpected R2 evidence key for ${result.originalMpn}`);
  }
  evidenceSha256(result);
  if (!/^https:\/\/www\.digikey\.com\/en\/products\/detail\//.test(result.product.productUrl)) {
    throw new Error(`unexpected product URL for ${result.originalMpn}`);
  }
  priceMinor(result.product.lowestQuantityOnePriceUsd);
  if (!Number.isInteger(result.product.inStockQuantity) || result.product.inStockQuantity < 0) {
    throw new Error(`invalid stock quantity for ${result.originalMpn}`);
  }
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

function findSnapshotLines(snapshot: BomSnapshot, originalMpn: string) {
  return snapshot.projects.flatMap((project) => project.bom
    .map((item, index) => ({ project, item: item as BomItemLike, index }))
    .filter(({ item }) => String(item.mpn ?? "").trim() === originalMpn));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(args.manifest!);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as BomSnapshot;
  const resolvedResults = manifest.results.filter((result) => result.status === "resolved");
  if (!resolvedResults.length) throw new Error("manifest has no resolved results");
  resolvedResults.forEach(validateResult);

  const projectIds = [...new Set(resolvedResults.flatMap((result) => findSnapshotLines(snapshot, result.originalMpn).map(({ project }) => project.project_id)))];
  if (!projectIds.length) throw new Error("resolved products do not map to snapshot BOM lines");

  const [supplierRows, manufacturerRows, componentRows, projectRows, normalizedRows] = await Promise.all([
    query(args.env!, "SELECT id, slug, name FROM suppliers WHERE slug = 'digikey' AND is_demo = 0"),
    query(args.env!, "SELECT id, slug, name FROM manufacturers"),
    query(args.env!, "SELECT id, manufacturer_id, manufacturer_part_number FROM components WHERE deleted_at IS NULL"),
    query(args.env!, `SELECT p.id AS project_id, pv.id AS version_id FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id IN (${projectIds.map(sqlString).join(",")})`),
    query(args.env!, `SELECT b.project_id, b.current_version_id AS bom_version_id, bi.id, bi.description, bi.sort_order, bi.component_id, bi.selected_supplier_offer_id, bi.completeness, bi.confidence, bi.evidence_locator FROM boms b JOIN bom_items bi ON bi.bom_version_id = b.current_version_id WHERE b.project_id IN (${projectIds.map(sqlString).join(",")}) ORDER BY b.project_id, bi.sort_order`),
  ]) as [Array<{ id: string }>, ManufacturerRow[], ComponentRow[], ProjectRow[], BomRow[]];

  if (supplierRows.length !== 1) throw new Error("expected exactly one non-demo DigiKey supplier");
  const supplierId = supplierRows[0].id;
  const manufacturerByName = new Map(manufacturerRows.map((row) => [row.name.normalize("NFKC").trim().toLowerCase(), row]));
  const projectVersionIds = new Map(projectRows.map((row) => [row.project_id, row.version_id]));
  const normalizedByProject = new Map<string, BomRow[]>();
  for (const row of normalizedRows) normalizedByProject.set(row.project_id, [...(normalizedByProject.get(row.project_id) ?? []), row]);

  const records: ImportRecord[] = [];
  const seenManufacturers = new Map<string, { id: string; slug: string; insert: boolean }>();
  for (const result of resolvedResults) {
    validateResult(result);
    const manufacturerKey = result.product.manufacturer.normalize("NFKC").trim().toLowerCase();
    let manufacturer = seenManufacturers.get(manufacturerKey);
    if (!manufacturer) {
      const existing = manufacturerByName.get(manufacturerKey);
      const slug = existing?.slug ?? `${slugify(result.product.manufacturer)}-${stableId("", manufacturerKey).slice(-8)}`;
      manufacturer = { id: existing?.id ?? stableId("mfr", manufacturerKey), slug, insert: !existing };
      seenManufacturers.set(manufacturerKey, manufacturer);
    }

    const existingComponent = componentRows.find((row) => row.manufacturer_id === manufacturer!.id
      && normalizeDigiKeyMpn(row.manufacturer_part_number ?? "") === normalizeDigiKeyMpn(result.product.manufacturerProductNumber));
    if (existingComponent) throw new Error(`component already exists for ${result.product.manufacturer} ${result.product.manufacturerProductNumber}; refusing non-reversible first-batch update`);

    const componentId = stableId("cmp", `${manufacturer.id}\0${normalizeDigiKeyMpn(result.product.manufacturerProductNumber)}`);
    const componentSlug = `${slugify(result.product.manufacturer)}-${slugify(result.product.manufacturerProductNumber)}-${componentId.slice(-8)}`.slice(0, 80);
    const offerId = stableId("offer", `${supplierId}\0${componentId}\0${result.product.digiKeyPartNumber}\0US`);
    const archivedEvidenceKey = evidenceKey(result);
    const evidenceId = stableId("evidence", `${result.product.productUrl}\0${archivedEvidenceKey}`);
    const historyId = stableId("price", `${offerId}\0${manifest.generatedAt}`);
    const productPriceMinor = priceMinor(result.product.lowestQuantityOnePriceUsd);
    const observedAt = new Date(manifest.generatedAt).toISOString();
    const expiresAt = new Date(new Date(observedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const lineGroups = findSnapshotLines(snapshot, result.originalMpn);
    if (!lineGroups.length) throw new Error(`no snapshot BOM line for ${result.originalMpn}`);
    const lines = lineGroups.map(({ project, item }) => {
      if (!projectVersionIds.has(project.project_id)) throw new Error(`missing current production project ${project.project_id}`);
      const paired = pairSnapshotItemsWithNormalizedLines(project.bom as BomItemLike[], normalizedByProject.get(project.project_id) ?? []);
      const pair = paired.find((candidate) => candidate.item === item);
      if (!pair) throw new Error(`could not pair normalized BOM line for ${result.originalMpn} in ${project.slug}`);
      const row = pair.line as BomRow;
      if (row.component_id !== null || row.selected_supplier_offer_id !== null) throw new Error(`BOM line ${row.id} changed since audit; refusing overwrite`);
      return { projectId: project.project_id, bomVersionId: row.bom_version_id, item, row };
    });

    records.push({
      result,
      evidenceKey: archivedEvidenceKey,
      manufacturerId: manufacturer.id,
      manufacturerSlug: manufacturer.slug,
      insertManufacturer: manufacturer.insert,
      componentId,
      componentSlug,
      offerId,
      evidenceId,
      historyId,
      priceMinor: productPriceMinor,
      observedAt,
      expiresAt,
      lines,
    });
  }

  const duplicateComponentIds = records.map((record) => record.componentId).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateComponentIds.length) throw new Error(`duplicate resolved component records: ${duplicateComponentIds.join(",")}`);
  const existingGeneratedIds = await query(args.env!, `SELECT id, 'component' AS kind FROM components WHERE id IN (${records.map((record) => sqlString(record.componentId)).join(",")}) UNION ALL SELECT id, 'offer' AS kind FROM supplier_offers WHERE id IN (${records.map((record) => sqlString(record.offerId)).join(",")}) UNION ALL SELECT id, 'evidence' AS kind FROM evidence WHERE id IN (${records.map((record) => sqlString(record.evidenceId)).join(",")})`);
  if (existingGeneratedIds.length) throw new Error(`generated import IDs already exist; refusing non-reversible rerun: ${existingGeneratedIds.map((row) => `${row.kind}:${row.id}`).join(",")}`);

  const forward: string[] = [
    `-- ${basename(import.meta.url)} generated ${new Date().toISOString()}`,
    `-- env=${args.env} manifest=${manifestPath} apply=${args.apply}`,
  ];
  const rollbackHeader: string[] = [
    `-- rollback for ${basename(import.meta.url)} generated ${new Date().toISOString()}`,
    `-- env=${args.env} manifest=${manifestPath}`,
  ];
  const rollbackLines: string[] = [];
  const rollbackClaims: string[] = [];
  const rollbackHistory: string[] = [];
  const rollbackOffers: string[] = [];
  const rollbackEvidence: string[] = [];
  const rollbackComponents: string[] = [];

  const insertedManufacturerIds = new Set<string>();
  for (const record of records) {
    const { product } = record.result;
    if (record.insertManufacturer && !insertedManufacturerIds.has(record.manufacturerId)) {
      forward.push(`INSERT INTO manufacturers (id, slug, name, status, is_demo, created_at, updated_at) VALUES (${sqlString(record.manufacturerId)}, ${sqlString(record.manufacturerSlug)}, ${sqlString(product.manufacturer)}, 'active', 0, ${sqlString(record.observedAt)}, ${sqlString(record.observedAt)});`);
      insertedManufacturerIds.add(record.manufacturerId);
    }

    const priceBreaks = JSON.stringify(canonicalImportedPriceBreaks(product.priceBreaks));
    forward.push(
      `INSERT INTO components (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status, source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at) VALUES (${sqlString(record.componentId)}, ${sqlString(record.componentSlug)}, ${sqlString(record.manufacturerId)}, ${sqlString(product.manufacturerProductNumber)}, ${sqlString(product.description)}, 'Electronics', ${sqlString(`${product.manufacturer} ${product.manufacturerProductNumber}`)}, 'active', ${sqlString(product.productUrl)}, 'supplier-source', ${sqlString(record.observedAt)}, 0, 1, ${sqlString(record.observedAt)}, ${sqlString(record.observedAt)});`,
      `INSERT INTO supplier_offers (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency, unit_price_minor, minimum_quantity, stock_quantity, lead_time_days, availability, observed_at, expires_at, is_demo, created_at, updated_at, condition, price_breaks, reliability_score, risk_label, freshness_label) VALUES (${sqlString(record.offerId)}, ${sqlString(supplierId)}, ${sqlString(record.componentId)}, ${sqlString(product.digiKeyPartNumber)}, ${sqlString(product.productUrl)}, 'US', 'USD', ${record.priceMinor}, 1, ${product.inStockQuantity}, NULL, ${sqlString(product.inStockQuantity > 0 ? "in_stock" : "out_of_stock")}, ${sqlString(record.observedAt)}, ${sqlString(record.expiresAt)}, 0, ${sqlString(record.observedAt)}, ${sqlString(record.observedAt)}, 'new', ${sqlString(priceBreaks)}, 0.95, ${sqlString(IMPORTED_EXACT_MATCH_RISK_LABEL)}, 'fresh');`,
      `INSERT INTO offer_price_history (id, supplier_offer_id, currency, unit_price_minor, stock_quantity, observed_at, source_import_record_id, minimum_quantity, lead_time_days) VALUES (${sqlString(record.historyId)}, ${sqlString(record.offerId)}, 'USD', ${record.priceMinor}, ${product.inStockQuantity}, ${sqlString(record.observedAt)}, ${sqlString(record.evidenceKey)}, 1, NULL);`,
      `INSERT INTO evidence (id, source_type, source_url, title, publisher, retrieved_at, confidence, content_hash, excerpt, is_demo, created_at) VALUES (${sqlString(record.evidenceId)}, 'supplier-product-page', ${sqlString(product.productUrl)}, ${sqlString(`${product.manufacturerProductNumber} | DigiKey Electronics`)}, 'DigiKey', ${sqlString(record.observedAt)}, 0.95, ${sqlString(evidenceSha256(record.result))}, ${sqlString(`${product.description}; quantity-one price USD ${product.lowestQuantityOnePriceUsd.toFixed(2)}; stock ${product.inStockQuantity}; archived at r2://${record.evidenceKey}`)}, 0, ${sqlString(record.observedAt)});`,
      `INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, unit, confidence, created_at) VALUES (${sqlString(stableId("claim", `${record.evidenceId}\0mpn`))}, ${sqlString(record.evidenceId)}, 'component', ${sqlString(record.componentId)}, 'manufacturer_part_number', ${sqlString(product.manufacturerProductNumber)}, NULL, 1.0, ${sqlString(record.observedAt)});`,
      `INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, unit, confidence, created_at) VALUES (${sqlString(stableId("claim", `${record.evidenceId}\0price`))}, ${sqlString(record.evidenceId)}, 'supplier_offer', ${sqlString(record.offerId)}, 'unit_price_minor', ${sqlString(String(record.priceMinor))}, 'USD-cent', 0.95, ${sqlString(record.observedAt)});`,
      `INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, unit, confidence, created_at) VALUES (${sqlString(stableId("claim", `${record.evidenceId}\0stock`))}, ${sqlString(record.evidenceId)}, 'supplier_offer', ${sqlString(record.offerId)}, 'stock_quantity', ${sqlString(String(product.inStockQuantity))}, 'each', 0.95, ${sqlString(record.observedAt)});`,
    );
    for (const line of record.lines) {
      forward.push(`UPDATE bom_items SET component_id = ${sqlString(record.componentId)}, completeness = 'complete', confidence = 1.0, evidence_locator = ${sqlString(product.productUrl)} WHERE id = ${sqlString(line.row.id)} AND bom_version_id = ${sqlString(line.bomVersionId)} AND component_id IS NULL AND selected_supplier_offer_id IS NULL AND description = ${sqlString(line.row.description)};`);
      rollbackLines.push(`UPDATE bom_items SET component_id = NULL, selected_supplier_offer_id = ${sqlNullable(line.row.selected_supplier_offer_id)}, completeness = ${sqlString(line.row.completeness)}, confidence = ${sqlNullable(line.row.confidence)}, evidence_locator = ${sqlNullable(line.row.evidence_locator)} WHERE id = ${sqlString(line.row.id)} AND bom_version_id = ${sqlString(line.bomVersionId)} AND component_id = ${sqlString(record.componentId)};`);
    }
    rollbackClaims.push(`DELETE FROM evidence_claims WHERE evidence_id = ${sqlString(record.evidenceId)};`);
    rollbackHistory.push(`DELETE FROM offer_price_history WHERE id = ${sqlString(record.historyId)};`);
    rollbackOffers.push(`DELETE FROM supplier_offers WHERE id = ${sqlString(record.offerId)};`);
    rollbackEvidence.push(`DELETE FROM evidence WHERE id = ${sqlString(record.evidenceId)};`);
    rollbackComponents.push(`DELETE FROM components WHERE id = ${sqlString(record.componentId)};`);
  }

  const rollbackManufacturers = [...insertedManufacturerIds]
    .map((id) => `DELETE FROM manufacturers WHERE id = ${sqlString(id)};`);
  const rollback = [
    ...rollbackHeader,
    ...rollbackLines,
    ...rollbackClaims,
    ...rollbackHistory,
    ...rollbackOffers,
    ...rollbackEvidence,
    ...rollbackComponents,
    ...rollbackManufacturers,
  ];

  const scratch = process.env.JCODE_SCRATCH_DIR || "/root/.jcode/scratch";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sqlPath = `${scratch}/import-bom-pricing-${args.env}-${stamp}.sql`;
  const rollbackPath = `${scratch}/rollback-bom-pricing-${args.env}-${stamp}.sql`;
  writeFileSync(sqlPath, `${forward.join("\n")}\n`);
  writeFileSync(rollbackPath, `${rollback.join("\n")}\n`);

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    env: args.env,
    manifest: manifestPath,
    sqlPath,
    rollbackPath,
    resolvedProducts: records.length,
    linkedBomLines: records.reduce((count, record) => count + record.lines.length, 0),
    manufacturersInserted: insertedManufacturerIds.size,
    componentsInserted: records.length,
    positiveOffersInserted: records.length,
    products: records.map((record) => ({
      originalMpn: record.result.originalMpn,
      manufacturer: record.result.product.manufacturer,
      mpn: record.result.product.manufacturerProductNumber,
      priceMinor: record.priceMinor,
      stock: record.result.product.inStockQuantity,
      bomLines: record.lines.map((line) => line.row.id),
      r2EvidenceKey: record.evidenceKey,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!args.apply) {
    console.log("DRY RUN ONLY. Review both SQL artifacts, then rerun with --apply if intended. No database rows were modified.");
    return;
  }
  await executeFile(args.env!, sqlPath);
  const verification = await query(args.env!, `SELECT
    (SELECT COUNT(*) FROM components WHERE id IN (${records.map((record) => sqlString(record.componentId)).join(",")})) AS components,
    (SELECT COUNT(*) FROM supplier_offers WHERE id IN (${records.map((record) => sqlString(record.offerId)).join(",")}) AND unit_price_minor > 0) AS positive_offers,
    (SELECT COUNT(*) FROM evidence WHERE id IN (${records.map((record) => sqlString(record.evidenceId)).join(",")})) AS evidence_rows,
    (SELECT COUNT(*) FROM bom_items WHERE ${records.flatMap((record) => record.lines.map((line) => `(id = ${sqlString(line.row.id)} AND component_id = ${sqlString(record.componentId)})`)).join(" OR ")}) AS linked_bom_lines`);
  const observed = verification[0] as { components?: number; positive_offers?: number; evidence_rows?: number; linked_bom_lines?: number } | undefined;
  const expectedLines = records.reduce((count, record) => count + record.lines.length, 0);
  if (
    Number(observed?.components) !== records.length
    || Number(observed?.positive_offers) !== records.length
    || Number(observed?.evidence_rows) !== records.length
    || Number(observed?.linked_bom_lines) !== expectedLines
  ) {
    throw new Error(`post-import verification failed: ${JSON.stringify(observed)}; rollback SQL: ${rollbackPath}`);
  }
  console.log(JSON.stringify({ appliedStatements: forward.length - 2, verification: observed, rollbackPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
