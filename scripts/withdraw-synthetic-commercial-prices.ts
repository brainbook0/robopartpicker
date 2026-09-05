#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { captureWranglerJson, runWrangler } from "./wrangler-cli";
import { sqlString } from "../src/lib/physical-design-wave-import";
import { resolveUpstreamIdentity } from "../src/shared/provenance";

type Environment = "production" | "preview";
type WranglerStatement<T> = { results?: T[] };
type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  maintainer: string | null;
  robot_category: string | null;
  upstream_url: string | null;
  current_version_id: string;
  rpps_json: string;
};
type ReviewedProfile = {
  slug: string;
  manufacturer: string;
  model: string;
  description: string;
  retrievedAt: string;
  officialProductUrl: string;
};

type CleanupRecord = {
  projectId: string;
  slug: string;
  versionId: string;
  previousMethod: string;
  summary: string;
  description: string;
  rppsJson: string;
};

const args = process.argv.slice(2);
const env = valueAfter("--env") as Environment | undefined;
const apply = args.includes("--apply");
if (env !== "production" && env !== "preview") throw new Error("Use --env production or --env preview.");

const root = resolve(".ingest", "commercial-price-cleanup", env);
const reportPath = resolve(root, "report.json");
const profilePayload = JSON.parse(readFileSync(resolve("data/commercial-catalog/profiles/top-300.json"), "utf8")) as { profiles: ReviewedProfile[] };
const profiles = new Map(profilePayload.profiles.map((profile) => [profile.slug, profile]));
const profilesBySource = new Map(profilePayload.profiles.map((profile) => [resolveUpstreamIdentity({ upstreamUrl: profile.officialProductUrl }), profile]));
const rows = query<ProjectRow>(`SELECT p.id,p.slug,p.name,p.maintainer,p.robot_category,p.upstream_url,p.current_version_id,pv.rpps_json
  FROM projects p JOIN project_versions pv ON pv.id=p.current_version_id
  WHERE p.project_kind='commercial_showcase' AND p.deleted_at IS NULL
  AND json_extract(pv.rpps_json,'$.commercial_profile.price.methodVersion')='category-baseline-v1'
  ORDER BY p.slug`);

const cleaned: CleanupRecord[] = rows.map((row) => {
  const profile = profiles.get(row.slug) ?? profilesBySource.get(resolveUpstreamIdentity({ upstreamUrl: row.upstream_url }));
  if (!profile) throw new Error(`${row.slug}: no reviewed top-300 profile matches the production project.`);
  const rpps = JSON.parse(row.rpps_json) as Record<string, unknown>;
  const commercial = object(rpps.commercial_profile);
  const oldPrice = object(commercial?.price);
  if (!commercial || oldPrice?.methodVersion !== "category-baseline-v1") throw new Error(`${row.slug}: cleanup signature changed.`);
  const description = reviewedDescription(profile);
  commercial.official_description = description;
  commercial.price = {
    kind: "not_published",
    confidence: 0.9,
    methodVersion: "official-page-price-status-v1",
    valuedAt: profile.retrievedAt,
    sourceUrls: [profile.officialProductUrl],
    summary: "No source-backed price is recorded for this model.",
  };
  rpps.commercial_profile = commercial;
  if (!description) throw new Error(`${row.slug}: reviewed description is empty.`);
  rpps.summary = description.slice(0, 280);
  rpps.description = description;
  return {
    projectId: row.id,
    slug: row.slug,
    versionId: row.current_version_id,
    previousMethod: String(oldPrice.methodVersion),
    summary: description.slice(0, 280),
    description,
    rppsJson: JSON.stringify(rpps),
  };
});

mkdirSync(root, { recursive: true });
const waves: string[] = [];
for (let start = 0; start < cleaned.length; start += 25) {
  const wave = cleaned.slice(start, start + 25);
  const path = resolve(root, `wave-${String(waves.length + 1).padStart(3, "0")}.sql`);
  writeFileSync(path, renderSql(wave.flatMap(statementsFor)));
  waves.push(path);
}
const report = { environment: env, affected: cleaned.length, waves: waves.length, apply, records: cleaned.map(({ projectId, slug, versionId, previousMethod }) => ({ projectId, slug, versionId, previousMethod })) };
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ affected: cleaned.length, waves: waves.length, reportPath, mode: apply ? "apply" : "dry-run" }));

if (apply) {
  waves.forEach((path, index) => {
    console.error(`Applying commercial price cleanup ${index + 1}/${waves.length}`);
    runWrangler(["d1", "execute", "DB", "--env", env, "--remote", "--file", path]);
  });
  const audit = query<{ metric: string; count: number }>(`SELECT 'active_category_baselines' metric,COUNT(*) count FROM project_price_estimates WHERE method_version='category-baseline-v1' AND status='active';
    SELECT 'baseline_rpps' metric,COUNT(*) count FROM projects p JOIN project_versions pv ON pv.id=p.current_version_id WHERE p.project_kind='commercial_showcase' AND json_extract(pv.rpps_json,'$.commercial_profile.price.methodVersion')='category-baseline-v1';
    SELECT 'explicit_unpublished_price' metric,COUNT(*) count FROM projects p JOIN project_versions pv ON pv.id=p.current_version_id WHERE p.project_kind='commercial_showcase' AND json_extract(pv.rpps_json,'$.commercial_profile.price.kind')='not_published';
    SELECT 'top300_project_costs' metric,COUNT(*) count FROM projects WHERE project_kind='commercial_showcase' AND revision='catalog-2026-08-25-top300-v1' AND estimated_cost_minor IS NOT NULL;
    SELECT 'current_generated_copy' metric,COUNT(*) count FROM projects WHERE project_kind='commercial_showcase' AND revision='catalog-2026-08-25-top300-v1' AND current_description_generation_id IS NOT NULL;`);
  console.log(JSON.stringify({ applied: true, audit }));
  const counts = Object.fromEntries(audit.map((row) => [row.metric, Number(row.count)]));
  if (counts.active_category_baselines !== 0 || counts.baseline_rpps !== 0 || counts.top300_project_costs !== 0 || counts.current_generated_copy !== 0 || counts.explicit_unpublished_price !== cleaned.length) {
    throw new Error(`Commercial price cleanup audit failed: ${JSON.stringify(counts)}`);
  }
}

function statementsFor(record: CleanupRecord): string[] {
  const now = "2026-08-26T15:00:00.000Z";
  return [
    `UPDATE project_versions SET rpps_json=${sqlString(record.rppsJson)}, changelog='Removed synthetic category price baseline; retained reviewed manufacturer metadata and explicit no-source-backed-price status' WHERE id=${sqlString(record.versionId)} AND project_id=${sqlString(record.projectId)} AND EXISTS (SELECT 1 FROM projects WHERE id=${sqlString(record.projectId)} AND current_version_id=${sqlString(record.versionId)} AND project_kind='commercial_showcase')`,
    `UPDATE projects SET summary=${sqlString(record.summary)}, description=${sqlString(record.description)}, estimated_cost_minor=NULL, estimated_cost_currency=NULL, current_description_generation_id=NULL, version=version+1, updated_at=${sqlString(now)} WHERE id=${sqlString(record.projectId)} AND current_version_id=${sqlString(record.versionId)} AND project_kind='commercial_showcase'`,
    `UPDATE project_price_estimates SET status='withdrawn', updated_at=${sqlString(now)} WHERE project_id=${sqlString(record.projectId)} AND method_version='category-baseline-v1' AND status='active'`,
    `DELETE FROM search_index WHERE entity_type='project' AND entity_id=${sqlString(record.projectId)}`,
    `INSERT INTO search_index (entity_type,entity_id,title,body,tags) SELECT 'project',id,name,${sqlString(`${record.summary} ${record.description}`)},'commercial-showcase closed-source' FROM projects WHERE id=${sqlString(record.projectId)}`,
  ];
}

function query<T>(sql: string): T[] {
  const payload = captureWranglerJson<Array<WranglerStatement<T>>>(["d1", "execute", "DB", "--env", env!, "--remote", "--command", sql]);
  return payload.flatMap((statement) => statement.results ?? []);
}
function renderSql(statements: string[]): string { return `${statements.map((statement) => `${statement.trim().replace(/;$/u, "")};`).join("\n")}\n`; }
function valueAfter(name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function reviewedDescription(profile: ReviewedProfile): string {
  const marker = `${profile.manufacturer} ${profile.model} is a complete closed-source`;
  const markerIndex = profile.description.indexOf(marker);
  if (markerIndex < 0) return profile.description.trim();
  const vendorCopy = profile.description.slice(0, markerIndex).trim();
  const identityCopy = profile.description.slice(markerIndex).trim();
  const generic = new Set(["robot", "mobile", "series", "html", "industrial", "collaborative", "manipulator", "humanoid", "home", "platform", "system", "cobot", "robotics"]);
  const modelTokens = profile.model.match(/[A-Za-z0-9]+/gu)?.map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2 && !generic.has(token)) ?? [];
  const normalizedVendor = vendorCopy.toLowerCase();
  const namesExactModel = modelTokens.some((token) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(token)}([^a-z0-9]|$)`, "u").test(normalizedVendor));
  return namesExactModel ? `${vendorCopy} ${identityCopy}` : identityCopy;
}
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
