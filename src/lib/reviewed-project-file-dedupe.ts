import { sqlString } from "./physical-design-wave-import";

export type ReviewedProjectFileSnapshot = {
  file_id: string;
  object_key: string;
  original_name: string;
  media_type: string;
  size_bytes: number;
  checksum_sha256: string;
  kind: string;
  status: "ready";
  visibility: "public";
};

export type ReviewedProjectFileLink = ReviewedProjectFileSnapshot & {
  project_id: string;
  project_version_id: string;
  purpose: string;
  relative_path: string;
  created_at: string;
};

export type ReviewedProjectMediaRelink = {
  id: string;
  project_id: string;
  old_file_id: string;
  new_file_id: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
};

export type ReviewedProjectFileDedupeSource =
  | {
      mode: "managed_exact_duplicate";
      canonical_object_provenance: "direct_harvest";
      checksum_sha256: string;
      size_bytes: number;
    }
  | {
      mode: "pinned_repository_revision";
      repository_url: string;
      revision: string;
      path: string;
      source_url: string;
      checksum_sha256: string;
      size_bytes: number;
    };

export type ReviewedProjectFileDedupeDecision = {
  slug: string;
  project_id: string;
  project_version_id: string;
  path_key: string;
  source: ReviewedProjectFileDedupeSource;
  keep: ReviewedProjectFileLink;
  drop: ReviewedProjectFileLink;
  media_relinks: ReviewedProjectMediaRelink[];
};

export type ReviewedProjectFileDedupeWave = {
  wave: string;
  schema_version: 1;
  reviewed_at: string;
  contract: string;
  expected: {
    projects: number;
    duplicate_groups: number;
    removed_links: number;
    media_relinks: number;
    conflicting_content_groups: number;
  };
  decisions: ReviewedProjectFileDedupeDecision[];
};

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_REV_RE = /^[a-f0-9]{40}$/u;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WAVE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validFile(label: string, file: ReviewedProjectFileLink, errors: string[]): void {
  if (!file.file_id?.trim()) errors.push(`${label}: file_id is required`);
  if (!file.object_key?.trim()) errors.push(`${label}: object_key is required`);
  if (!file.original_name?.trim()) errors.push(`${label}: original_name is required`);
  if (!file.media_type?.includes("/")) errors.push(`${label}: media_type is invalid`);
  if (!Number.isInteger(file.size_bytes) || file.size_bytes <= 0) errors.push(`${label}: size_bytes must be positive`);
  if (!SHA256_RE.test(file.checksum_sha256 ?? "")) errors.push(`${label}: checksum_sha256 is invalid`);
  if (!file.kind?.trim()) errors.push(`${label}: kind is required`);
  if (file.status !== "ready") errors.push(`${label}: status must be ready`);
  if (file.visibility !== "public") errors.push(`${label}: visibility must be public`);
  if (!file.project_id?.trim()) errors.push(`${label}: project_id is required`);
  if (!file.project_version_id?.trim()) errors.push(`${label}: project_version_id is required`);
  if (!file.purpose?.trim()) errors.push(`${label}: purpose is required`);
  if (!file.relative_path?.trim()) errors.push(`${label}: relative_path is required`);
  if (!file.created_at || !Number.isFinite(Date.parse(file.created_at))) errors.push(`${label}: created_at is invalid`);
}

export function validateReviewedProjectFileDedupeWave(wave: ReviewedProjectFileDedupeWave): string[] {
  const errors: string[] = [];
  if (!WAVE_RE.test(wave.wave ?? "")) errors.push("wave must be a lowercase kebab-case identifier");
  if (wave.schema_version !== 1) errors.push("schema_version must be 1");
  if (!wave.reviewed_at || !Number.isFinite(Date.parse(wave.reviewed_at))) errors.push("reviewed_at must be an ISO timestamp");
  if (!wave.contract?.trim()) errors.push("contract is required");
  if (!Array.isArray(wave.decisions) || wave.decisions.length === 0) errors.push("decisions must not be empty");

  const identities = new Set<string>();
  const dropLinks = new Set<string>();
  const mediaIds = new Set<string>();
  const projectIds = new Set<string>();
  let conflicts = 0;
  let mediaRelinks = 0;

  for (const decision of wave.decisions ?? []) {
    const label = decision.slug || "(missing slug)";
    if (!SLUG_RE.test(decision.slug ?? "")) errors.push(`${label}: slug is invalid`);
    if (!decision.project_id?.trim()) errors.push(`${label}: project_id is required`);
    if (!decision.project_version_id?.trim()) errors.push(`${label}: project_version_id is required`);
    if (!decision.path_key?.trim() || decision.path_key !== decision.path_key.toLowerCase()) errors.push(`${label}: path_key must be lowercase`);
    const identity = `${decision.project_id}\0${decision.path_key}`;
    if (identities.has(identity)) errors.push(`${label}: duplicate decision for ${decision.path_key}`);
    identities.add(identity);
    projectIds.add(decision.project_id);

    validFile(`${label}/keep`, decision.keep, errors);
    validFile(`${label}/drop`, decision.drop, errors);
    for (const [name, file] of [["keep", decision.keep], ["drop", decision.drop]] as const) {
      if (file.project_id !== decision.project_id) errors.push(`${label}/${name}: project_id mismatch`);
      if (file.project_version_id !== decision.project_version_id) errors.push(`${label}/${name}: project_version_id mismatch`);
      if (file.relative_path.toLowerCase() !== decision.path_key) errors.push(`${label}/${name}: relative_path does not match path_key`);
    }
    if (decision.keep.file_id === decision.drop.file_id) errors.push(`${label}: keep and drop file_id must differ`);
    if (!decision.keep.object_key.startsWith("harvest-file:")) errors.push(`${label}: canonical keep object must be a direct harvest object`);
    if (!decision.drop.object_key.startsWith("catalog-completeness/")) errors.push(`${label}: redundant drop object must be from catalog completeness`);
    const dropIdentity = `${decision.project_id}\0${decision.drop.file_id}`;
    if (dropLinks.has(dropIdentity)) errors.push(`${label}: duplicate drop link ${decision.drop.file_id}`);
    dropLinks.add(dropIdentity);

    const sameContent = decision.keep.checksum_sha256 === decision.drop.checksum_sha256
      && decision.keep.size_bytes === decision.drop.size_bytes;
    if (decision.source.mode === "managed_exact_duplicate") {
      if (!sameContent) errors.push(`${label}: managed_exact_duplicate requires equal size and checksum`);
      if (decision.source.canonical_object_provenance !== "direct_harvest") errors.push(`${label}: canonical provenance must be direct_harvest`);
      if (decision.source.checksum_sha256 !== decision.keep.checksum_sha256) errors.push(`${label}: source checksum does not match canonical file`);
      if (decision.source.size_bytes !== decision.keep.size_bytes) errors.push(`${label}: source size does not match canonical file`);
    } else if (decision.source.mode === "pinned_repository_revision") {
      conflicts += 1;
      if (sameContent) errors.push(`${label}: pinned_repository_revision is only for differing managed content`);
      if (!isHttpsUrl(decision.source.repository_url)) errors.push(`${label}: source repository_url must be HTTPS`);
      if (!GIT_REV_RE.test(decision.source.revision ?? "")) errors.push(`${label}: source revision must be a 40-character git hash`);
      if (!decision.source.path?.trim() || decision.source.path.startsWith("/") || decision.source.path.split("/").includes("..")) errors.push(`${label}: source path is invalid`);
      if (!isHttpsUrl(decision.source.source_url)) errors.push(`${label}: source_url must be HTTPS`);
      if (decision.source.checksum_sha256 !== decision.keep.checksum_sha256) errors.push(`${label}: pinned source checksum does not match canonical file`);
      if (decision.source.size_bytes !== decision.keep.size_bytes) errors.push(`${label}: pinned source size does not match canonical file`);
    } else {
      errors.push(`${label}: unsupported source mode`);
    }

    for (const media of decision.media_relinks ?? []) {
      mediaRelinks += 1;
      if (!media.id?.trim() || mediaIds.has(media.id)) errors.push(`${label}: media relink id is missing or duplicated`);
      mediaIds.add(media.id);
      if (media.project_id !== decision.project_id) errors.push(`${label}/${media.id}: media project_id mismatch`);
      if (media.old_file_id !== decision.drop.file_id || media.new_file_id !== decision.keep.file_id) errors.push(`${label}/${media.id}: media relink file ids do not match decision`);
      if (!Number.isInteger(media.sort_order) || media.sort_order < 0) errors.push(`${label}/${media.id}: media sort_order is invalid`);
      if (!media.created_at || !Number.isFinite(Date.parse(media.created_at))) errors.push(`${label}/${media.id}: media created_at is invalid`);
    }
  }

  const expected = wave.expected;
  if (expected?.projects !== projectIds.size) errors.push(`expected.projects must equal ${projectIds.size}`);
  if (expected?.duplicate_groups !== wave.decisions.length) errors.push(`expected.duplicate_groups must equal ${wave.decisions.length}`);
  if (expected?.removed_links !== wave.decisions.length) errors.push(`expected.removed_links must equal ${wave.decisions.length}`);
  if (expected?.media_relinks !== mediaRelinks) errors.push(`expected.media_relinks must equal ${mediaRelinks}`);
  if (expected?.conflicting_content_groups !== conflicts) errors.push(`expected.conflicting_content_groups must equal ${conflicts}`);
  return errors;
}

function fileGuard(alias: string, file: ReviewedProjectFileLink): string {
  return `${alias}.id = ${sqlString(file.file_id)} AND ${alias}.object_key = ${sqlString(file.object_key)} AND ${alias}.original_name = ${sqlString(file.original_name)} AND ${alias}.media_type = ${sqlString(file.media_type)} AND ${alias}.size_bytes = ${file.size_bytes} AND ${alias}.checksum_sha256 = ${sqlString(file.checksum_sha256)} AND ${alias}.kind = ${sqlString(file.kind)} AND ${alias}.status = 'ready' AND ${alias}.visibility = 'public' AND ${alias}.deleted_at IS NULL`;
}

function linkGuard(alias: string, file: ReviewedProjectFileLink): string {
  return `${alias}.project_id = ${sqlString(file.project_id)} AND ${alias}.project_version_id = ${sqlString(file.project_version_id)} AND ${alias}.file_id = ${sqlString(file.file_id)} AND ${alias}.purpose = ${sqlString(file.purpose)} AND ${alias}.relative_path = ${sqlString(file.relative_path)} AND ${alias}.created_at = ${sqlString(file.created_at)}`;
}

function projectGuard(decision: ReviewedProjectFileDedupeDecision): string {
  return `EXISTS (SELECT 1 FROM projects p WHERE p.id = ${sqlString(decision.project_id)} AND p.slug = ${sqlString(decision.slug)} AND p.current_version_id = ${sqlString(decision.project_version_id)} AND p.deleted_at IS NULL)`;
}

function exactFileAndLink(file: ReviewedProjectFileLink): string {
  return `EXISTS (SELECT 1 FROM project_files pf JOIN files f ON f.id = pf.file_id WHERE ${linkGuard("pf", file)} AND ${fileGuard("f", file)})`;
}

function mediaGuard(media: ReviewedProjectMediaRelink, fileId: string): string {
  return `id = ${sqlString(media.id)} AND project_id = ${sqlString(media.project_id)} AND file_id = ${sqlString(fileId)} AND caption IS ${sqlString(media.caption)} AND alt_text IS ${sqlString(media.alt_text)} AND sort_order = ${media.sort_order} AND created_at = ${sqlString(media.created_at)}`;
}

export function buildReviewedProjectFileDedupeForwardSql(decisions: ReviewedProjectFileDedupeDecision[], wave: string): string {
  const lines = [`-- Guarded source-backed project-file dedupe wave ${wave}.`];
  for (const decision of decisions) {
    for (const media of decision.media_relinks) {
      lines.push(`UPDATE project_media SET file_id = ${sqlString(media.new_file_id)}
WHERE ${mediaGuard(media, media.old_file_id)} AND ${projectGuard(decision)}
  AND ${exactFileAndLink(decision.keep)} AND ${exactFileAndLink(decision.drop)};`);
    }
    lines.push(`DELETE FROM project_files
WHERE ${linkGuard("project_files", decision.drop)} AND ${projectGuard(decision)}
  AND EXISTS (SELECT 1 FROM files f WHERE ${fileGuard("f", decision.drop)})
  AND ${exactFileAndLink(decision.keep)}
  AND NOT EXISTS (SELECT 1 FROM project_media pm WHERE pm.project_id = ${sqlString(decision.project_id)} AND pm.file_id = ${sqlString(decision.drop.file_id)});`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildReviewedProjectFileDedupeRollbackSql(decisions: ReviewedProjectFileDedupeDecision[], wave: string): string {
  const lines = [`-- Guarded rollback for source-backed project-file dedupe wave ${wave}.`];
  for (const decision of [...decisions].reverse()) {
    lines.push(`INSERT INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
SELECT ${sqlString(decision.drop.project_id)}, ${sqlString(decision.drop.project_version_id)}, ${sqlString(decision.drop.file_id)}, ${sqlString(decision.drop.purpose)}, ${sqlString(decision.drop.relative_path)}, ${sqlString(decision.drop.created_at)}
WHERE ${projectGuard(decision)} AND EXISTS (SELECT 1 FROM files f WHERE ${fileGuard("f", decision.drop)})
  AND ${exactFileAndLink(decision.keep)}
  AND NOT EXISTS (SELECT 1 FROM project_files pf WHERE pf.project_id = ${sqlString(decision.drop.project_id)} AND pf.file_id = ${sqlString(decision.drop.file_id)});`);
    for (const media of [...decision.media_relinks].reverse()) {
      lines.push(`UPDATE project_media SET file_id = ${sqlString(media.old_file_id)}
WHERE ${mediaGuard(media, media.new_file_id)} AND ${projectGuard(decision)}
  AND ${exactFileAndLink(decision.keep)} AND ${exactFileAndLink(decision.drop)};`);
    }
  }
  return `${lines.join("\n")}\n`;
}
