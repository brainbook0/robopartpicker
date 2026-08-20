import { stableId, sqlString } from "./physical-design-wave-import";
import { validateRpps } from "./rpps/schema";

export type ReviewedProjectArtifactDefinition = {
  slug: string;
  repository_url: string;
  revision: string;
  path: string;
  sha256: string;
  size_bytes: number;
  media_type: string;
  file_kind: "cad" | "urdf" | "mjcf" | "document" | "configuration" | "firmware" | "other";
  purpose: string;
  rpps_kind: "cad" | "urdf" | "mjcf" | "doc" | "config" | "firmware" | "other";
  description: string;
};

export type ReviewedProjectArtifactWave = {
  wave: string;
  schema_version: number;
  artifacts: ReviewedProjectArtifactDefinition[];
};

export type ReviewedProjectArtifactRow = {
  id: string;
  slug: string;
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

export type PreparedReviewedProjectArtifact = {
  definition: ReviewedProjectArtifactDefinition;
  row: ReviewedProjectArtifactRow;
  nextRppsJson: string;
  fileId: string;
  evidenceId: string;
  evidenceClaimId: string;
  objectKey: string;
  originalName: string;
  contentUrl: string;
  sourcePageUrl: string;
  sourceDownloadUrl: string;
  metadataJson: string;
};

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_REV_RE = /^[a-f0-9]{40}$/u;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WAVE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MEDIA_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function githubRepositoryParts(repositoryUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(repositoryUrl);
    const parts = url.pathname.replace(/\.git$/iu, "").replace(/^\/+|\/+$/gu, "").split("/");
    if (url.hostname.toLowerCase() !== "github.com" || parts.length !== 2 || parts.some((part) => !part)) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function artifactBasename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "artifact";
}

export function validateReviewedProjectArtifactWave(wave: ReviewedProjectArtifactWave): string[] {
  const errors: string[] = [];
  if (!WAVE_RE.test(wave.wave ?? "")) errors.push("wave must be a lowercase kebab-case identifier");
  if (wave.schema_version !== 1) errors.push("schema_version must be 1");
  if (!Array.isArray(wave.artifacts) || wave.artifacts.length === 0) errors.push("artifacts must not be empty");
  const identities = new Set<string>();
  for (const artifact of wave.artifacts ?? []) {
    const label = artifact.slug || "(missing slug)";
    if (!SLUG_RE.test(artifact.slug ?? "")) errors.push(`${label}: slug is invalid`);
    if (!isHttpsUrl(artifact.repository_url ?? "") || !githubRepositoryParts(artifact.repository_url)) {
      errors.push(`${label}: repository_url must be an HTTPS GitHub repository URL`);
    }
    if (!GIT_REV_RE.test(artifact.revision ?? "")) errors.push(`${label}: revision must be a lowercase 40-character git hash`);
    if (!artifact.path?.trim() || artifact.path.startsWith("/") || artifact.path.split("/").includes("..")) errors.push(`${label}: path must be a safe repository-relative path`);
    if (!SHA256_RE.test(artifact.sha256 ?? "")) errors.push(`${label}: sha256 is invalid`);
    if (!Number.isInteger(artifact.size_bytes) || artifact.size_bytes <= 0) errors.push(`${label}: size_bytes must be positive`);
    if (!MEDIA_TYPE_RE.test(artifact.media_type ?? "")) errors.push(`${label}: media_type is invalid`);
    if (!artifact.purpose?.trim() || artifact.purpose.length > 80) errors.push(`${label}: purpose must contain 1-80 characters`);
    if (!artifact.description?.trim() || artifact.description.length > 500) errors.push(`${label}: description must contain 1-500 characters`);
    const identity = `${artifact.slug}\0${artifact.path.toLowerCase()}`;
    if (identities.has(identity)) errors.push(`${label}: duplicate artifact path ${artifact.path}`);
    identities.add(identity);
  }
  return errors;
}

export function reviewedArtifactSourcePageUrl(definition: ReviewedProjectArtifactDefinition): string {
  return `${definition.repository_url.replace(/\.git$/iu, "").replace(/\/+$/u, "")}/blob/${definition.revision}/${encodedPath(definition.path)}`;
}

export function reviewedArtifactSourceDownloadUrl(definition: ReviewedProjectArtifactDefinition): string {
  const repository = githubRepositoryParts(definition.repository_url);
  if (!repository) throw new Error(`${definition.slug}: repository_url is not a GitHub repository`);
  return `https://raw.githubusercontent.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/${definition.revision}/${encodedPath(definition.path)}`;
}

export function reviewedArtifactFileId(wave: string, definition: ReviewedProjectArtifactDefinition): string {
  return stableId("file", `${wave}:${definition.slug}:${definition.path}:${definition.sha256}`);
}

export function reviewedArtifactEvidenceId(wave: string, projectId: string, definition: ReviewedProjectArtifactDefinition): string {
  return stableId("evidence", `${wave}:${projectId}:${definition.path}:${definition.sha256}`);
}

export function reviewedArtifactEvidenceClaimId(wave: string, projectId: string, definition: ReviewedProjectArtifactDefinition): string {
  return stableId("eclaim", `${wave}:${projectId}:${definition.path}:${definition.sha256}`);
}

export function reviewedArtifactObjectKey(wave: string, definition: ReviewedProjectArtifactDefinition): string {
  return `reviewed-project-artifacts/${wave}/${definition.slug}/${definition.sha256}/${artifactBasename(definition.path)}`;
}

export function reviewedArtifactContentUrl(origin: string, fileId: string): string {
  return `${origin.replace(/\/+$/u, "")}/api/v1/files/content?id=${encodeURIComponent(fileId)}`;
}

export function serializeReviewedProjectArtifactRpps(input: Record<string, unknown>): string {
  const validation = validateRpps(input);
  if ("errors" in validation) throw new Error(`Generated project artifact RPPS failed validation: ${validation.errors.join("; ")}`);
  // Preserve reviewed extension fields that RPPS validation intentionally ignores.
  return JSON.stringify(input);
}

function originalGuard(project: PreparedReviewedProjectArtifact): string {
  const { row, definition } = project;
  return `p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.current_version_id = ${sqlString(row.current_version_id)} AND p.project_kind = 'physical_design' AND p.visibility = 'public' AND p.status = 'published' AND p.repository_url = ${sqlString(definition.repository_url)} AND p.revision = ${sqlString(definition.revision)} AND p.updated_at = ${sqlString(row.updated_at)} AND pv.id = p.current_version_id AND pv.project_id = p.id AND pv.rpps_json = ${sqlString(row.rpps_json)}`;
}

export function buildReviewedProjectArtifactForwardSql(
  projects: PreparedReviewedProjectArtifact[],
  wave: string,
  now: string,
): string {
  const lines = [`-- Guarded source-backed project artifact wave ${wave}.`];
  for (const project of projects) {
    const { definition, row } = project;
    const guard = originalGuard(project);
    lines.push(`INSERT INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256, owner_user_id, organization_id, visibility, status, kind, metadata_json, created_at, updated_at)
SELECT ${sqlString(project.fileId)}, ${sqlString(project.objectKey)}, ${sqlString(project.originalName)}, ${sqlString(definition.media_type)}, ${definition.size_bytes}, ${sqlString(definition.sha256)}, p.owner_user_id, p.organization_id, 'public', 'ready', ${sqlString(definition.file_kind)}, json(${sqlString(project.metadataJson)}), ${sqlString(now)}, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND (p.owner_user_id IS NOT NULL OR p.organization_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM project_files existing_path WHERE existing_path.project_id = p.id AND lower(existing_path.relative_path) = lower(${sqlString(definition.path)}))
  AND NOT EXISTS (SELECT 1 FROM files existing_file WHERE existing_file.id = ${sqlString(project.fileId)} OR existing_file.object_key = ${sqlString(project.objectKey)});`);
    lines.push(`INSERT INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
SELECT p.id, pv.id, f.id, ${sqlString(definition.purpose)}, ${sqlString(definition.path)}, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id JOIN files f ON f.id = ${sqlString(project.fileId)}
WHERE ${guard} AND f.object_key = ${sqlString(project.objectKey)} AND f.checksum_sha256 = ${sqlString(definition.sha256)} AND f.status = 'ready' AND f.visibility = 'public'
  AND NOT EXISTS (SELECT 1 FROM project_files existing_file WHERE existing_file.project_id = p.id AND existing_file.file_id = f.id);`);
    lines.push(`INSERT INTO evidence (id, source_type, source_url, title, publisher, retrieved_at, confidence, content_hash, excerpt, file_id, is_demo, created_at)
SELECT ${sqlString(project.evidenceId)}, 'repo', ${sqlString(project.sourcePageUrl)}, ${sqlString(`${row.slug} reviewed source artifact ${definition.path}`)}, 'GitHub', ${sqlString(now)}, 1.0, ${sqlString(`sha256:${definition.sha256}`)}, ${sqlString(`${definition.description} Pinned to repository revision ${definition.revision}.`)}, ${sqlString(project.fileId)}, 0, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND EXISTS (SELECT 1 FROM project_files pf WHERE pf.project_id = p.id AND pf.project_version_id = pv.id AND pf.file_id = ${sqlString(project.fileId)})
  AND NOT EXISTS (SELECT 1 FROM evidence existing_evidence WHERE existing_evidence.id = ${sqlString(project.evidenceId)});`);
    lines.push(`INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, confidence, created_at)
SELECT ${sqlString(project.evidenceClaimId)}, ${sqlString(project.evidenceId)}, 'project', p.id, 'artifact.source', ${sqlString(`${project.sourcePageUrl}#sha256=${definition.sha256}`)}, 1.0, ${sqlString(now)}
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

export function buildReviewedProjectArtifactRollbackSql(
  projects: PreparedReviewedProjectArtifact[],
  wave: string,
  now: string,
): string {
  const lines = [`-- Guarded rollback for source-backed project artifact wave ${wave}.`];
  for (const project of [...projects].reverse()) {
    const { definition, row } = project;
    const currentGuard = `EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.current_version_id = ${sqlString(row.current_version_id)} AND p.project_kind = 'physical_design' AND p.updated_at IN (${sqlString(row.updated_at)}, ${sqlString(now)}) AND pv.rpps_json IN (${sqlString(row.rpps_json)}, ${sqlString(project.nextRppsJson)}))`;
    lines.push(`DELETE FROM evidence_claims WHERE id = ${sqlString(project.evidenceClaimId)} AND evidence_id = ${sqlString(project.evidenceId)} AND entity_type = 'project' AND entity_id = ${sqlString(row.id)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM evidence WHERE id = ${sqlString(project.evidenceId)} AND file_id = ${sqlString(project.fileId)} AND content_hash = ${sqlString(`sha256:${definition.sha256}`)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM project_files WHERE project_id = ${sqlString(row.id)} AND project_version_id = ${sqlString(row.current_version_id)} AND file_id = ${sqlString(project.fileId)} AND purpose = ${sqlString(definition.purpose)} AND relative_path = ${sqlString(definition.path)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM files WHERE id = ${sqlString(project.fileId)} AND object_key = ${sqlString(project.objectKey)} AND checksum_sha256 = ${sqlString(definition.sha256)} AND created_at = ${sqlString(now)} AND updated_at = ${sqlString(now)} AND NOT EXISTS (SELECT 1 FROM project_files pf WHERE pf.file_id = ${sqlString(project.fileId)}) AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.file_id = ${sqlString(project.fileId)}) AND ${currentGuard};`);
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(row.rpps_json)} WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND rpps_json = ${sqlString(project.nextRppsJson)} AND ${currentGuard};`);
    lines.push(`UPDATE projects SET updated_at = ${sqlString(row.updated_at)} WHERE id = ${sqlString(row.id)} AND slug = ${sqlString(row.slug)} AND current_version_id = ${sqlString(row.current_version_id)} AND updated_at = ${sqlString(now)} AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(row.current_version_id)} AND pv.project_id = ${sqlString(row.id)} AND pv.rpps_json = ${sqlString(row.rpps_json)});`);
  }
  return `${lines.join("\n")}\n`;
}
