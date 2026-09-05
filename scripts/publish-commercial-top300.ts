#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { commercialProjectId, commercialVersionId, type ExistingCommercialProjectIdentity } from "../src/lib/commercial-showcase-import";
import { stableId, sqlString } from "../src/lib/physical-design-wave-import";
import { resolveUpstreamIdentity } from "../src/shared/provenance";
import { applyCommercialIdentityOverride } from "../src/lib/commercial-identity";
import type { CommercialProfile } from "../src/lib/commercial-catalog";
import { captureWranglerJson, runWrangler } from "./wrangler-cli";

type WranglerStatement<T> = { results?: T[] };
type ExistingProject = ExistingCommercialProjectIdentity & { owner_user_id: string | null; project_kind: string };
type MediaManifestItem = {
  slug: string; rank: number; fileId: string; objectKey: string; contentUrl: string; mediaType: string; sizeBytes: number;
  checksumSha256: string; sourceUrl: string; sourcePageUrl: string; retrievedAt: string; title: string; altText: string; attribution: string; transform: string;
};
type PublicationItem = { profile: CommercialProfile; media: MediaManifestItem; projectId: string; projectSlug: string; versionId: string; upstreamIdentity: string };
const OWNER = "robotics-catalog-import";
const PROJECT_KIND = "commercial_showcase";
const PRODUCTION_GATE = "ROBOPARTPICKER_TOP300_APPLY";
const REVISION = "catalog-2026-08-25-top300-v1";
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const environment = argument("--env");
const apply = process.argv.includes("--apply");
if (!environment || !["local", "preview", "production"].includes(environment)) throw new Error("Usage: tsx scripts/publish-commercial-top300.ts --env local|preview|production [--apply]");
if (apply && environment === "production" && process.env[PRODUCTION_GATE] !== "apply-production-top300") throw new Error(`Refusing production apply without ${PRODUCTION_GATE}=apply-production-top300`);
const profilesPath = resolve(argument("--profiles") ?? "data/commercial-catalog/profiles/top-300.json");
const mediaPath = resolve(argument("--media") ?? "data/commercial-catalog/media/top-300-manifest.json");
const outputDirectory = resolve(argument("--output-dir") ?? `.ingest/commercial-publication/${environment}`);
const profilePayload = JSON.parse(readFileSync(profilesPath, "utf8")) as { generatedAt: string; profiles: CommercialProfile[]; invalid: unknown[] };
const mediaPayload = JSON.parse(readFileSync(mediaPath, "utf8")) as { items: MediaManifestItem[]; failures: unknown[] };
if (profilePayload.profiles.length !== 300 || profilePayload.invalid.length) throw new Error("Publication requires exactly 300 valid profiles and zero profile failures.");
if (mediaPayload.items.length !== 300 || mediaPayload.failures.length) throw new Error("Publication requires exactly 300 mirrored media items and zero media failures.");
const mediaBySlug = new Map(mediaPayload.items.map((item) => [item.slug, item]));
const existing = existingProjects();
const items = profilePayload.profiles.map((profile) => publicationItem(profile, mediaBySlug, existing));
if (new Set(items.map((item) => item.projectId)).size !== 300) throw new Error("Resolved project IDs are not unique.");
if (new Set(items.map((item) => item.profile.trend.rank)).size !== 300) throw new Error("Trend ranks are not unique.");
mkdirSync(outputDirectory, { recursive: true });
const wavePaths: string[] = [];
for (let start = 0; start < items.length; start += 100) {
  const wave = Math.floor(start / 100) + 1;
  const path = join(outputDirectory, `wave-${wave}-${start + 1}-${Math.min(start + 100, items.length)}.sql`);
  const statements = items.slice(start, start + 100).flatMap(statementsFor);
  if (environment === "local" && start === 0) statements.unshift(`INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (${sqlString(OWNER)}, 'Robotics catalog importer', 'robotics-catalog-import@local.invalid', 1, NULL, ${sqlString(profilePayload.generatedAt)}, ${sqlString(profilePayload.generatedAt)}) ON CONFLICT(id) DO NOTHING`);
  writeFileSync(path, renderSql(statements));
  wavePaths.push(path);
}
const finalPath = join(outputDirectory, "finalize-active-trends.sql");
writeFileSync(finalPath, renderSql([
  "UPDATE project_trend_snapshots SET active = 0 WHERE active = 1",
  `UPDATE project_trend_snapshots SET active = 1 WHERE methodology_version = ${sqlString(items[0].profile.trend.methodologyVersion)} AND window_end = ${sqlString(items[0].profile.trend.windowEnd)} AND project_id IN (${items.map((item) => sqlString(item.projectId)).join(", ")})`,
]));
const planPath = join(outputDirectory, "publication-plan.json");
writeFileSync(planPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), environment, profiles: items.length, existingMatched: items.filter((item) => existing.some((project) => project.id === item.projectId)).length, newProjects: items.filter((item) => !existing.some((project) => project.id === item.projectId)).length, waves: wavePaths, finalPath, mappings: items.map((item) => ({ rank: item.profile.trend.rank, candidateSlug: item.profile.slug, projectId: item.projectId, projectSlug: item.projectSlug, upstreamIdentity: item.upstreamIdentity, fileId: item.media.fileId })) }, null, 2)}\n`);
console.log(JSON.stringify({ planPath, environment, profiles: items.length, waves: wavePaths.length, existingMatched: items.filter((item) => existing.some((project) => project.id === item.projectId)).length }));
if (apply) {
  for (const path of wavePaths) { runSqlFile(path); console.log(`applied ${path}`); }
  runSqlFile(finalPath); console.log(`applied ${finalPath}`);
  const verification = verify(items);
  console.log("VERIFIED", JSON.stringify(verification));
  if (Object.values(verification).some((value) => value !== 300)) throw new Error(`Publication verification failed: ${JSON.stringify(verification)}`);
} else console.log("DRY RUN ONLY. Review generated SQL and rerun with --apply.");

function existingProjects(): ExistingProject[] {
  const args = environment === "local"
    ? ["d1", "execute", "DB", "--local", "--command", "SELECT id, slug, repository_url, upstream_url, lower(upstream_identity) AS upstream_identity, current_version_id, owner_user_id, project_kind FROM projects"]
    : ["d1", "execute", "DB", "--env", environment!, "--remote", "--command", "SELECT id, slug, repository_url, upstream_url, lower(upstream_identity) AS upstream_identity, current_version_id, owner_user_id, project_kind FROM projects"];
  return captureWranglerJson<Array<WranglerStatement<ExistingProject>>>(args).flatMap((statement) => statement.results ?? []);
}

function publicationItem(profile: CommercialProfile, mediaBySlug: Map<string, MediaManifestItem>, projects: ExistingProject[]): PublicationItem {
  const media = mediaBySlug.get(profile.slug); if (!media) throw new Error(`Missing media manifest for ${profile.slug}`);
  const upstreamIdentity = resolveUpstreamIdentity({ upstreamUrl: profile.officialProductUrl, repositoryUrl: null });
  if (!upstreamIdentity) throw new Error(`Unable to canonicalize official URL for ${profile.slug}`);
  const deterministicId = commercialProjectId(profile.slug);
  const matches = projects.filter((project) => project.id === deterministicId || project.slug.toLowerCase() === profile.slug.toLowerCase() || project.upstream_identity === upstreamIdentity || canonical(project.upstream_url) === upstreamIdentity || canonical(project.repository_url) === upstreamIdentity);
  const unique = [...new Map(matches.map((project) => [project.id, project])).values()];
  if (unique.length > 1) throw new Error(`Multiple existing projects match ${profile.slug}: ${unique.map((item) => item.id).join(", ")}`);
  if (unique[0] && (unique[0].owner_user_id !== OWNER || unique[0].project_kind !== PROJECT_KIND)) throw new Error(`Refusing to overwrite non-catalog project ${unique[0].id} matched by ${profile.slug}`);
  const projectId = unique[0]?.id ?? deterministicId;
  return { profile, media, projectId, projectSlug: unique[0]?.slug ?? profile.slug, versionId: commercialVersionId(projectId, REVISION), upstreamIdentity };
}
function canonical(value: string | null): string | null { return resolveUpstreamIdentity({ upstreamUrl: value, repositoryUrl: value }); }

function statementsFor(item: PublicationItem): string[] {
  const { media, projectId, projectSlug, versionId, upstreamIdentity } = item;
  const profile = applyCommercialIdentityOverride(item.profile);
  const now = profile.trend.capturedAt;
  const hasSourceBackedPrice = profile.price.kind !== "not_published" && profile.price.methodVersion !== "category-baseline-v1";
  const publishedPrice = hasSourceBackedPrice && profile.price.kind !== "not_published" ? profile.price : null;
  const priceStatus = publishedPrice ?? {
    kind: "not_published" as const,
    confidence: 0.9,
    methodVersion: "official-page-price-status-v1",
    valuedAt: profile.retrievedAt,
    sourceUrls: [profile.officialProductUrl],
    summary: "No source-backed price is recorded for this model.",
  };
  const evidenceIds = profile.evidence.map((_, index) => stableId("evidence", `${projectId}:${REVISION}:${index}`));
  const summary = profile.description.slice(0, 280);
  const rpps = {
    rpps_version: "1.0.0", name: profile.name, slug: projectSlug, version: REVISION, summary,
    authors: [{ name: profile.manufacturer, role: "manufacturer", url: profile.officialProductUrl }],
    upstream_url: profile.officialProductUrl, docs_url: profile.officialDocsUrl ?? profile.officialProductUrl,
    project_kind: PROJECT_KIND, robot_category: profile.category,
    tags: ["commercial-showcase", "closed-source", profile.category, "top-300"], cover_image_url: media.contentUrl, bom: [],
    evidence: profile.evidence.map((evidence) => ({ claim: evidence.title, source_type: evidence.sourceType, source_url: evidence.sourceUrl, retrieved_at: evidence.retrievedAt, confidence: evidence.confidence })),
    reproducibility: { access: "closed-source", design_files: false, bom: false, cad: false, assembly: false, pricing: publishedPrice?.kind === "published_price" || publishedPrice?.kind === "published_range" },
    specs: profile.specs.map((spec) => ({ key: spec.key, label: spec.label, value: spec.undisclosed ? "Not publicly disclosed" : spec.value, unit: spec.unit, source_url: spec.sourceUrl, observed_at: spec.observedAt, confidence: spec.confidence })),
    commercial_profile: { official_description: profile.description, use_cases: profile.useCases, price: priceStatus, trend: profile.trend, media: [{ ...profile.media[0], managed_content_url: media.contentUrl, checksum_sha256: media.checksumSha256 }] },
  };
  const estimatedCostMinor = publishedPrice ? String(publishedPrice.minMinor) : "NULL";
  const estimatedCostCurrency = publishedPrice ? "'USD'" : "NULL";
  const lines = [
    `INSERT INTO projects (id, slug, name, summary, description, owner_user_id, visibility, status, current_version_id, license_spdx, repository_url, difficulty, estimated_cost_minor, estimated_cost_currency, is_demo, created_at, updated_at, upstream_revision, revision, upstream_url, upstream_identity, maintainer, ingested_at, last_checked_at, publishability, github_stars, project_kind, robot_category) VALUES (${sqlString(projectId)}, ${sqlString(projectSlug)}, ${sqlString(profile.name)}, ${sqlString(summary)}, ${sqlString(profile.description)}, ${sqlString(OWNER)}, 'public', 'published', NULL, NULL, NULL, NULL, ${estimatedCostMinor}, ${estimatedCostCurrency}, 0, ${sqlString(now)}, ${sqlString(now)}, ${sqlString(REVISION)}, ${sqlString(REVISION)}, ${sqlString(profile.officialProductUrl)}, ${sqlString(upstreamIdentity)}, ${sqlString(profile.manufacturer)}, ${sqlString(profile.retrievedAt)}, ${sqlString(now)}, 'review', NULL, ${sqlString(PROJECT_KIND)}, ${sqlString(profile.category)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name, summary=excluded.summary, description=excluded.description, visibility='public', status='published', license_spdx=NULL, repository_url=NULL, estimated_cost_minor=excluded.estimated_cost_minor, estimated_cost_currency=excluded.estimated_cost_currency, updated_at=excluded.updated_at, upstream_revision=excluded.upstream_revision, revision=excluded.revision, upstream_url=excluded.upstream_url, upstream_identity=excluded.upstream_identity, maintainer=excluded.maintainer, last_checked_at=excluded.last_checked_at, project_kind=excluded.project_kind, robot_category=excluded.robot_category WHERE projects.owner_user_id=${sqlString(OWNER)} AND projects.project_kind=${sqlString(PROJECT_KIND)}`,
    `INSERT INTO project_versions (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at, published_at) VALUES (${sqlString(versionId)}, ${sqlString(projectId)}, ${sqlString(REVISION)}, '1.0.0', 'Published reviewed top-300 commercial profile with source-backed metadata, estimate, trend snapshot, and managed product thumbnail.', ${sqlString(JSON.stringify(rpps))}, 'published', ${sqlString(OWNER)}, ${sqlString(now)}, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET rpps_json=excluded.rpps_json, changelog=excluded.changelog, status='published', published_at=excluded.published_at`,
    `UPDATE projects SET current_version_id=${sqlString(versionId)}, updated_at=${sqlString(now)} WHERE id=${sqlString(projectId)} AND owner_user_id=${sqlString(OWNER)} AND project_kind=${sqlString(PROJECT_KIND)}`,
  ];
  profile.evidence.forEach((evidence, index) => {
    const evidenceId = evidenceIds[index]; const claimId = stableId("claim", `${evidenceId}:project:${projectId}`);
    lines.push(
      `INSERT INTO evidence (id, source_type, source_url, title, publisher, retrieved_at, confidence, excerpt, is_demo, created_at) VALUES (${sqlString(evidenceId)}, ${sqlString(evidence.sourceType)}, ${sqlString(evidence.sourceUrl)}, ${sqlString(evidence.title)}, ${sqlString(profile.manufacturer)}, ${sqlString(evidence.retrievedAt)}, ${evidence.confidence}, ${sqlString(evidence.title)}, 0, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url, title=excluded.title, publisher=excluded.publisher, retrieved_at=excluded.retrieved_at, confidence=excluded.confidence, excerpt=excluded.excerpt`,
      `INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, confidence, created_at) VALUES (${sqlString(claimId)}, ${sqlString(evidenceId)}, 'project', ${sqlString(projectId)}, ${sqlString(`commercial_profile.evidence.${index}`)}, ${sqlString(evidence.title)}, ${evidence.confidence}, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET evidence_id=excluded.evidence_id, claim_value=excluded.claim_value, confidence=excluded.confidence`,
    );
  });
  profile.specs.forEach((spec, index) => {
    const id = stableId("spec", `${projectId}:${spec.key}:${REVISION}`); const value = spec.undisclosed ? "Not publicly disclosed" : String(spec.value);
    lines.push(
      `UPDATE project_specs SET is_current=0, updated_at=${sqlString(now)} WHERE project_id=${sqlString(projectId)} AND spec_key=${sqlString(spec.key)} AND id<>${sqlString(id)} AND is_current=1`,
      `INSERT INTO project_specs (id, project_id, spec_key, label, value_text, value_number, unit, confidence, observed_at, evidence_id, is_current, sort_order, created_at, updated_at) VALUES (${sqlString(id)}, ${sqlString(projectId)}, ${sqlString(spec.key)}, ${sqlString(spec.label)}, ${sqlString(value)}, NULL, ${spec.unit ? sqlString(spec.unit) : "NULL"}, ${spec.confidence}, ${sqlString(spec.observedAt)}, ${evidenceIds[0] ? sqlString(evidenceIds[0]) : "NULL"}, 1, ${index}, ${sqlString(now)}, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET label=excluded.label, value_text=excluded.value_text, unit=excluded.unit, confidence=excluded.confidence, observed_at=excluded.observed_at, evidence_id=excluded.evidence_id, is_current=1, sort_order=excluded.sort_order, updated_at=excluded.updated_at`,
    );
  });
  if (publishedPrice) {
    const priceId = stableId("price", `${projectId}:${publishedPrice.methodVersion}:${publishedPrice.valuedAt}`);
    const confidence = publishedPrice.confidence >= 0.75 ? "high" : publishedPrice.confidence >= 0.4 ? "medium" : "low";
    lines.push(
      `UPDATE project_price_estimates SET status='superseded', updated_at=${sqlString(now)} WHERE project_id=${sqlString(projectId)} AND status='active' AND id<>${sqlString(priceId)}`,
      `INSERT INTO project_price_estimates (id, project_id, estimate_type, currency, min_minor, max_minor, representative_minor, confidence, method_version, summary, valued_at, expires_at, status, created_at, updated_at) VALUES (${sqlString(priceId)}, ${sqlString(projectId)}, ${sqlString(publishedPrice.kind)}, 'USD', ${publishedPrice.minMinor}, ${publishedPrice.maxMinor}, ${publishedPrice.minMinor}, ${sqlString(confidence)}, ${sqlString(publishedPrice.methodVersion)}, 'Source-backed commercial price observation.', ${sqlString(publishedPrice.valuedAt)}, ${publishedPrice.expiresAt ? sqlString(publishedPrice.expiresAt) : "NULL"}, 'active', ${sqlString(now)}, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET min_minor=excluded.min_minor, max_minor=excluded.max_minor, representative_minor=excluded.representative_minor, confidence=excluded.confidence, summary=excluded.summary, valued_at=excluded.valued_at, expires_at=excluded.expires_at, status='active', updated_at=excluded.updated_at`,
    );
  } else {
    lines.push(`UPDATE project_price_estimates SET status='withdrawn', updated_at=${sqlString(now)} WHERE project_id=${sqlString(projectId)} AND method_version='category-baseline-v1' AND status='active'`);
  }
  const trendId = stableId("trend", `${projectId}:${profile.trend.methodologyVersion}:${profile.trend.windowEnd}`);
  lines.push(`INSERT INTO project_trend_snapshots (id, project_id, methodology_version, window_start, window_end, search_score, news_score, video_score, official_score, first_party_traffic_score, traffic_sample_sufficient, composite_score, rank, active, captured_at, created_at) VALUES (${sqlString(trendId)}, ${sqlString(projectId)}, ${sqlString(profile.trend.methodologyVersion)}, ${sqlString(profile.trend.windowStart)}, ${sqlString(profile.trend.windowEnd)}, ${Math.round(profile.trend.searchInterest)}, ${Math.round(profile.trend.newsVelocity)}, ${Math.round(profile.trend.videoViewVelocity)}, ${Math.round(profile.trend.officialActivity)}, ${profile.trend.firstPartyTraffic == null ? "NULL" : Math.round(profile.trend.firstPartyTraffic)}, ${profile.trend.trafficSampleSufficient ? 1 : 0}, ${Math.round(profile.trend.compositeScore)}, ${profile.trend.rank}, 0, ${sqlString(profile.trend.capturedAt)}, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET search_score=excluded.search_score, news_score=excluded.news_score, video_score=excluded.video_score, official_score=excluded.official_score, first_party_traffic_score=excluded.first_party_traffic_score, traffic_sample_sufficient=excluded.traffic_sample_sufficient, composite_score=excluded.composite_score, rank=excluded.rank, active=0, captured_at=excluded.captured_at`);
  const fileMetadata = { sourceUrl: media.sourceUrl, sourcePageUrl: media.sourcePageUrl, retrievedAt: media.retrievedAt, attribution: media.attribution, transform: media.transform, rightsBasis: "manufacturer-attributed product-identification thumbnail; takedown on verified rights-holder request" };
  const mediaId = stableId("media", `${projectId}:${media.fileId}:top300-v1`);
  lines.push(
    `INSERT INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256, owner_user_id, organization_id, visibility, status, kind, metadata_json, created_at, updated_at, deleted_at) VALUES (${sqlString(media.fileId)}, ${sqlString(media.objectKey)}, 'cover.webp', 'image/webp', ${media.sizeBytes}, ${sqlString(media.checksumSha256)}, ${sqlString(OWNER)}, NULL, 'public', 'ready', 'image', ${sqlString(JSON.stringify(fileMetadata))}, ${sqlString(now)}, ${sqlString(now)}, NULL) ON CONFLICT(id) DO UPDATE SET object_key=excluded.object_key, media_type='image/webp', size_bytes=excluded.size_bytes, checksum_sha256=excluded.checksum_sha256, visibility='public', status='ready', metadata_json=excluded.metadata_json, updated_at=excluded.updated_at, deleted_at=NULL`,
    `INSERT INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at) VALUES (${sqlString(projectId)}, ${sqlString(versionId)}, ${sqlString(media.fileId)}, 'cover', 'cover.webp', ${sqlString(now)}) ON CONFLICT(project_id, file_id) DO UPDATE SET project_version_id=excluded.project_version_id, purpose='cover', relative_path='cover.webp'`,
    `INSERT INTO project_media (id, project_id, file_id, caption, alt_text, sort_order, created_at) VALUES (${sqlString(mediaId)}, ${sqlString(projectId)}, ${sqlString(media.fileId)}, ${sqlString(media.title)}, ${sqlString(media.altText)}, 0, ${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET file_id=excluded.file_id, caption=excluded.caption, alt_text=excluded.alt_text, sort_order=0`,
    `DELETE FROM search_index WHERE entity_type='project' AND entity_id=${sqlString(projectId)}`,
    `INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('project', ${sqlString(projectId)}, ${sqlString(profile.name)}, ${sqlString(`${profile.description} ${profile.useCases.join(" ")}`)}, ${sqlString(`commercial-showcase closed-source top-300 ${profile.category}`)})`,
  );
  return lines;
}
function renderSql(statements: string[]): string { return `${statements.map((statement) => `${statement.trim().replace(/;$/u, "")};`).join("\n")}\n`; }
function runSqlFile(path: string): void {
  const args = environment === "local" ? ["d1", "execute", "DB", "--local", "--file", path] : ["d1", "execute", "DB", "--env", environment!, "--remote", "--file", path];
  runWrangler(args);
}
function verify(publication: PublicationItem[]): Record<string, number> {
  const ids = publication.map((item) => sqlString(item.projectId)).join(","); const fileIds = publication.map((item) => sqlString(item.media.fileId)).join(",");
  const sql = `SELECT 'projects' AS metric, COUNT(*) AS count FROM projects WHERE id IN (${ids}) AND status='published' AND visibility='public'; SELECT 'prices' AS metric, COUNT(*) AS count FROM project_price_estimates WHERE project_id IN (${ids}) AND status='active'; SELECT 'trends' AS metric, COUNT(*) AS count FROM project_trend_snapshots WHERE project_id IN (${ids}) AND active=1; SELECT 'files' AS metric, COUNT(*) AS count FROM files WHERE id IN (${fileIds}) AND status='ready' AND visibility='public'; SELECT 'attachments' AS metric, COUNT(*) AS count FROM project_files WHERE project_id IN (${ids}) AND file_id IN (${fileIds}) AND purpose='cover'; SELECT 'media' AS metric, COUNT(*) AS count FROM project_media WHERE project_id IN (${ids}) AND file_id IN (${fileIds});`;
  const args = environment === "local" ? ["d1", "execute", "DB", "--local", "--command", sql] : ["d1", "execute", "DB", "--env", environment!, "--remote", "--command", sql];
  const rows = captureWranglerJson<Array<WranglerStatement<{ metric: string; count: number }>>>(args).flatMap((statement) => statement.results ?? []);
  return Object.fromEntries(rows.map((row) => [row.metric, Number(row.count)]));
}
