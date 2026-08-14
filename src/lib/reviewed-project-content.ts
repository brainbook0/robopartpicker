import { stableId as artifactStableId } from "./catalog-completeness-backfill";
import { stableId as entityStableId, sqlString } from "./physical-design-wave-import";

export type ReviewedProjectContentStepDefinition = {
  step_key: string;
  heading: string;
  title: string;
};

export type ReviewedProjectContentDefinition = {
  project_id: string;
  repo_url: string;
  revision: string;
  name: string;
  summary: string;
  description: string;
  docs_path: string;
  docs_sha256: string;
  cover: {
    path: string;
    sha256: string;
    size_bytes: number;
    caption: string;
    alt_text: string;
  };
  assembly_source: {
    path: string;
    sha256: string;
  };
  steps: ReviewedProjectContentStepDefinition[];
};

export type ReviewedProjectContentWave = {
  wave: string;
  schema_version: number;
  projects: ReviewedProjectContentDefinition[];
};

export type PreparedProjectStep = ReviewedProjectContentStepDefinition & {
  id: string;
  body: string;
  sort_order: number;
};

export type ReviewedProjectContentRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  repository_url: string | null;
  revision: string | null;
  updated_at: string;
  current_version_id: string;
  rpps_json: string;
};

export type PreparedReviewedProjectContent = {
  definition: ReviewedProjectContentDefinition;
  row: ReviewedProjectContentRow;
  nextRppsJson: string;
  coverFileId: string;
  coverUrl: string;
  mediaId: string;
  evidenceId: string;
  evidenceClaimId: string;
  steps: PreparedProjectStep[];
};

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_REV_RE = /^[a-f0-9]{40}$/u;
const STEP_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function validateReviewedProjectContentWave(wave: ReviewedProjectContentWave): string[] {
  const errors: string[] = [];
  if (!wave.wave?.trim()) errors.push("wave is required");
  if (wave.schema_version !== 1) errors.push("schema_version must be 1");
  if (!Array.isArray(wave.projects) || wave.projects.length === 0) errors.push("projects must not be empty");
  const slugs = new Set<string>();
  for (const project of wave.projects ?? []) {
    if (!project.project_id?.trim()) errors.push("project_id is required");
    else if (slugs.has(project.project_id)) errors.push(`${project.project_id}: duplicate project_id`);
    else slugs.add(project.project_id);
    try { new URL(project.repo_url); } catch { errors.push(`${project.project_id}: repo_url must be a URL`); }
    if (!GIT_REV_RE.test(project.revision)) errors.push(`${project.project_id}: revision must be a lowercase 40-character git hash`);
    if (!project.name?.trim()) errors.push(`${project.project_id}: name is required`);
    if (!project.summary?.trim()) errors.push(`${project.project_id}: summary is required`);
    if (!project.description?.trim()) errors.push(`${project.project_id}: description is required`);
    if (!project.docs_path?.trim()) errors.push(`${project.project_id}: docs_path is required`);
    if (!SHA256_RE.test(project.docs_sha256)) errors.push(`${project.project_id}: docs_sha256 is invalid`);
    if (!project.cover?.path?.trim()) errors.push(`${project.project_id}: cover path is required`);
    if (!SHA256_RE.test(project.cover?.sha256 ?? "")) errors.push(`${project.project_id}: cover sha256 is invalid`);
    if (!Number.isInteger(project.cover?.size_bytes) || project.cover.size_bytes <= 0) errors.push(`${project.project_id}: cover size_bytes must be positive`);
    if (!project.assembly_source?.path?.trim()) errors.push(`${project.project_id}: assembly source path is required`);
    if (!SHA256_RE.test(project.assembly_source?.sha256 ?? "")) errors.push(`${project.project_id}: assembly source sha256 is invalid`);
    if (!Array.isArray(project.steps) || project.steps.length === 0) errors.push(`${project.project_id}: steps must not be empty`);
    const stepKeys = new Set<string>();
    for (const step of project.steps ?? []) {
      if (!STEP_KEY_RE.test(step.step_key)) errors.push(`${project.project_id}: invalid step_key ${step.step_key}`);
      if (stepKeys.has(step.step_key)) errors.push(`${project.project_id}: duplicate step_key ${step.step_key}`);
      stepKeys.add(step.step_key);
      if (!/^##\s+\S/u.test(step.heading)) errors.push(`${project.project_id}/${step.step_key}: heading must be an H2 heading`);
      if (!step.title?.trim()) errors.push(`${project.project_id}/${step.step_key}: title is required`);
    }
  }
  return errors;
}

export function canonicalRepo(value: string): string {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\.git$/iu, "").replace(/\/+$/u, "").toLowerCase()}`;
}

export function immutableBlobUrl(project: Pick<ReviewedProjectContentDefinition, "repo_url" | "revision">, path: string): string {
  const base = project.repo_url.replace(/\.git$/iu, "").replace(/\/+$/u, "");
  return `${base}/blob/${project.revision}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function reviewedCoverFileId(project: ReviewedProjectContentDefinition): string {
  return artifactStableId("harvest-file", [project.project_id, project.cover.sha256, project.cover.path]);
}

export function reviewedMediaId(projectId: string, coverFileId: string, wave: string): string {
  return entityStableId("pmedia", `${projectId}:${coverFileId}:${wave}`);
}

export function reviewedFileContentUrl(origin: string, fileId: string): string {
  return `${origin.replace(/\/+$/u, "")}/api/v1/files/content?id=${encodeURIComponent(fileId)}`;
}

export function extractMarkdownSection(markdown: string, heading: string): string {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === heading.trim());
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^##\s+\S/u.test(line.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .replace(/<img\b[^>]*>/giu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function prepareProjectSteps(
  wave: Pick<ReviewedProjectContentWave, "wave">,
  project: ReviewedProjectContentDefinition,
  assemblyMarkdown: string,
): PreparedProjectStep[] {
  const sourceUrl = immutableBlobUrl(project, project.assembly_source.path);
  return project.steps.map((step, index) => {
    const section = extractMarkdownSection(assemblyMarkdown, step.heading);
    if (!section) throw new Error(`${project.project_id}/${step.step_key}: heading not found in assembly source: ${step.heading}`);
    const body = `${section}\n\nSource: ${sourceUrl}`;
    return {
      ...step,
      id: entityStableId("pstep", `${project.project_id}:${wave.wave}:${step.step_key}`),
      body: body.slice(0, 8_000),
      sort_order: index,
    };
  });
}

export function buildReviewedProjectContentForwardSql(projects: PreparedReviewedProjectContent[], wave: string, now: string): string {
  const lines: string[] = [];
  for (const project of projects) {
    const { definition, row } = project;
    const originalGuard = `SELECT pv.id FROM project_versions pv JOIN projects p ON p.id = pv.project_id WHERE pv.id = ${sqlString(row.current_version_id)} AND p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.current_version_id = pv.id AND p.repository_url = ${sqlString(row.repository_url)} AND p.revision = ${sqlString(row.revision)} AND p.name = ${sqlString(row.name)} AND p.summary IS ${sqlString(row.summary)} AND p.description IS ${sqlString(row.description)} AND p.updated_at = ${sqlString(row.updated_at)} AND pv.rpps_json = ${sqlString(row.rpps_json)}`;
    project.steps.forEach((step, index) => {
      const versionExpression = index === 0 ? `(${originalGuard})` : sqlString(row.current_version_id);
      lines.push(`INSERT INTO project_steps (id, project_version_id, step_key, title, body, sort_order, estimated_minutes) VALUES (${sqlString(step.id)}, ${versionExpression}, ${sqlString(step.step_key)}, ${sqlString(step.title)}, ${sqlString(step.body)}, ${step.sort_order}, NULL);`);
    });
    lines.push(`INSERT INTO project_media (id, project_id, file_id, caption, alt_text, sort_order, created_at) VALUES (${sqlString(project.mediaId)}, ${sqlString(row.id)}, ${sqlString(project.coverFileId)}, ${sqlString(definition.cover.caption)}, ${sqlString(definition.cover.alt_text)}, 0, ${sqlString(now)});`);
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(project.nextRppsJson)} WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND rpps_json = ${sqlString(row.rpps_json)};`);
    lines.push(`UPDATE projects SET name = ${sqlString(definition.name)}, summary = ${sqlString(definition.summary)}, description = ${sqlString(definition.description)}, updated_at = ${sqlString(now)} WHERE id = ${sqlString(row.id)} AND slug = ${sqlString(row.slug)} AND current_version_id = ${sqlString(row.current_version_id)} AND repository_url = ${sqlString(row.repository_url)} AND revision = ${sqlString(row.revision)} AND name = ${sqlString(row.name)} AND summary IS ${sqlString(row.summary)} AND description IS ${sqlString(row.description)} AND updated_at = ${sqlString(row.updated_at)};`);
    lines.push(`INSERT INTO evidence (id, source_type, source_url, title, publisher, retrieved_at, confidence, content_hash, excerpt, is_demo, created_at) VALUES (${sqlString(project.evidenceId)}, 'repo', ${sqlString(immutableBlobUrl(definition, definition.assembly_source.path))}, ${sqlString(`${definition.name} official assembly guide`)}, 'github.com', ${sqlString(now)}, 0.98, ${sqlString(`sha256:${definition.assembly_source.sha256}`)}, ${sqlString(`Reviewed project content wave ${wave}; official assembly source pinned to ${definition.revision}.`)}, 0, ${sqlString(now)});`);
    lines.push(`INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, confidence, created_at) VALUES (${sqlString(project.evidenceClaimId)}, ${sqlString(project.evidenceId)}, 'project', ${sqlString(row.id)}, 'assembly.source', ${sqlString(`${definition.assembly_source.path}@${definition.revision}`)}, 0.98, ${sqlString(now)});`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildReviewedProjectContentRollbackSql(projects: PreparedReviewedProjectContent[], wave: string, now: string): string {
  const lines = [`-- Guarded rollback for ${wave}.`];
  for (const project of [...projects].reverse()) {
    const { definition, row } = project;
    const currentGuard = `EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(row.id)} AND pv.id = ${sqlString(row.current_version_id)} AND p.name = ${sqlString(definition.name)} AND p.summary = ${sqlString(definition.summary)} AND p.description = ${sqlString(definition.description)} AND p.updated_at = ${sqlString(now)} AND pv.rpps_json = ${sqlString(project.nextRppsJson)})`;
    lines.push(`DELETE FROM evidence_claims WHERE id = ${sqlString(project.evidenceClaimId)} AND evidence_id = ${sqlString(project.evidenceId)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM evidence WHERE id = ${sqlString(project.evidenceId)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM project_media WHERE id = ${sqlString(project.mediaId)} AND project_id = ${sqlString(row.id)} AND file_id = ${sqlString(project.coverFileId)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
    lines.push(`DELETE FROM project_steps WHERE id IN (${project.steps.map((step) => sqlString(step.id)).join(", ")}) AND project_version_id = ${sqlString(row.current_version_id)} AND ${currentGuard};`);
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(row.rpps_json)} WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND rpps_json = ${sqlString(project.nextRppsJson)} AND ${currentGuard};`);
    lines.push(`UPDATE projects SET name = ${sqlString(row.name)}, summary = ${sqlString(row.summary)}, description = ${sqlString(row.description)}, updated_at = ${sqlString(row.updated_at)} WHERE id = ${sqlString(row.id)} AND current_version_id = ${sqlString(row.current_version_id)} AND name = ${sqlString(definition.name)} AND summary = ${sqlString(definition.summary)} AND description = ${sqlString(definition.description)} AND updated_at = ${sqlString(now)};`);
  }
  return `${lines.join("\n")}\n`;
}
