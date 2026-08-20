import { stableId, sqlString } from "./physical-design-wave-import";
import { validateRpps } from "./rpps/schema";

export type ReviewedDerivedProjectMediaDefinition = {
  slug: string;
  name: string;
  repository_url: string;
  revision: string;
  expected_cover_url: string;
  source_artifact: {
    path: string;
    sha256: string;
    size_bytes: number;
  };
  rendered_asset: {
    local_path: string;
    sha256: string;
    size_bytes: number;
    media_type: "image/png";
    width: number;
    height: number;
  };
  renderer: {
    commit: string;
    path: string;
    sha256: string;
    name: string;
  };
  alt_text: string;
  caption: string;
};

export type ReviewedDerivedProjectMediaWave = {
  wave: string;
  schema_version: number;
  projects: ReviewedDerivedProjectMediaDefinition[];
};

export type ReviewedDerivedProjectMediaRow = {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string | null;
  organization_id: string | null;
  visibility: string;
  status: string;
  project_kind: string;
  repository_url: string | null;
  revision: string | null;
  updated_at: string;
  current_version_id: string;
  rpps_json: string;
};

export type PreparedReviewedDerivedProjectMedia = {
  definition: ReviewedDerivedProjectMediaDefinition;
  row: ReviewedDerivedProjectMediaRow;
  nextRppsJson: string;
  fileId: string;
  mediaId: string;
  evidenceId: string;
  evidenceClaimId: string;
  objectKey: string;
  originalName: string;
  relativePath: string;
  coverUrl: string;
  sourcePageUrl: string;
  metadataJson: string;
};

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_REV_RE = /^[a-f0-9]{40}$/u;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WAVE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MEDIA_EXTENSIONS: Record<ReviewedDerivedProjectMediaDefinition["rendered_asset"]["media_type"], string> = { "image/png": "png" };

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeRelativePath(value: string): boolean {
  return Boolean(value?.trim()) && !value.startsWith("/") && !value.split("/").includes("..");
}

export function canonicalReviewedMediaRepository(value: string): string {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\.git$/iu, "").replace(/\/+$/u, "").toLowerCase()}`;
}

export function reviewedDerivedMediaSourcePageUrl(definition: ReviewedDerivedProjectMediaDefinition): string {
  const base = definition.repository_url.replace(/\.git$/iu, "").replace(/\/+$/u, "");
  const path = definition.source_artifact.path.split("/").map(encodeURIComponent).join("/");
  return `${base}/blob/${definition.revision}/${path}`;
}

export function reviewedDerivedMediaFileId(wave: string, definition: ReviewedDerivedProjectMediaDefinition): string {
  return stableId("file", `${wave}:${definition.slug}:${definition.rendered_asset.sha256}`);
}

export function reviewedDerivedMediaMediaId(wave: string, projectId: string, fileId: string): string {
  return stableId("pmedia", `${wave}:${projectId}:${fileId}`);
}

export function reviewedDerivedMediaEvidenceId(wave: string, projectId: string, definition: ReviewedDerivedProjectMediaDefinition): string {
  return stableId("evidence", `${wave}:${projectId}:${definition.source_artifact.sha256}:${definition.rendered_asset.sha256}`);
}

export function reviewedDerivedMediaClaimId(wave: string, projectId: string, definition: ReviewedDerivedProjectMediaDefinition): string {
  return stableId("eclaim", `${wave}:${projectId}:${definition.source_artifact.sha256}:${definition.rendered_asset.sha256}`);
}

export function reviewedDerivedMediaObjectKey(wave: string, definition: ReviewedDerivedProjectMediaDefinition): string {
  const extension = MEDIA_EXTENSIONS[definition.rendered_asset.media_type];
  return `reviewed-project-media/${wave}/${definition.slug}/${definition.rendered_asset.sha256}.${extension}`;
}

export function reviewedDerivedMediaOriginalName(definition: ReviewedDerivedProjectMediaDefinition): string {
  const extension = MEDIA_EXTENSIONS[definition.rendered_asset.media_type];
  return `${definition.slug}-model-cover.${extension}`;
}

export function reviewedDerivedMediaCoverUrl(origin: string, fileId: string): string {
  return `${origin.replace(/\/+$/u, "")}/api/v1/files/content?id=${encodeURIComponent(fileId)}`;
}

export function validateReviewedDerivedProjectMediaWave(wave: ReviewedDerivedProjectMediaWave): string[] {
  const errors: string[] = [];
  if (!WAVE_RE.test(wave.wave ?? "")) errors.push("wave must be a lowercase kebab-case identifier");
  if (wave.schema_version !== 1) errors.push("schema_version must be 1");
  if (!Array.isArray(wave.projects) || wave.projects.length === 0) errors.push("projects must not be empty");
  const slugs = new Set<string>();
  const hashes = new Set<string>();
  for (const project of wave.projects ?? []) {
    const label = project.slug || "(missing slug)";
    if (!SLUG_RE.test(project.slug ?? "")) errors.push(`${label}: slug is invalid`);
    else if (slugs.has(project.slug)) errors.push(`${label}: duplicate slug`);
    else slugs.add(project.slug);
    if (!project.name?.trim()) errors.push(`${label}: name is required`);
    if (!isHttpsUrl(project.repository_url ?? "") || !/^github\.com\/[^/]+\/[^/]+$/u.test(canonicalReviewedMediaRepository(project.repository_url))) {
      errors.push(`${label}: repository_url must be a canonical HTTPS GitHub repository URL`);
    }
    if (!GIT_REV_RE.test(project.revision ?? "")) errors.push(`${label}: revision must be a lowercase 40-character git hash`);
    if (!isHttpsUrl(project.expected_cover_url ?? "")) errors.push(`${label}: expected_cover_url must be HTTPS`);
    if (!isSafeRelativePath(project.source_artifact?.path ?? "")) errors.push(`${label}: source artifact path is invalid`);
    if (!SHA256_RE.test(project.source_artifact?.sha256 ?? "")) errors.push(`${label}: source artifact sha256 is invalid`);
    if (!Number.isInteger(project.source_artifact?.size_bytes) || project.source_artifact.size_bytes <= 0) errors.push(`${label}: source artifact size must be positive`);
    if (!isSafeRelativePath(project.rendered_asset?.local_path ?? "") || !project.rendered_asset.local_path.startsWith("data/project-waves/assets/")) {
      errors.push(`${label}: rendered asset must be checked in under data/project-waves/assets`);
    }
    if (!SHA256_RE.test(project.rendered_asset?.sha256 ?? "")) errors.push(`${label}: rendered asset sha256 is invalid`);
    else if (hashes.has(project.rendered_asset.sha256)) errors.push(`${label}: duplicate rendered asset sha256`);
    else hashes.add(project.rendered_asset.sha256);
    if (!Number.isInteger(project.rendered_asset?.size_bytes) || project.rendered_asset.size_bytes < 10_000) errors.push(`${label}: rendered asset must be at least 10000 bytes`);
    if (!MEDIA_EXTENSIONS[project.rendered_asset?.media_type]) errors.push(`${label}: rendered asset media type is unsupported`);
    if (!Number.isInteger(project.rendered_asset?.width) || project.rendered_asset.width < 600) errors.push(`${label}: rendered asset width must be at least 600`);
    if (!Number.isInteger(project.rendered_asset?.height) || project.rendered_asset.height < 360) errors.push(`${label}: rendered asset height must be at least 360`);
    if (!GIT_REV_RE.test(project.renderer?.commit ?? "")) errors.push(`${label}: renderer commit is invalid`);
    if (!isSafeRelativePath(project.renderer?.path ?? "")) errors.push(`${label}: renderer path is invalid`);
    if (!SHA256_RE.test(project.renderer?.sha256 ?? "")) errors.push(`${label}: renderer sha256 is invalid`);
    if (!project.renderer?.name?.trim()) errors.push(`${label}: renderer name is required`);
    if (!project.alt_text?.trim() || project.alt_text.length > 500) errors.push(`${label}: alt_text must contain 1-500 characters`);
    if (!project.caption?.trim() || project.caption.length > 500) errors.push(`${label}: caption must contain 1-500 characters`);
  }
  return errors;
}

export function serializeReviewedDerivedProjectMediaRpps(input: Record<string, unknown>): string {
  const validation = validateRpps(input);
  if ("errors" in validation) throw new Error(`Generated derived project media RPPS failed validation: ${validation.errors.join("; ")}`);
  return JSON.stringify(input);
}

function originalGuard(project: PreparedReviewedDerivedProjectMedia): string {
  const { row } = project;
  return `p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.current_version_id = ${sqlString(row.current_version_id)} AND p.project_kind = 'physical_design' AND p.visibility = 'public' AND p.status = 'published' AND p.repository_url = ${sqlString(row.repository_url)} AND p.revision = ${sqlString(row.revision)} AND p.updated_at = ${sqlString(row.updated_at)} AND pv.id = p.current_version_id AND pv.project_id = p.id`;
}

export function buildReviewedDerivedProjectMediaForwardSql(
  projects: PreparedReviewedDerivedProjectMedia[],
  wave: string,
  now: string,
): string {
  const lines = [`-- Guarded source-derived project cover wave ${wave}.`];
  for (const project of projects) {
    const { definition, row } = project;
    const guard = originalGuard(project);
    const claimValue = JSON.stringify({
      source: `${project.sourcePageUrl}#sha256=${definition.source_artifact.sha256}`,
      rendered: `sha256:${definition.rendered_asset.sha256}`,
      renderer: `${definition.renderer.commit}:${definition.renderer.path}#sha256=${definition.renderer.sha256}`,
    });
    lines.push(`INSERT INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256, owner_user_id, organization_id, visibility, status, kind, metadata_json, created_at, updated_at)
SELECT ${sqlString(project.fileId)}, ${sqlString(project.objectKey)}, ${sqlString(project.originalName)}, ${sqlString(definition.rendered_asset.media_type)}, ${definition.rendered_asset.size_bytes}, ${sqlString(definition.rendered_asset.sha256)}, p.owner_user_id, p.organization_id, 'public', 'ready', 'image', json(${sqlString(project.metadataJson)}), ${sqlString(now)}, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND (p.owner_user_id IS NOT NULL OR p.organization_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM files existing_file WHERE existing_file.id = ${sqlString(project.fileId)} OR existing_file.object_key = ${sqlString(project.objectKey)})
  AND NOT EXISTS (SELECT 1 FROM project_files existing_path WHERE existing_path.project_id = p.id AND lower(existing_path.relative_path) = lower(${sqlString(project.relativePath)}));`);
    lines.push(`INSERT INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
SELECT p.id, pv.id, f.id, 'cover', ${sqlString(project.relativePath)}, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id JOIN files f ON f.id = ${sqlString(project.fileId)}
WHERE ${guard} AND f.object_key = ${sqlString(project.objectKey)} AND f.checksum_sha256 = ${sqlString(definition.rendered_asset.sha256)} AND f.status = 'ready' AND f.visibility = 'public'
  AND NOT EXISTS (SELECT 1 FROM project_files existing_file WHERE existing_file.project_id = p.id AND existing_file.file_id = f.id);`);
    lines.push(`INSERT INTO project_media (id, project_id, file_id, caption, alt_text, sort_order, created_at)
SELECT ${sqlString(project.mediaId)}, p.id, f.id, ${sqlString(definition.caption)}, ${sqlString(definition.alt_text)}, -1, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id JOIN files f ON f.id = ${sqlString(project.fileId)}
JOIN project_files pf ON pf.project_id = p.id AND pf.project_version_id = pv.id AND pf.file_id = f.id
WHERE ${guard} AND NOT EXISTS (SELECT 1 FROM project_media existing_media WHERE existing_media.id = ${sqlString(project.mediaId)} OR (existing_media.project_id = p.id AND existing_media.file_id = f.id));`);
    lines.push(`INSERT INTO evidence (id, source_type, source_url, title, publisher, retrieved_at, confidence, content_hash, excerpt, file_id, is_demo, created_at)
SELECT ${sqlString(project.evidenceId)}, 'repo', ${sqlString(project.sourcePageUrl)}, ${sqlString(`${definition.name} source-model cover render`)}, 'GitHub', ${sqlString(now)}, 1.0, ${sqlString(`sha256:${definition.rendered_asset.sha256}`)}, ${sqlString(`${definition.caption} Rendered from pinned source artifact ${definition.source_artifact.path} at revision ${definition.revision}; source SHA-256 ${definition.source_artifact.sha256}; renderer ${definition.renderer.name} commit ${definition.renderer.commit}.`)}, ${sqlString(project.fileId)}, 0, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND EXISTS (SELECT 1 FROM project_media pm WHERE pm.id = ${sqlString(project.mediaId)} AND pm.project_id = p.id AND pm.file_id = ${sqlString(project.fileId)})
  AND NOT EXISTS (SELECT 1 FROM evidence existing_evidence WHERE existing_evidence.id = ${sqlString(project.evidenceId)});`);
    lines.push(`INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, confidence, created_at)
SELECT ${sqlString(project.evidenceClaimId)}, ${sqlString(project.evidenceId)}, 'project', p.id, 'cover_image.derived_source', ${sqlString(claimValue)}, 1.0, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND EXISTS (SELECT 1 FROM evidence e WHERE e.id = ${sqlString(project.evidenceId)} AND e.file_id = ${sqlString(project.fileId)})
  AND NOT EXISTS (SELECT 1 FROM evidence_claims existing_claim WHERE existing_claim.id = ${sqlString(project.evidenceClaimId)});`);
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(project.nextRppsJson)}
WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND rpps_json = ${sqlString(row.rpps_json)}
  AND EXISTS (SELECT 1 FROM evidence_claims ec WHERE ec.id = ${sqlString(project.evidenceClaimId)} AND ec.evidence_id = ${sqlString(project.evidenceId)});`);
    lines.push(`UPDATE projects SET updated_at = ${sqlString(now)}
WHERE id = ${sqlString(row.id)} AND slug = ${sqlString(row.slug)} AND current_version_id = ${sqlString(row.current_version_id)} AND updated_at = ${sqlString(row.updated_at)}
  AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(row.current_version_id)} AND pv.project_id = ${sqlString(row.id)} AND pv.rpps_json = ${sqlString(project.nextRppsJson)});`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildReviewedDerivedProjectMediaRollbackSql(
  projects: PreparedReviewedDerivedProjectMedia[],
  wave: string,
  now: string,
): string {
  const lines = [`-- Guarded rollback for source-derived project cover wave ${wave}.`];
  for (const project of [...projects].reverse()) {
    const { definition, row } = project;
    const currentGuard = `EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.current_version_id = ${sqlString(row.current_version_id)} AND p.project_kind = 'physical_design' AND p.updated_at IN (${sqlString(row.updated_at)}, ${sqlString(now)}) AND pv.id = ${sqlString(row.current_version_id)} AND pv.project_id = p.id)`;
    lines.push(`DELETE FROM evidence_claims WHERE id = ${sqlString(project.evidenceClaimId)} AND evidence_id = ${sqlString(project.evidenceId)} AND entity_type = 'project' AND entity_id = ${sqlString(row.id)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM evidence WHERE id = ${sqlString(project.evidenceId)} AND file_id = ${sqlString(project.fileId)} AND content_hash = ${sqlString(`sha256:${definition.rendered_asset.sha256}`)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM project_media WHERE id = ${sqlString(project.mediaId)} AND project_id = ${sqlString(row.id)} AND file_id = ${sqlString(project.fileId)} AND sort_order = -1 AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM project_files WHERE project_id = ${sqlString(row.id)} AND project_version_id = ${sqlString(row.current_version_id)} AND file_id = ${sqlString(project.fileId)} AND purpose = 'cover' AND relative_path = ${sqlString(project.relativePath)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM files WHERE id = ${sqlString(project.fileId)} AND object_key = ${sqlString(project.objectKey)} AND checksum_sha256 = ${sqlString(definition.rendered_asset.sha256)} AND created_at = ${sqlString(now)} AND updated_at = ${sqlString(now)} AND NOT EXISTS (SELECT 1 FROM project_files pf WHERE pf.file_id = ${sqlString(project.fileId)}) AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.file_id = ${sqlString(project.fileId)}) AND ${currentGuard};`);
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(row.rpps_json)} WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND rpps_json = ${sqlString(project.nextRppsJson)} AND ${currentGuard};`);
    lines.push(`UPDATE projects SET updated_at = ${sqlString(row.updated_at)} WHERE id = ${sqlString(row.id)} AND slug = ${sqlString(row.slug)} AND current_version_id = ${sqlString(row.current_version_id)} AND updated_at = ${sqlString(now)} AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(row.current_version_id)} AND pv.project_id = ${sqlString(row.id)} AND pv.rpps_json = ${sqlString(row.rpps_json)});`);
  }
  return `${lines.join("\n")}\n`;
}
