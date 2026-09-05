#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { commercialProjectId, commercialVersionId, type ExistingCommercialProjectIdentity } from "../src/lib/commercial-showcase-import";
import { stableId, sqlString } from "../src/lib/physical-design-wave-import";
import { resolveUpstreamIdentity } from "../src/shared/provenance";
import type { CommercialProfile } from "../src/lib/commercial-catalog";
import { captureWranglerJson, runWrangler } from "./wrangler-cli";

type MarketProfile = CommercialProfile & { marketStatus: string; availabilityEvidenceUrl: string };
type ExistingProject = ExistingCommercialProjectIdentity & { owner_user_id: string | null; project_kind: string };
type MediaItem = {
  slug: string; fileId: string; objectKey: string; contentUrl: string; mediaType: string; sizeBytes: number; checksumSha256: string;
  width: number; height: number; sourceUrl: string; sourcePageUrl: string; retrievedAt: string; title: string; altText: string; attribution: string; transform: string;
  sourceKind: "official_product_image" | "identity_illustration";
};
type PublicationItem = { profile: MarketProfile; media: MediaItem; projectId: string; projectSlug: string; versionId: string; upstreamIdentity: string };
type WranglerStatement<T> = { results?: T[] };

const OWNER = "robotics-catalog-import";
const PROJECT_KIND = "commercial_showcase";
const REVISION = "catalog-2026-08-27-humanoid-market-v1";
const PRODUCTION_GATE = "ROBOPARTPICKER_HUMANOID_MARKET_APPLY";
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const environment = argument("--env");
const apply = process.argv.includes("--apply");
if (!environment || !["local", "preview", "production"].includes(environment)) throw new Error("Usage: tsx scripts/publish-commercial-humanoid-market.ts --env local|preview|production [--apply]");
if (apply && environment === "production" && process.env[PRODUCTION_GATE] !== "apply-production-humanoid-market") throw new Error(`Refusing production apply without ${PRODUCTION_GATE}=apply-production-humanoid-market`);
const profilesPath = resolve(argument("--profiles") ?? "data/commercial-catalog/market-expansion/profiles.json");
const mediaPath = resolve(argument("--media") ?? "data/commercial-catalog/market-expansion/media-manifest.json");
const outputDirectory = resolve(argument("--output-dir") ?? `.ingest/commercial-humanoid-market-publication/${environment}`);
const profilePayload = JSON.parse(readFileSync(profilesPath, "utf8")) as { generatedAt: string; profiles: MarketProfile[]; invalid: unknown[] };
const mediaPayload = JSON.parse(readFileSync(mediaPath, "utf8")) as { items: MediaItem[]; failures: unknown[] };
if (!profilePayload.profiles.length || profilePayload.invalid.length) throw new Error("Publication requires validated profiles and zero profile failures.");
if (mediaPayload.items.length !== profilePayload.profiles.length || mediaPayload.failures.length) throw new Error("Publication requires one mirrored media item per profile and zero media failures.");
const mediaBySlug = new Map(mediaPayload.items.map((item) => [item.slug, item]));
const existing = existingProjects();
const items = profilePayload.profiles.map((profile) => publicationItem(profile, mediaBySlug, existing));
if (new Set(items.map((item) => item.projectId)).size !== items.length) throw new Error("Resolved project IDs are not unique.");
mkdirSync(outputDirectory, { recursive: true });
const wavePaths: string[] = [];
for (let start = 0; start < items.length; start += 20) {
  const path = join(outputDirectory, `wave-${Math.floor(start / 20) + 1}-${start + 1}-${Math.min(start + 20, items.length)}.sql`);
  writeFileSync(path, renderSql(items.slice(start, start + 20).flatMap(statementsFor)));
  wavePaths.push(path);
}
const planPath = join(outputDirectory, "publication-plan.json");
writeFileSync(planPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), environment, profiles: items.length, existingMatched: items.filter((item) => existing.some((project) => project.id === item.projectId)).length, newProjects: items.filter((item) => !existing.some((project) => project.id === item.projectId)).length, waves: wavePaths, mappings: items.map((item) => ({ candidateSlug: item.profile.slug, projectId: item.projectId, projectSlug: item.projectSlug, upstreamIdentity: item.upstreamIdentity, fileId: item.media.fileId, marketStatus: item.profile.marketStatus })) }, null, 2)}\n`);
console.log(JSON.stringify({ planPath, environment, profiles: items.length, waves: wavePaths.length, existingMatched: items.filter((item) => existing.some((project) => project.id === item.projectId)).length, mode: apply ? "apply" : "dry-run" }));
if (!apply) process.exit(0);
for (const path of wavePaths) { runSqlFile(path); console.log(`applied ${path}`); }
const verification = verify(items);
console.log("VERIFIED", JSON.stringify(verification));
const expectedPrices = items.filter((item) => item.profile.price.kind !== "not_published").length;
for (const metric of ["projects", "files", "attachments", "media", "availability"]) if (verification[metric] !== items.length) throw new Error(`Publication verification failed for ${metric}: ${JSON.stringify(verification)}`);
if (verification.prices !== expectedPrices) throw new Error(`Publication price verification failed: ${JSON.stringify(verification)}`);

function existingProjects(): ExistingProject[] {
  const args = environment === "local"
    ? ["d1", "execute", "DB", "--local", "--command", "SELECT id,slug,repository_url,upstream_url,lower(upstream_identity) upstream_identity,current_version_id,owner_user_id,project_kind FROM projects"]
    : ["d1", "execute", "DB", "--env", environment!, "--remote", "--command", "SELECT id,slug,repository_url,upstream_url,lower(upstream_identity) upstream_identity,current_version_id,owner_user_id,project_kind FROM projects"];
  return captureWranglerJson<Array<WranglerStatement<ExistingProject>>>(args).flatMap((statement) => statement.results ?? []);
}
function publicationItem(profile: MarketProfile, mediaBySlug: Map<string, MediaItem>, projects: ExistingProject[]): PublicationItem {
  const media = mediaBySlug.get(profile.slug); if (!media) throw new Error(`Missing media for ${profile.slug}`);
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
  const { profile, media, projectId, projectSlug, versionId, upstreamIdentity } = item;
  const now = profile.trend.capturedAt;
  const publishedPrice = profile.price.kind === "not_published" ? null : profile.price;
  const summary = profile.description.slice(0, 280);
  const evidenceIds = profile.evidence.map((_, index) => stableId("evidence", `${projectId}:${REVISION}:${index}`));
  const priceStatus = publishedPrice ?? profile.price;
  const rpps = {
    rpps_version: "1.0.0", name: profile.name, slug: projectSlug, version: REVISION, summary,
    authors: [{ name: profile.manufacturer, role: "manufacturer", url: profile.officialProductUrl }],
    upstream_url: profile.officialProductUrl, docs_url: profile.officialDocsUrl ?? profile.officialProductUrl,
    project_kind: PROJECT_KIND, robot_category: "humanoid",
    tags: ["commercial-showcase", "closed-source", "humanoid", "current-market"], cover_image_url: media.contentUrl, bom: [],
    evidence: profile.evidence.map((evidence) => ({ claim: evidence.title, source_type: evidence.sourceType, source_url: evidence.sourceUrl, retrieved_at: evidence.retrievedAt, confidence: evidence.confidence })),
    reproducibility: { access: "closed-source", design_files: false, bom: false, cad: false, assembly: false, pricing: Boolean(publishedPrice) },
    specs: profile.specs.map((spec) => ({ key: spec.key, label: spec.label, value: spec.undisclosed ? "Not publicly disclosed" : spec.value, unit: spec.unit, source_url: spec.sourceUrl, observed_at: spec.observedAt, confidence: spec.confidence })),
    commercial_profile: {
      official_description: profile.description,
      use_cases: profile.useCases,
      price: priceStatus,
      market_availability: { status: profile.marketStatus, sourceUrl: profile.availabilityEvidenceUrl, observedAt: profile.retrievedAt },
      media: [{ ...profile.media[0], managed_content_url: media.contentUrl, checksum_sha256: media.checksumSha256 }],
    },
  };
  const estimatedCostMinor = publishedPrice ? String(publishedPrice.minMinor) : "NULL";
  const estimatedCostCurrency = publishedPrice ? "'USD'" : "NULL";
  const lines = [
    `INSERT INTO projects (id,slug,name,summary,description,owner_user_id,visibility,status,current_version_id,license_spdx,repository_url,difficulty,estimated_cost_minor,estimated_cost_currency,is_demo,created_at,updated_at,upstream_revision,revision,upstream_url,upstream_identity,maintainer,ingested_at,last_checked_at,publishability,github_stars,project_kind,robot_category) VALUES (${sqlString(projectId)},${sqlString(projectSlug)},${sqlString(profile.name)},${sqlString(summary)},${sqlString(profile.description)},${sqlString(OWNER)},'public','published',NULL,NULL,NULL,NULL,${estimatedCostMinor},${estimatedCostCurrency},0,${sqlString(now)},${sqlString(now)},${sqlString(REVISION)},${sqlString(REVISION)},${sqlString(profile.officialProductUrl)},${sqlString(upstreamIdentity)},${sqlString(profile.manufacturer)},${sqlString(profile.retrievedAt)},${sqlString(now)},'review',NULL,${sqlString(PROJECT_KIND)},'humanoid') ON CONFLICT(id) DO UPDATE SET name=excluded.name,summary=excluded.summary,description=excluded.description,visibility='public',status='published',license_spdx=NULL,repository_url=NULL,estimated_cost_minor=excluded.estimated_cost_minor,estimated_cost_currency=excluded.estimated_cost_currency,updated_at=excluded.updated_at,upstream_revision=excluded.upstream_revision,revision=excluded.revision,upstream_url=excluded.upstream_url,upstream_identity=excluded.upstream_identity,maintainer=excluded.maintainer,last_checked_at=excluded.last_checked_at,project_kind=excluded.project_kind,robot_category='humanoid' WHERE projects.owner_user_id=${sqlString(OWNER)} AND projects.project_kind=${sqlString(PROJECT_KIND)}`,
    `INSERT INTO project_versions (id,project_id,version_label,rpps_schema_version,changelog,rpps_json,status,created_by_user_id,created_at,published_at) VALUES (${sqlString(versionId)},${sqlString(projectId)},${sqlString(REVISION)},'1.0.0','Published reviewed current-market humanoid profile with source-backed identity, availability, specifications, and managed product image.',${sqlString(JSON.stringify(rpps))},'published',${sqlString(OWNER)},${sqlString(now)},${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET rpps_json=excluded.rpps_json,changelog=excluded.changelog,status='published',published_at=excluded.published_at`,
    `UPDATE projects SET current_version_id=${sqlString(versionId)},updated_at=${sqlString(now)} WHERE id=${sqlString(projectId)} AND owner_user_id=${sqlString(OWNER)} AND project_kind=${sqlString(PROJECT_KIND)}`,
  ];
  profile.evidence.forEach((evidence, index) => {
    const evidenceId = evidenceIds[index]; const claimId = stableId("claim", `${evidenceId}:project:${projectId}`);
    lines.push(
      `INSERT INTO evidence (id,source_type,source_url,title,publisher,retrieved_at,confidence,excerpt,is_demo,created_at) VALUES (${sqlString(evidenceId)},${sqlString(evidence.sourceType)},${sqlString(evidence.sourceUrl)},${sqlString(evidence.title)},${sqlString(profile.manufacturer)},${sqlString(evidence.retrievedAt)},${evidence.confidence},${sqlString(evidence.title)},0,${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url,title=excluded.title,publisher=excluded.publisher,retrieved_at=excluded.retrieved_at,confidence=excluded.confidence,excerpt=excluded.excerpt`,
      `INSERT INTO evidence_claims (id,evidence_id,entity_type,entity_id,claim_key,claim_value,confidence,created_at) VALUES (${sqlString(claimId)},${sqlString(evidenceId)},'project',${sqlString(projectId)},${sqlString(`commercial_profile.evidence.${index}`)},${sqlString(evidence.title)},${evidence.confidence},${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET evidence_id=excluded.evidence_id,claim_value=excluded.claim_value,confidence=excluded.confidence`,
    );
  });
  profile.specs.forEach((spec, index) => {
    const id = stableId("spec", `${projectId}:${spec.key}:${REVISION}`); const value = spec.undisclosed ? "Not publicly disclosed" : String(spec.value);
    lines.push(
      `UPDATE project_specs SET is_current=0,updated_at=${sqlString(now)} WHERE project_id=${sqlString(projectId)} AND spec_key=${sqlString(spec.key)} AND id<>${sqlString(id)} AND is_current=1`,
      `INSERT INTO project_specs (id,project_id,spec_key,label,value_text,value_number,unit,confidence,observed_at,evidence_id,is_current,sort_order,created_at,updated_at) VALUES (${sqlString(id)},${sqlString(projectId)},${sqlString(spec.key)},${sqlString(spec.label)},${sqlString(value)},NULL,${spec.unit ? sqlString(spec.unit) : "NULL"},${spec.confidence},${sqlString(spec.observedAt)},${evidenceIds[0] ? sqlString(evidenceIds[0]) : "NULL"},1,${index},${sqlString(now)},${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET label=excluded.label,value_text=excluded.value_text,unit=excluded.unit,confidence=excluded.confidence,observed_at=excluded.observed_at,evidence_id=excluded.evidence_id,is_current=1,sort_order=excluded.sort_order,updated_at=excluded.updated_at`,
    );
  });
  if (publishedPrice) {
    const priceId = stableId("price", `${projectId}:${publishedPrice.methodVersion}:${publishedPrice.valuedAt}`);
    lines.push(
      `UPDATE project_price_estimates SET status='superseded',updated_at=${sqlString(now)} WHERE project_id=${sqlString(projectId)} AND status='active' AND id<>${sqlString(priceId)}`,
      `INSERT INTO project_price_estimates (id,project_id,estimate_type,currency,min_minor,max_minor,representative_minor,confidence,method_version,summary,valued_at,expires_at,status,created_at,updated_at) VALUES (${sqlString(priceId)},${sqlString(projectId)},${sqlString(publishedPrice.kind)},'USD',${publishedPrice.minMinor},${publishedPrice.maxMinor},${publishedPrice.minMinor},'high',${sqlString(publishedPrice.methodVersion)},'Official manufacturer product price.',${sqlString(publishedPrice.valuedAt)},${publishedPrice.expiresAt ? sqlString(publishedPrice.expiresAt) : "NULL"},'active',${sqlString(now)},${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET min_minor=excluded.min_minor,max_minor=excluded.max_minor,representative_minor=excluded.representative_minor,confidence='high',summary=excluded.summary,valued_at=excluded.valued_at,expires_at=excluded.expires_at,status='active',updated_at=excluded.updated_at`,
    );
  } else lines.push(`UPDATE project_price_estimates SET status='withdrawn',updated_at=${sqlString(now)} WHERE project_id=${sqlString(projectId)} AND method_version='category-baseline-v1' AND status='active'`);
  const fileMetadata = { sourceUrl: media.sourceUrl, sourcePageUrl: media.sourcePageUrl, sourceKind: media.sourceKind, retrievedAt: media.retrievedAt, attribution: media.attribution, transform: media.transform, width: media.width, height: media.height, rightsBasis: media.sourceKind === "identity_illustration" ? "original labeled identity illustration; not a product photograph" : "manufacturer-attributed product-identification image; takedown on verified rights-holder request" };
  const mediaId = stableId("media", `${projectId}:${media.fileId}:humanoid-market-v1`);
  lines.push(
    `INSERT INTO files (id,object_key,original_name,media_type,size_bytes,checksum_sha256,owner_user_id,organization_id,visibility,status,kind,metadata_json,created_at,updated_at,deleted_at) VALUES (${sqlString(media.fileId)},${sqlString(media.objectKey)},'cover.webp','image/webp',${media.sizeBytes},${sqlString(media.checksumSha256)},${sqlString(OWNER)},NULL,'public','ready','image',${sqlString(JSON.stringify(fileMetadata))},${sqlString(now)},${sqlString(now)},NULL) ON CONFLICT(id) DO UPDATE SET object_key=excluded.object_key,media_type='image/webp',size_bytes=excluded.size_bytes,checksum_sha256=excluded.checksum_sha256,visibility='public',status='ready',metadata_json=excluded.metadata_json,updated_at=excluded.updated_at,deleted_at=NULL`,
    `INSERT INTO project_files (project_id,project_version_id,file_id,purpose,relative_path,created_at) VALUES (${sqlString(projectId)},${sqlString(versionId)},${sqlString(media.fileId)},'cover','cover.webp',${sqlString(now)}) ON CONFLICT(project_id,file_id) DO UPDATE SET project_version_id=excluded.project_version_id,purpose='cover',relative_path='cover.webp'`,
    `INSERT INTO project_media (id,project_id,file_id,caption,alt_text,sort_order,created_at) VALUES (${sqlString(mediaId)},${sqlString(projectId)},${sqlString(media.fileId)},${sqlString(media.title)},${sqlString(media.altText)},0,${sqlString(now)}) ON CONFLICT(id) DO UPDATE SET file_id=excluded.file_id,caption=excluded.caption,alt_text=excluded.alt_text,sort_order=0`,
    `DELETE FROM search_index WHERE entity_type='project' AND entity_id=${sqlString(projectId)}`,
    `INSERT INTO search_index (entity_type,entity_id,title,body,tags) VALUES ('project',${sqlString(projectId)},${sqlString(profile.name)},${sqlString(`${profile.description} ${profile.useCases.join(" ")}`)},${sqlString("commercial-showcase closed-source humanoid current-market")})`,
  );
  return lines;
}
function renderSql(statements: string[]): string { return `${statements.map((statement) => `${statement.trim().replace(/;$/u, "")};`).join("\n")}\n`; }
function runSqlFile(path: string): void { const args = environment === "local" ? ["d1","execute","DB","--local","--file",path] : ["d1","execute","DB","--env",environment!,"--remote","--file",path]; runWrangler(args); }
function verify(publication: PublicationItem[]): Record<string, number> {
  const ids = publication.map((item) => sqlString(item.projectId)).join(","); const fileIds = publication.map((item) => sqlString(item.media.fileId)).join(",");
  const rows = query<{ metric: string; count: number }>(`SELECT 'projects' metric,COUNT(*) count FROM projects WHERE id IN (${ids}) AND status='published' AND visibility='public' AND project_kind='commercial_showcase' AND robot_category='humanoid'; SELECT 'prices' metric,COUNT(*) count FROM project_price_estimates WHERE project_id IN (${ids}) AND status='active' AND method_version='official-product-price-v1'; SELECT 'files' metric,COUNT(*) count FROM files WHERE id IN (${fileIds}) AND status='ready' AND visibility='public'; SELECT 'attachments' metric,COUNT(*) count FROM project_files WHERE project_id IN (${ids}) AND file_id IN (${fileIds}) AND purpose='cover'; SELECT 'media' metric,COUNT(*) count FROM project_media WHERE project_id IN (${ids}) AND file_id IN (${fileIds}); SELECT 'availability' metric,COUNT(*) count FROM projects p JOIN project_versions pv ON pv.id=p.current_version_id WHERE p.id IN (${ids}) AND json_extract(pv.rpps_json,'$.commercial_profile.market_availability.status') IS NOT NULL;`);
  return Object.fromEntries(rows.map((row) => [row.metric, Number(row.count)]));
}
function query<T>(sql: string): T[] { const args = environment === "local" ? ["d1","execute","DB","--local","--command",sql] : ["d1","execute","DB","--env",environment!,"--remote","--command",sql]; return captureWranglerJson<Array<WranglerStatement<T>>>(args).flatMap((statement)=>statement.results??[]); }
