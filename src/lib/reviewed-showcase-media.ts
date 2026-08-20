import { stableId, sqlString } from "./physical-design-wave-import";
import { validateRpps } from "./rpps/schema";

export type ReviewedShowcaseMediaDefinition = {
  slug: string;
  name: string;
  project_kind?: "commercial_showcase" | "physical_design";
  repository_url?: string;
  revision?: string;
  expected_cover_url?: string;
  source_document?: {
    path: string;
    sha256: string;
    size_bytes: number;
  };
  source_publisher: string;
  source_page_url: string;
  source_image_url: string;
  final_source_image_url: string;
  request_accept?: string;
  sha256: string;
  size_bytes: number;
  media_type: string;
  width: number;
  height: number;
  alt_text: string;
  caption: string;
};

export type ReviewedShowcaseMediaWave = {
  wave: string;
  schema_version: number;
  projects: ReviewedShowcaseMediaDefinition[];
};

export type ReviewedShowcaseProjectRow = {
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
  media_count: number;
};

export type PreparedReviewedShowcaseMedia = {
  definition: ReviewedShowcaseMediaDefinition;
  row: ReviewedShowcaseProjectRow;
  nextRppsJson: string;
  fileId: string;
  mediaId: string;
  evidenceId: string;
  evidenceClaimId: string;
  objectKey: string;
  originalName: string;
  relativePath: string;
  coverUrl: string;
  metadataJson: string;
};

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_REV_RE = /^[a-f0-9]{40}$/u;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WAVE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MEDIA_TYPES = new Set(["image/avif", "image/jpeg", "image/png", "image/webp"]);
const EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

function expectedProjectKind(definition: ReviewedShowcaseMediaDefinition): "commercial_showcase" | "physical_design" {
  return definition.project_kind ?? "commercial_showcase";
}

function immutableSourceDocumentUrl(definition: ReviewedShowcaseMediaDefinition): string | null {
  if (!definition.repository_url || !definition.revision || !definition.source_document?.path) return null;
  const base = definition.repository_url.replace(/\.git$/iu, "").replace(/\/+$/u, "");
  const path = definition.source_document.path.split("/").map(encodeURIComponent).join("/");
  return `${base}/blob/${definition.revision}/${path}`;
}

export function validateReviewedShowcaseMediaWave(wave: ReviewedShowcaseMediaWave): string[] {
  const errors: string[] = [];
  if (!WAVE_RE.test(wave.wave ?? "")) errors.push("wave must be a lowercase kebab-case identifier");
  if (wave.schema_version !== 1) errors.push("schema_version must be 1");
  if (!Array.isArray(wave.projects) || wave.projects.length === 0) errors.push("projects must not be empty");
  const slugs = new Set<string>();
  const hashes = new Set<string>();
  for (const project of wave.projects ?? []) {
    if (!SLUG_RE.test(project.slug ?? "")) errors.push(`${project.slug || "(missing slug)"}: slug is invalid`);
    else if (slugs.has(project.slug)) errors.push(`${project.slug}: duplicate slug`);
    else slugs.add(project.slug);
    if (!project.name?.trim()) errors.push(`${project.slug}: name is required`);
    const projectKind = expectedProjectKind(project);
    if (project.project_kind && !["commercial_showcase", "physical_design"].includes(project.project_kind)) errors.push(`${project.slug}: project_kind is unsupported`);
    if (projectKind === "physical_design") {
      if (!project.repository_url?.match(/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?\/?$/iu)) errors.push(`${project.slug}: physical design repository_url must be a canonical HTTPS GitHub URL`);
      if (!GIT_REV_RE.test(project.revision ?? "")) errors.push(`${project.slug}: physical design revision must be a lowercase 40-character git hash`);
      if (!isHttpsUrl(project.expected_cover_url ?? "")) errors.push(`${project.slug}: physical design expected_cover_url must be HTTPS`);
      if (!isSafeRelativePath(project.source_document?.path ?? "")) errors.push(`${project.slug}: source_document path is invalid`);
      if (!SHA256_RE.test(project.source_document?.sha256 ?? "")) errors.push(`${project.slug}: source_document sha256 is invalid`);
      if (!Number.isInteger(project.source_document?.size_bytes) || (project.source_document?.size_bytes ?? 0) <= 0) errors.push(`${project.slug}: source_document size_bytes must be positive`);
      if (immutableSourceDocumentUrl(project) !== project.source_page_url) errors.push(`${project.slug}: source_page_url must be the immutable source document URL`);
    }
    if (!project.source_publisher?.trim()) errors.push(`${project.slug}: source_publisher is required`);
    for (const [field, value] of [
      ["source_page_url", project.source_page_url],
      ["source_image_url", project.source_image_url],
      ["final_source_image_url", project.final_source_image_url],
    ] as const) {
      if (!isHttpsUrl(value ?? "")) errors.push(`${project.slug}: ${field} must be an HTTPS URL`);
    }
    if (!SHA256_RE.test(project.sha256 ?? "")) errors.push(`${project.slug}: sha256 is invalid`);
    else if (hashes.has(project.sha256)) errors.push(`${project.slug}: duplicate sha256`);
    else hashes.add(project.sha256);
    if (!Number.isInteger(project.size_bytes) || project.size_bytes < 10_000) errors.push(`${project.slug}: size_bytes must be at least 10000`);
    if (!MEDIA_TYPES.has(project.media_type)) errors.push(`${project.slug}: media_type is unsupported`);
    if (project.request_accept && !MEDIA_TYPES.has(project.request_accept)) errors.push(`${project.slug}: request_accept is unsupported`);
    if (!Number.isInteger(project.width) || project.width < 600) errors.push(`${project.slug}: width must be at least 600`);
    if (!Number.isInteger(project.height) || project.height < 360) errors.push(`${project.slug}: height must be at least 360`);
    if (!project.alt_text?.trim() || project.alt_text.length > 500) errors.push(`${project.slug}: alt_text must contain 1-500 characters`);
    if (!project.caption?.trim() || project.caption.length > 500) errors.push(`${project.slug}: caption must contain 1-500 characters`);
  }
  return errors;
}

export function reviewedShowcaseFileId(wave: string, definition: ReviewedShowcaseMediaDefinition): string {
  return stableId("file", `${wave}:${definition.slug}:${definition.sha256}`);
}

export function reviewedShowcaseMediaId(wave: string, projectId: string, fileId: string): string {
  return stableId("pmedia", `${wave}:${projectId}:${fileId}`);
}

export function reviewedShowcaseEvidenceId(wave: string, projectId: string, sha256: string): string {
  return stableId("evidence", `${wave}:${projectId}:${sha256}:official-cover`);
}

export function reviewedShowcaseEvidenceClaimId(wave: string, projectId: string, sha256: string): string {
  return stableId("eclaim", `${wave}:${projectId}:${sha256}:official-cover`);
}

export function reviewedShowcaseObjectKey(wave: string, definition: ReviewedShowcaseMediaDefinition): string {
  return `reviewed-showcase-media/${wave}/${definition.slug}/${definition.sha256}.${EXTENSIONS[definition.media_type]}`;
}

export function reviewedShowcaseOriginalName(definition: ReviewedShowcaseMediaDefinition): string {
  return `${definition.slug}-official-cover.${EXTENSIONS[definition.media_type]}`;
}

export function reviewedShowcaseCoverUrl(origin: string, fileId: string): string {
  return `${origin.replace(/\/+$/u, "")}/api/v1/files/content?id=${encodeURIComponent(fileId)}`;
}

export function serializeReviewedShowcaseRpps(input: Record<string, unknown>): string {
  const validation = validateRpps(input);
  if ("errors" in validation) throw new Error(`Generated showcase RPPS failed validation: ${validation.errors.join("; ")}`);
  // Commercial showcase manifests carry reviewed extension fields such as
  // project_kind, reproducibility, and specs. Zod validates the portable RPPS
  // surface but strips unknown extension fields from validation.data, so write
  // the validated input rather than silently deleting those reviewed fields.
  return JSON.stringify(input);
}

function originalGuard(project: PreparedReviewedShowcaseMedia): string {
  const { definition, row } = project;
  const repositoryGuard = definition.repository_url
    ? ` AND p.repository_url = ${sqlString(definition.repository_url)} AND p.revision = ${sqlString(definition.revision)}`
    : "";
  return `p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.current_version_id = ${sqlString(row.current_version_id)} AND p.project_kind = ${sqlString(expectedProjectKind(definition))}${repositoryGuard} AND p.visibility = 'public' AND p.status = 'published' AND p.updated_at = ${sqlString(row.updated_at)} AND pv.id = p.current_version_id AND pv.project_id = p.id AND pv.rpps_json = ${sqlString(row.rpps_json)}`;
}

export function buildReviewedShowcaseMediaForwardSql(
  projects: PreparedReviewedShowcaseMedia[],
  wave: string,
  now: string,
): string {
  const lines = [`-- Guarded source-backed showcase cover wave ${wave}.`];
  for (const project of projects) {
    const { definition, row } = project;
    const guard = originalGuard(project);
    lines.push(`INSERT INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256, owner_user_id, organization_id, visibility, status, kind, metadata_json, created_at, updated_at)
SELECT ${sqlString(project.fileId)}, ${sqlString(project.objectKey)}, ${sqlString(project.originalName)}, ${sqlString(definition.media_type)}, ${definition.size_bytes}, ${sqlString(definition.sha256)}, p.owner_user_id, p.organization_id, 'public', 'ready', 'image', json(${sqlString(project.metadataJson)}), ${sqlString(now)}, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND (p.owner_user_id IS NOT NULL OR p.organization_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM project_media existing_media WHERE existing_media.project_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM files existing_file WHERE existing_file.id = ${sqlString(project.fileId)} OR existing_file.object_key = ${sqlString(project.objectKey)});`);
    lines.push(`INSERT INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
SELECT p.id, pv.id, f.id, 'cover', ${sqlString(project.relativePath)}, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id JOIN files f ON f.id = ${sqlString(project.fileId)}
WHERE ${guard} AND f.object_key = ${sqlString(project.objectKey)} AND f.checksum_sha256 = ${sqlString(definition.sha256)} AND f.status = 'ready' AND f.visibility = 'public'
  AND NOT EXISTS (SELECT 1 FROM project_files existing_file WHERE existing_file.project_id = p.id AND existing_file.file_id = f.id);`);
    lines.push(`INSERT INTO project_media (id, project_id, file_id, caption, alt_text, sort_order, created_at)
SELECT ${sqlString(project.mediaId)}, p.id, f.id, ${sqlString(definition.caption)}, ${sqlString(definition.alt_text)}, 0, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id JOIN files f ON f.id = ${sqlString(project.fileId)}
JOIN project_files pf ON pf.project_id = p.id AND pf.project_version_id = pv.id AND pf.file_id = f.id
WHERE ${guard} AND NOT EXISTS (SELECT 1 FROM project_media existing_media WHERE existing_media.project_id = p.id);`);
    lines.push(`INSERT INTO evidence (id, source_type, source_url, title, publisher, retrieved_at, confidence, content_hash, excerpt, file_id, is_demo, created_at)
SELECT ${sqlString(project.evidenceId)}, 'docs', ${sqlString(definition.source_page_url)}, ${sqlString(`${definition.name} reviewed project cover`)}, ${sqlString(definition.source_publisher)}, ${sqlString(now)}, 0.99, ${sqlString(`sha256:${definition.sha256}`)}, ${sqlString(`Reviewed project cover from ${definition.source_publisher}; source image ${definition.final_source_image_url}`)}, ${sqlString(project.fileId)}, 0, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND EXISTS (SELECT 1 FROM project_media pm WHERE pm.id = ${sqlString(project.mediaId)} AND pm.project_id = p.id AND pm.file_id = ${sqlString(project.fileId)})
  AND NOT EXISTS (SELECT 1 FROM evidence existing_evidence WHERE existing_evidence.id = ${sqlString(project.evidenceId)});`);
    lines.push(`INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, confidence, created_at)
SELECT ${sqlString(project.evidenceClaimId)}, ${sqlString(project.evidenceId)}, 'project', p.id, 'cover_image.source', ${sqlString(`${definition.final_source_image_url}#sha256=${definition.sha256}`)}, 0.99, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND EXISTS (SELECT 1 FROM evidence e WHERE e.id = ${sqlString(project.evidenceId)} AND e.file_id = ${sqlString(project.fileId)})
  AND NOT EXISTS (SELECT 1 FROM evidence_claims existing_claim WHERE existing_claim.id = ${sqlString(project.evidenceClaimId)});`);
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(project.nextRppsJson)}
WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND rpps_json = ${sqlString(row.rpps_json)}
  AND EXISTS (SELECT 1 FROM project_media pm WHERE pm.id = ${sqlString(project.mediaId)} AND pm.project_id = ${sqlString(row.id)} AND pm.file_id = ${sqlString(project.fileId)})
  AND EXISTS (SELECT 1 FROM evidence_claims ec WHERE ec.id = ${sqlString(project.evidenceClaimId)} AND ec.evidence_id = ${sqlString(project.evidenceId)});`);
    lines.push(`UPDATE projects SET updated_at = ${sqlString(now)}
WHERE id = ${sqlString(row.id)} AND slug = ${sqlString(row.slug)} AND current_version_id = ${sqlString(row.current_version_id)} AND project_kind = ${sqlString(expectedProjectKind(definition))} AND visibility = 'public' AND status = 'published' AND updated_at = ${sqlString(row.updated_at)}
  AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(row.current_version_id)} AND pv.project_id = ${sqlString(row.id)} AND pv.rpps_json = ${sqlString(project.nextRppsJson)});`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildReviewedShowcaseMediaRollbackSql(
  projects: PreparedReviewedShowcaseMedia[],
  wave: string,
  now: string,
): string {
  const lines = [`-- Guarded rollback for source-backed showcase cover wave ${wave}.`];
  for (const project of [...projects].reverse()) {
    const { definition, row } = project;
    const currentGuard = `EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.current_version_id = ${sqlString(row.current_version_id)} AND p.project_kind = ${sqlString(expectedProjectKind(definition))} AND p.updated_at IN (${sqlString(row.updated_at)}, ${sqlString(now)}) AND pv.rpps_json IN (${sqlString(row.rpps_json)}, ${sqlString(project.nextRppsJson)}))`;
    lines.push(`DELETE FROM evidence_claims WHERE id = ${sqlString(project.evidenceClaimId)} AND evidence_id = ${sqlString(project.evidenceId)} AND entity_type = 'project' AND entity_id = ${sqlString(row.id)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM evidence WHERE id = ${sqlString(project.evidenceId)} AND file_id = ${sqlString(project.fileId)} AND content_hash = ${sqlString(`sha256:${definition.sha256}`)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM project_media WHERE id = ${sqlString(project.mediaId)} AND project_id = ${sqlString(row.id)} AND file_id = ${sqlString(project.fileId)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM project_files WHERE project_id = ${sqlString(row.id)} AND project_version_id = ${sqlString(row.current_version_id)} AND file_id = ${sqlString(project.fileId)} AND purpose = 'cover' AND relative_path = ${sqlString(project.relativePath)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM files WHERE id = ${sqlString(project.fileId)} AND object_key = ${sqlString(project.objectKey)} AND checksum_sha256 = ${sqlString(definition.sha256)} AND created_at = ${sqlString(now)} AND updated_at = ${sqlString(now)} AND NOT EXISTS (SELECT 1 FROM project_files pf WHERE pf.file_id = ${sqlString(project.fileId)}) AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.file_id = ${sqlString(project.fileId)}) AND ${currentGuard};`);
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(row.rpps_json)} WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND rpps_json = ${sqlString(project.nextRppsJson)} AND ${currentGuard};`);
    lines.push(`UPDATE projects SET updated_at = ${sqlString(row.updated_at)} WHERE id = ${sqlString(row.id)} AND slug = ${sqlString(row.slug)} AND current_version_id = ${sqlString(row.current_version_id)} AND updated_at = ${sqlString(now)} AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(row.current_version_id)} AND pv.project_id = ${sqlString(row.id)} AND pv.rpps_json = ${sqlString(row.rpps_json)});`);
  }
  return `${lines.join("\n")}\n`;
}
