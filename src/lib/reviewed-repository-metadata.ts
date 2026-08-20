import { stableId, sqlString } from "./physical-design-wave-import";
import { validateRpps } from "./rpps/schema";

export type ReviewedMetadataField = "summary" | "description" | "license_spdx";

export type ReviewedMetadataSourceDerivation =
  | "readme-summary"
  | "readme-description"
  | "github-repository-description"
  | "verified-document-description"
  | "github-license-file"
  | "github-license-absence"
  | "commercial-catalog-status";

export type ReviewedDocumentFormat = "markdown" | "html";
export type ReviewedDocumentDescriptionExtraction = "repository-description" | "exact-excerpt";

export type ReviewedRepositoryMetadataSource = {
  derivation: ReviewedMetadataSourceDerivation;
  source_url: string;
  content_url?: string;
  document_format?: ReviewedDocumentFormat;
  description_extraction?: ReviewedDocumentDescriptionExtraction;
  path?: string;
  sha256?: string;
  size_bytes?: number;
  spdx_id?: string;
};

export type ReviewedRepositoryMetadataDefinition = {
  slug: string;
  name: string;
  project_kind: string;
  repository_url: string | null;
  revision: string | null;
  updates: Partial<Record<ReviewedMetadataField, string>>;
  sources: Partial<Record<ReviewedMetadataField, ReviewedRepositoryMetadataSource>>;
};

export type ReviewedRepositoryMetadataWave = {
  wave: string;
  schema_version: number;
  reviewed_at: string;
  projects: ReviewedRepositoryMetadataDefinition[];
};

export type ReviewedRepositoryMetadataSourceVerificationCheckpoint = {
  schema_version: 1;
  env: string;
  wave: string;
  reviewed_at: string;
  wave_projects: number;
  source_total: number;
  verified_keys: string[];
  started_at: string;
  updated_at: string;
};

export type ReviewedRepositoryMetadataRow = {
  id: string;
  slug: string;
  name: string;
  project_kind: string;
  repository_url: string | null;
  revision: string | null;
  summary: string | null;
  description: string | null;
  license_spdx: string | null;
  visibility: string;
  status: string;
  updated_at: string;
  current_version_id: string;
  rpps_json: string;
};

export type PreparedRepositoryMetadataEvidence = {
  field: ReviewedMetadataField;
  value: string;
  source: ReviewedRepositoryMetadataSource;
  evidenceId: string;
  claimId: string;
  sourceType: "repo" | "docs";
  title: string;
  publisher: string;
  confidence: number;
  contentHash: string | null;
  excerpt: string;
};

export type PreparedReviewedRepositoryMetadata = {
  definition: ReviewedRepositoryMetadataDefinition;
  row: ReviewedRepositoryMetadataRow;
  nextSummary: string | null;
  nextDescription: string | null;
  nextLicenseSpdx: string | null;
  nextRppsJson: string;
  evidence: PreparedRepositoryMetadataEvidence[];
};

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_REV_RE = /^[a-f0-9]{40}$/u;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WAVE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FIELDS: ReviewedMetadataField[] = ["summary", "description", "license_spdx"];
const README_DERIVATIONS = new Set<ReviewedMetadataSourceDerivation>(["readme-summary", "readme-description"]);
const LICENSE_DERIVATIONS = new Set<ReviewedMetadataSourceDerivation>([
  "github-license-file",
  "github-license-absence",
  "commercial-catalog-status",
]);

export function reviewedRepositoryMetadataSourceVerificationKey(
  definition: ReviewedRepositoryMetadataDefinition,
  source: ReviewedRepositoryMetadataSource,
): string {
  return JSON.stringify([
    definition.repository_url,
    definition.revision,
    source.derivation,
    source.source_url,
    source.content_url ?? null,
    source.document_format ?? null,
    source.description_extraction ?? null,
    source.path ?? null,
    source.sha256 ?? null,
    source.size_bytes ?? null,
    source.spdx_id ?? null,
  ]);
}

export function reviewedRepositoryMetadataSourceVerificationKeys(
  wave: ReviewedRepositoryMetadataWave,
): string[] {
  const keys = new Set<string>();
  for (const definition of wave.projects) {
    for (const source of Object.values(definition.sources)) {
      if (source) keys.add(reviewedRepositoryMetadataSourceVerificationKey(definition, source));
    }
  }
  return [...keys].sort();
}

export function validateReviewedRepositoryMetadataSourceVerificationCheckpoint(
  value: unknown,
  wave: ReviewedRepositoryMetadataWave,
  env: string,
): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["checkpoint must be an object"];
  const checkpoint = value as Partial<ReviewedRepositoryMetadataSourceVerificationCheckpoint>;
  const expectedKeys = new Set(reviewedRepositoryMetadataSourceVerificationKeys(wave));
  if (checkpoint.schema_version !== 1) errors.push("checkpoint schema_version must be 1");
  if (checkpoint.env !== env) errors.push(`checkpoint env must be ${env}`);
  if (checkpoint.wave !== wave.wave) errors.push("checkpoint wave does not match");
  if (checkpoint.reviewed_at !== wave.reviewed_at) errors.push("checkpoint reviewed_at does not match");
  if (checkpoint.wave_projects !== wave.projects.length) errors.push("checkpoint project count does not match");
  if (checkpoint.source_total !== expectedKeys.size) errors.push("checkpoint source count does not match");
  if (!Array.isArray(checkpoint.verified_keys)) {
    errors.push("checkpoint verified_keys must be an array");
  } else {
    const uniqueKeys = new Set(checkpoint.verified_keys);
    if (uniqueKeys.size !== checkpoint.verified_keys.length) errors.push("checkpoint verified_keys must be unique");
    for (const key of uniqueKeys) {
      if (typeof key !== "string" || !expectedKeys.has(key)) {
        errors.push("checkpoint contains a source key outside the current wave");
        break;
      }
    }
  }
  if (!checkpoint.started_at || !Number.isFinite(Date.parse(checkpoint.started_at))) errors.push("checkpoint started_at must be an ISO timestamp");
  if (!checkpoint.updated_at || !Number.isFinite(Date.parse(checkpoint.updated_at))) errors.push("checkpoint updated_at must be an ISO timestamp");
  return errors;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function githubRepositoryParts(repositoryUrl: string): { owner: string; repo: string } | null {
  const match = repositoryUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/iu);
  return match ? { owner: match[1], repo: match[2] } : null;
}

export function immutableGithubBlobUrl(repositoryUrl: string, revision: string, path: string): string {
  const base = repositoryUrl.replace(/\.git$/iu, "").replace(/\/+$/u, "");
  return `${base}/blob/${revision}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function githubRevisionTreeUrl(repositoryUrl: string, revision: string): string {
  return `${repositoryUrl.replace(/\.git$/iu, "").replace(/\/+$/u, "")}/tree/${revision}`;
}

export function normalizeGithubRepositoryDescription(value: string | null | undefined): string {
  return cleanInlineMarkdown(value ?? "");
}

export function repositoryDescriptionQualityIssues(value: string | null | undefined): string[] {
  const description = value?.trim() ?? "";
  const issues: string[] = [];
  const cjkLength = description.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  if (!description) return ["missing"];
  if (description.length < 15 && cjkLength < 6) issues.push("too-short");
  if (description.length > 1_200) issues.push("too-long");
  if (/^(?:source code|code|robotics|ros package|my project|test project|project files?)\.?$/iu.test(description)) issues.push("generic");
  if (/(?:<!--|```|~~~|!\[[^\]]*\]\(|\[[^\]]+\]\([^)]*\)|<\/?(?:img|a|table|thead|tbody|tr|td|p|div|br|h[1-6]|details|summary)\b|(?:^|\n)#{1,6}\s|shields\.io|build status|table of contents)/iu.test(description)) issues.push("markup");
  const structuredLines = description.split(/\r?\n/gu).filter((line) => /^\s*(?:[-+*]|\d+[.)]|\|)/u.test(line)).length;
  if (structuredLines >= 4) issues.push("list-or-table");
  return issues;
}

export function repositoryDescriptionNeedsCleanup(value: string | null | undefined): boolean {
  return repositoryDescriptionQualityIssues(value).length > 0;
}

export function reviewedMetadataOriginalStateAllowed(
  field: ReviewedMetadataField,
  columnValue: unknown,
  rppsValue: unknown,
): boolean {
  const columnEmpty = typeof columnValue !== "string" || columnValue.trim() === "";
  const rppsEmpty = typeof rppsValue !== "string" || rppsValue.trim() === "";
  if (columnEmpty && rppsEmpty) return true;
  return field === "description"
    && typeof columnValue === "string"
    && columnValue === rppsValue
    && repositoryDescriptionNeedsCleanup(columnValue);
}

export function githubLicenseVerificationState(status: number, ok: boolean): "absent" | "detected" | "unavailable" {
  if (status === 404) return "absent";
  return ok ? "detected" : "unavailable";
}

function expectedDerivations(field: ReviewedMetadataField): Set<ReviewedMetadataSourceDerivation> {
  if (field === "summary") return new Set(["readme-summary"]);
  if (field === "description") return new Set(["readme-description", "github-repository-description", "verified-document-description"]);
  return LICENSE_DERIVATIONS;
}

type ImmutableReviewedDocument =
  | { kind: "wayback" }
  | { kind: "github-blob"; owner: string; repo: string; revision: string; path: string };

function immutableReviewedDocument(url: string): ImmutableReviewedDocument | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "web.archive.org" && /^\/web\/\d{14}id_\/https?:\/\//u.test(parsed.pathname)) {
      return { kind: "wayback" };
    }
    if (parsed.hostname === "github.com") {
      const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([a-f0-9]{40})\/(.+)$/u);
      if (match) return { kind: "github-blob", owner: match[1], repo: match[2], revision: match[3], path: match[4] };
    }
  } catch {
    return null;
  }
  return null;
}

function immutableGithubRawUrl(document: Extract<ImmutableReviewedDocument, { kind: "github-blob" }>): string {
  return `https://raw.githubusercontent.com/${document.owner}/${document.repo}/${document.revision}/${document.path}`;
}

export function validateReviewedRepositoryMetadataWave(wave: ReviewedRepositoryMetadataWave): string[] {
  const errors: string[] = [];
  if (!WAVE_RE.test(wave.wave ?? "")) errors.push("wave must be a lowercase kebab-case identifier");
  if (wave.schema_version !== 1) errors.push("schema_version must be 1");
  if (!wave.reviewed_at || Number.isNaN(Date.parse(wave.reviewed_at))) errors.push("reviewed_at must be an ISO timestamp");
  if (!Array.isArray(wave.projects) || wave.projects.length === 0) errors.push("projects must not be empty");

  const slugs = new Set<string>();
  for (const project of wave.projects ?? []) {
    if (!SLUG_RE.test(project.slug ?? "")) errors.push(`${project.slug || "(missing slug)"}: slug is invalid`);
    else if (slugs.has(project.slug)) errors.push(`${project.slug}: duplicate slug`);
    else slugs.add(project.slug);
    if (!project.name?.trim()) errors.push(`${project.slug}: name is required`);
    const parts = project.repository_url ? githubRepositoryParts(project.repository_url) : null;
    if (project.repository_url && !parts) errors.push(`${project.slug}: repository_url must be a canonical GitHub repository URL`);
    if (project.repository_url && !GIT_REV_RE.test(project.revision ?? "")) errors.push(`${project.slug}: revision must be a lowercase 40-character git hash`);

    const fields = FIELDS.filter((field) => Object.hasOwn(project.updates ?? {}, field));
    if (fields.length === 0) errors.push(`${project.slug}: updates must contain at least one field`);
    for (const field of fields) {
      const value = project.updates[field];
      const source = project.sources?.[field];
      if (!value?.trim()) errors.push(`${project.slug}: ${field} update must not be empty`);
      if (field === "summary" && (value?.length ?? 0) > 280) errors.push(`${project.slug}: summary exceeds 280 characters`);
      if (field === "description" && (value?.length ?? 0) > 20_000) errors.push(`${project.slug}: description exceeds 20000 characters`);
      if (field === "license_spdx" && (value?.length ?? 0) > 80) errors.push(`${project.slug}: license_spdx exceeds 80 characters`);
      if (!source) {
        errors.push(`${project.slug}: ${field} source is required`);
        continue;
      }
      if (!expectedDerivations(field).has(source.derivation)) {
        errors.push(`${project.slug}: ${field} cannot use ${source.derivation}`);
      }
      if (!isHttpsUrl(source.source_url ?? "")) errors.push(`${project.slug}: ${field} source_url must be HTTPS`);

      if (README_DERIVATIONS.has(source.derivation)) {
        if (!project.repository_url || !project.revision) errors.push(`${project.slug}: ${field} README source requires a pinned repository`);
        if (!source.path?.trim()) errors.push(`${project.slug}: ${field} README path is required`);
        if (!SHA256_RE.test(source.sha256 ?? "")) errors.push(`${project.slug}: ${field} README sha256 is invalid`);
        if (!Number.isInteger(source.size_bytes) || (source.size_bytes ?? 0) <= 0) errors.push(`${project.slug}: ${field} README size_bytes must be positive`);
        if (project.repository_url && project.revision && source.path && source.source_url !== immutableGithubBlobUrl(project.repository_url, project.revision, source.path)) {
          errors.push(`${project.slug}: ${field} README source_url is not the immutable blob URL`);
        }
      }
      if (source.derivation === "github-repository-description") {
        if (!project.repository_url || !project.revision) errors.push(`${project.slug}: repository description source requires a pinned project identity`);
        if (!SHA256_RE.test(source.sha256 ?? "")) errors.push(`${project.slug}: repository description sha256 is invalid`);
        if (!Number.isInteger(source.size_bytes) || (source.size_bytes ?? 0) <= 0) errors.push(`${project.slug}: repository description size_bytes must be positive`);
        if (source.source_url !== project.repository_url) errors.push(`${project.slug}: repository description source_url must equal repository_url`);
      }
      if (source.derivation === "verified-document-description") {
        const immutableDocument = immutableReviewedDocument(source.source_url);
        if (!immutableDocument) errors.push(`${project.slug}: verified document source_url must be an immutable Wayback capture or GitHub blob URL`);
        if (!SHA256_RE.test(source.sha256 ?? "")) errors.push(`${project.slug}: verified document sha256 is invalid`);
        if (!Number.isInteger(source.size_bytes) || (source.size_bytes ?? 0) <= 0) errors.push(`${project.slug}: verified document size_bytes must be positive`);
        if (source.document_format !== "markdown" && source.document_format !== "html") errors.push(`${project.slug}: verified document format is invalid`);
        if (source.description_extraction !== "repository-description" && source.description_extraction !== "exact-excerpt") {
          errors.push(`${project.slug}: verified document description_extraction is invalid`);
        }
        if (source.description_extraction === "repository-description" && source.document_format !== "markdown") {
          errors.push(`${project.slug}: repository-description extraction requires markdown`);
        }
        if (source.content_url && !isHttpsUrl(source.content_url)) errors.push(`${project.slug}: verified document content_url must be HTTPS`);
        if (immutableDocument?.kind === "github-blob") {
          if (project.revision && immutableDocument.revision !== project.revision) errors.push(`${project.slug}: verified GitHub document revision must equal the project revision`);
          if (source.content_url !== immutableGithubRawUrl(immutableDocument)) errors.push(`${project.slug}: verified GitHub document content_url must be the matching immutable raw URL`);
        } else if (immutableDocument?.kind === "wayback" && source.content_url && source.content_url !== source.source_url) {
          errors.push(`${project.slug}: verified Wayback document content_url must equal source_url when provided`);
        }
      }
      if (source.derivation === "github-license-file") {
        if (!project.repository_url || !project.revision) errors.push(`${project.slug}: license file source requires a pinned repository`);
        if (!source.path?.trim()) errors.push(`${project.slug}: license file path is required`);
        if (!SHA256_RE.test(source.sha256 ?? "")) errors.push(`${project.slug}: license file sha256 is invalid`);
        if (!Number.isInteger(source.size_bytes) || (source.size_bytes ?? -1) < 0) errors.push(`${project.slug}: license file size_bytes must be non-negative`);
        if (!source.spdx_id || source.spdx_id !== value) errors.push(`${project.slug}: license file spdx_id must equal the update`);
        if (project.repository_url && project.revision && source.path && source.source_url !== immutableGithubBlobUrl(project.repository_url, project.revision, source.path)) {
          errors.push(`${project.slug}: license file source_url is not the immutable blob URL`);
        }
      }
      if (source.derivation === "github-license-absence") {
        if (value !== "NOASSERTION") errors.push(`${project.slug}: absent license must use NOASSERTION`);
        if (!project.repository_url || !project.revision) errors.push(`${project.slug}: absent license source requires a pinned repository`);
        if (project.repository_url && project.revision && source.source_url !== githubRevisionTreeUrl(project.repository_url, project.revision)) {
          errors.push(`${project.slug}: absent license source_url must equal the immutable revision tree URL`);
        }
      }
      if (source.derivation === "commercial-catalog-status") {
        if (value !== "NOASSERTION") errors.push(`${project.slug}: commercial license status must use NOASSERTION`);
        if (project.project_kind !== "commercial_showcase") errors.push(`${project.slug}: commercial status requires commercial_showcase kind`);
        if (project.repository_url) errors.push(`${project.slug}: commercial status requires no repository URL`);
      }
    }
    for (const field of FIELDS) {
      if (!Object.hasOwn(project.updates ?? {}, field) && project.sources?.[field]) errors.push(`${project.slug}: ${field} has a source without an update`);
    }
  }
  return errors;
}

export function validateReviewedRepositoryMetadataQuality(wave: ReviewedRepositoryMetadataWave): string[] {
  const errors: string[] = [];
  const markupNoise = /(?:shields\.io|build status|table of contents|^#{1,6}\s)/iu;
  const setupNoise = /\b(?:git clone|pip install|npm install|navigate to|please install|run the following)\b/iu;
  const genericProse = /^(?:source code|code|robotics|ros package|my project|test project|project files?)\.?$/iu;
  for (const project of wave.projects ?? []) {
    for (const field of ["summary", "description"] as const) {
      const value = project.updates?.[field]?.trim();
      const source = project.sources?.[field];
      if (!value) continue;
      const cjkLength = value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
      if (field === "summary" && value.length < 20 && cjkLength < 10) errors.push(`${project.slug}: summary is too short to identify the project`);
      if (field === "description" && value.length < 15 && cjkLength < 6) errors.push(`${project.slug}: description is too short to identify the project`);
      if (markupNoise.test(value)) errors.push(`${project.slug}: ${field} contains markup or navigation noise`);
      if (genericProse.test(value)) errors.push(`${project.slug}: ${field} is generic placeholder prose`);
      if (field === "summary" && (setupNoise.test(value) || /https?:\/\//iu.test(value))) errors.push(`${project.slug}: summary contains setup instructions or a raw URL`);
      if (field === "description" && source?.derivation === "readme-description" && setupNoise.test(value)) {
        errors.push(`${project.slug}: README description contains setup instructions`);
      }
      if (field === "description") {
        for (const issue of repositoryDescriptionQualityIssues(value)) {
          errors.push(`${project.slug}: description quality issue ${issue}`);
        }
      }
    }
  }
  return errors;
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<https?:\/\/[^>]+>/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&(?:[a-z]+|#\d+);/giu, " ")
    .replace(/[*_`~]/gu, "")
    .replace(/^#{1,6}\s*/u, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function markdownBlocks(markdown: string): string[] {
  let normalized = markdown.replace(/\r\n?/gu, "\n").replace(/<!--[\s\S]*?-->/gu, "");
  if (/^---\s*\n/u.test(normalized)) normalized = normalized.replace(/^---\s*\n[\s\S]*?\n---\s*\n/u, "");
  const blocks: string[] = [];
  let current: string[] = [];
  let fenced = false;
  const flush = (): void => {
    const text = cleanInlineMarkdown(current.join(" "));
    if (text) blocks.push(text);
    current = [];
  };

  for (const rawLine of normalized.split("\n")) {
    const trimmed = rawLine.trim();
    if (/^(```|~~~)/u.test(trimmed)) {
      fenced = !fenced;
      flush();
      continue;
    }
    if (fenced) continue;
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^#{1,6}(?:\s+|(?=[\p{L}\p{N}]))/u.test(trimmed) || /^[-=]{3,}$/u.test(trimmed)) {
      flush();
      continue;
    }
    if (/^(?:\.\.\s+)?(?:image|figure|contents)::/iu.test(trimmed)
      || /^:\w[\w-]*:/u.test(trimmed)
      || /^\[[^\]]+\]:\s*https?:\/\//iu.test(trimmed)
      || /^<img\b/iu.test(trimmed)
      || /(?:shields\.io|badge\.svg|badge\?)/iu.test(trimmed)
      || /^\|?\s*:?-{3,}:?/u.test(trimmed)) {
      flush();
      continue;
    }
    const withoutQuote = trimmed.replace(/^>\s*/u, "").replace(/^\[!(?:NOTE|IMPORTANT|WARNING|TIP|CAUTION)\]\s*/iu, "").trim();
    if (!withoutQuote) continue;
    if (withoutQuote.length < 100 && /^(?:table of contents|contents|english|简体中文|中文|website|documentation|docs|discord|community|homepage|changelog|releases?|download|installation|requirements?|quick start|getting started|usage)$/iu.test(withoutQuote.replace(/[:：]$/u, ""))) {
      flush();
      continue;
    }
    current.push(withoutQuote);
  }
  flush();
  return blocks;
}

function descriptionBlockScore(block: string, index: number): number {
  const lower = block.toLowerCase();
  const cjkLength = block.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
  const urls = block.match(/https?:\/\//gu)?.length ?? 0;
  const tableMarks = block.match(/\|/gu)?.length ?? 0;
  const listMarks = block.match(/(?:^|\s)(?:[-+*]|\d+[.)])\s+/gu)?.length ?? 0;
  let score = -index * 0.45;
  if (block.length >= 35 || cjkLength >= 18) score += 3;
  if (block.length >= 60 && block.length <= 700) score += 2;
  if (/\b(?:this (?:repository|project|package)|(?:ros )?node that|is an?|provides?|contains?|implements?|aims? to)\b/u.test(lower)) score += 8;
  if (/\b(?:framework|library|platform|robot|simulator|driver|tool)\b/u.test(lower)) score += 2;
  if (/(?:机器人|機器人|项目|專案|系统|系統|平台|框架|库|設計|设计|实现|實現|用于|用於|基于|基於)/u.test(block)) score += 7;
  if (/^(?:copyright|spdx-|licensed under|the license|apache license|mit license)/iu.test(block)) score -= 20;
  if (/\b(?:table of contents|installation|requirements?|getting started|quick start|usage|contributing|build status)\b/u.test(lower)) score -= 10;
  if (/\b(?:please install|should clone|clone the .{0,30}repository|sudo\s+(?:apt|pip)|pip install|npm install|git clone|navigate to|select the|run the following|execute (?:this|the)|tested on ubuntu|add package)\b/u.test(lower)) score -= 14;
  if (/^(?:optional )?(?:launch )?parameters?:|^(?:\/|\.\/)?[\w.-]+\s+-\s+contains\b/iu.test(block)) score -= 12;
  if (/^(?:note|important|warning|news|update)\b/iu.test(block)) score -= 5;
  if (tableMarks >= 4 || /^\+[-+]{8,}/u.test(block)) score -= 20;
  if (listMarks >= 4) score -= 10;
  score -= urls * 4;
  if (block.length > 1_000) score -= 8;
  if (block.length < 35 && cjkLength < 18) score -= 8;
  return score;
}

function clampProse(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/gu, " ").trim();
  if (clean.length <= maxLength) return clean;
  const slice = clean.slice(0, maxLength + 1);
  const punctuation = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("。"), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  const cut = punctuation >= Math.floor(maxLength * 0.55) ? punctuation + 1 : slice.lastIndexOf(" ");
  return `${slice.slice(0, cut > 0 ? cut : maxLength).trim()}…`;
}

export function extractRepositoryDescription(markdown: string): string {
  const blocks = markdownBlocks(markdown).slice(0, 24);
  if (blocks.length === 0) return "";
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  blocks.forEach((block, index) => {
    const score = descriptionBlockScore(block, index);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  if (bestScore < 0) return "";
  return clampProse(blocks[bestIndex], 1_200);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#(\d+);/gu, (_match, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&(?:apos|#39);/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

export function normalizeVerifiedDocumentText(value: string, format: ReviewedDocumentFormat): string {
  const text = format === "html"
    ? value
      .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
      .replace(/<style\b[\s\S]*?<\/style>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
    : value;
  return decodeHtmlEntities(text).replace(/\s+/gu, " ").trim();
}

export function verifiedDocumentDescriptionMatches(
  sourceText: string,
  format: ReviewedDocumentFormat,
  extraction: ReviewedDocumentDescriptionExtraction,
  description: string,
): boolean {
  if (extraction === "repository-description") return extractRepositoryDescription(sourceText) === description;
  const normalizedSource = normalizeVerifiedDocumentText(sourceText, format);
  const normalizedDescription = description.replace(/\s+/gu, " ").trim();
  return normalizedDescription.length > 0 && normalizedSource.includes(normalizedDescription);
}

export function summarizeRepositoryText(value: string): string {
  const clean = cleanInlineMarkdown(value);
  const candidates = clean.split(/(?<=[.!?。！？])\s*/u).map((sentence) => sentence.trim()).filter(Boolean);
  for (const sentence of candidates) {
    const cjkLength = sentence.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
    if (sentence.length < 30 && cjkLength < 18) continue;
    if (/(?:star\s*求|求求|click here|table of contents|badge|build status)/iu.test(sentence)) continue;
    return clampProse(sentence, 280);
  }
  return clampProse(clean, 280);
}

export function reviewedRepositoryMetadataEvidenceId(wave: string, slug: string, field: ReviewedMetadataField): string {
  return stableId("evidence", `${wave}:${slug}:${field}`);
}

export function reviewedRepositoryMetadataClaimId(wave: string, slug: string, field: ReviewedMetadataField): string {
  return stableId("eclaim", `${wave}:${slug}:${field}`);
}

export function serializeReviewedRepositoryMetadataRpps(input: Record<string, unknown>): string {
  const validation = validateRpps(input);
  if ("errors" in validation) throw new Error(`Generated repository metadata RPPS failed validation: ${validation.errors.join("; ")}`);
  // RPPS packages in production carry reviewed extension fields. Validation must
  // not strip them when serializing the source-backed update.
  return JSON.stringify(input);
}

export function serializeReviewedRepositoryMetadataRppsPreservingLegacy(
  original: Record<string, unknown>,
  next: Record<string, unknown>,
): string {
  const nextValidation = validateRpps(next);
  if (!("errors" in nextValidation)) return JSON.stringify(next);
  const originalValidation = validateRpps(original);
  if (!("errors" in originalValidation)) {
    throw new Error(`Generated repository metadata RPPS failed validation: ${nextValidation.errors.join("; ")}`);
  }
  const originalErrors = new Set(originalValidation.errors);
  const newErrors = nextValidation.errors.filter((error) => !originalErrors.has(error));
  if (newErrors.length) throw new Error(`Generated repository metadata RPPS introduced validation errors: ${newErrors.join("; ")}`);
  return JSON.stringify(next);
}

function sourcePresentation(
  definition: ReviewedRepositoryMetadataDefinition,
  field: ReviewedMetadataField,
  source: ReviewedRepositoryMetadataSource,
): Omit<PreparedRepositoryMetadataEvidence, "field" | "value" | "source" | "evidenceId" | "claimId"> {
  const label = field === "license_spdx" ? "license status" : field;
  const contentHash = source.sha256 ? `sha256:${source.sha256}` : null;
  switch (source.derivation) {
    case "readme-summary":
    case "readme-description":
      return {
        sourceType: "repo",
        title: `${definition.name} pinned README ${label}`,
        publisher: "github.com",
        confidence: 0.98,
        contentHash,
        excerpt: `Reviewed ${label} derived from ${source.path} at pinned revision ${definition.revision}.`,
      };
    case "github-repository-description":
      return {
        sourceType: "repo",
        title: `${definition.name} GitHub repository description`,
        publisher: "github.com",
        confidence: 0.96,
        contentHash,
        excerpt: "Reviewed description matches the GitHub repository description and pinned project identity.",
      };
    case "verified-document-description":
      return {
        sourceType: source.document_format === "markdown" ? "repo" : "docs",
        title: `${definition.name} immutable reviewed description source`,
        publisher: new URL(source.source_url).hostname,
        confidence: 0.98,
        contentHash,
        excerpt: source.description_extraction === "repository-description"
          ? "Reviewed description was deterministically extracted from an immutable source document."
          : "Reviewed description is an exact prose excerpt from an immutable source document.",
      };
    case "github-license-file":
      return {
        sourceType: "repo",
        title: `${definition.name} pinned license detection`,
        publisher: "github.com",
        confidence: 0.99,
        contentHash,
        excerpt: `GitHub license detection for ${source.path} at pinned revision ${definition.revision} returned ${source.spdx_id}.`,
      };
    case "github-license-absence":
      return {
        sourceType: "repo",
        title: `${definition.name} pinned license absence`,
        publisher: "github.com",
        confidence: 0.97,
        contentHash: null,
        excerpt: `GitHub exposed no detectable license file at pinned revision ${definition.revision}; status recorded as NOASSERTION.`,
      };
    case "commercial-catalog-status":
      return {
        sourceType: "docs",
        title: `${definition.name} commercial license status`,
        publisher: new URL(source.source_url).hostname,
        confidence: 0.99,
        contentHash: null,
        excerpt: "Commercial showcase has no public repository or open-source license artifact; status recorded as NOASSERTION.",
      };
  }
}

export function prepareRepositoryMetadataEvidence(
  wave: string,
  definition: ReviewedRepositoryMetadataDefinition,
): PreparedRepositoryMetadataEvidence[] {
  return FIELDS.filter((field) => Object.hasOwn(definition.updates, field)).map((field) => {
    const value = definition.updates[field]!;
    const source = definition.sources[field]!;
    return {
      field,
      value,
      source,
      evidenceId: reviewedRepositoryMetadataEvidenceId(wave, definition.slug, field),
      claimId: reviewedRepositoryMetadataClaimId(wave, definition.slug, field),
      ...sourcePresentation(definition, field, source),
    };
  });
}

function originalGuard(project: PreparedReviewedRepositoryMetadata): string {
  const { row } = project;
  return `p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.name = ${sqlString(row.name)} AND p.project_kind = ${sqlString(row.project_kind)} AND p.repository_url IS ${sqlString(row.repository_url)} AND p.revision IS ${sqlString(row.revision)} AND ${targetColumnConditions(project, "original", "p")} AND p.visibility = 'public' AND p.status = 'published' AND p.current_version_id = ${sqlString(row.current_version_id)} AND p.updated_at = ${sqlString(row.updated_at)} AND pv.id = p.current_version_id AND pv.project_id = p.id`;
}

function targetFields(project: PreparedReviewedRepositoryMetadata): ReviewedMetadataField[] {
  return FIELDS.filter((field) => Object.hasOwn(project.definition.updates, field));
}

function columnName(field: ReviewedMetadataField): string {
  return field === "license_spdx" ? "license_spdx" : field;
}

function rppsJsonPath(field: ReviewedMetadataField): string {
  return field === "license_spdx" ? "$.license" : `$.${field}`;
}

function originalValue(project: PreparedReviewedRepositoryMetadata, field: ReviewedMetadataField): string | null {
  return field === "license_spdx" ? project.row.license_spdx : project.row[field];
}

function nextValue(project: PreparedReviewedRepositoryMetadata, field: ReviewedMetadataField): string | null {
  if (field === "summary") return project.nextSummary;
  if (field === "description") return project.nextDescription;
  return project.nextLicenseSpdx;
}

function targetColumnConditions(
  project: PreparedReviewedRepositoryMetadata,
  state: "original" | "next" | "original-or-next",
  alias = "p",
): string {
  return targetFields(project).map((field) => {
    const column = alias ? `${alias}.${columnName(field)}` : columnName(field);
    const original = originalValue(project, field);
    const next = nextValue(project, field);
    return state === "original-or-next" ? originalOrNext(column, original, next) : `${column} IS ${sqlString(state === "original" ? original : next)}`;
  }).join(" AND ");
}

function targetRppsConditions(project: PreparedReviewedRepositoryMetadata, state: "original" | "next", alias = "pv"): string {
  const column = alias ? `${alias}.rpps_json` : "rpps_json";
  return targetFields(project).map((field) => `json_extract(${column}, ${sqlString(rppsJsonPath(field))}) IS ${sqlString(state === "original" ? originalValue(project, field) : nextValue(project, field))}`).join(" AND ");
}

function targetSetClauses(project: PreparedReviewedRepositoryMetadata, state: "original" | "next"): string {
  return targetFields(project).map((field) => `${columnName(field)} = ${sqlString(state === "original" ? originalValue(project, field) : nextValue(project, field))}`).join(", ");
}

function evidenceExists(project: PreparedReviewedRepositoryMetadata, evidence: PreparedRepositoryMetadataEvidence): string {
  return `EXISTS (SELECT 1 FROM evidence e JOIN evidence_claims ec ON ec.evidence_id = e.id WHERE e.id = ${sqlString(evidence.evidenceId)} AND e.source_url = ${sqlString(evidence.source.source_url)} AND e.content_hash IS ${sqlString(evidence.contentHash)} AND ec.id = ${sqlString(evidence.claimId)} AND ec.entity_type = 'project' AND ec.entity_id = ${sqlString(project.row.id)} AND ec.claim_key = ${sqlString(`${evidence.field}.source`)} AND ec.claim_value = ${sqlString(evidence.value)})`;
}

export function buildReviewedRepositoryMetadataForwardSql(
  projects: PreparedReviewedRepositoryMetadata[],
  wave: ReviewedRepositoryMetadataWave,
  now: string,
): string {
  const lines = [`-- Guarded source-backed repository metadata wave ${wave.wave}.`];
  for (const project of projects) {
    const guard = originalGuard(project);
    for (const evidence of project.evidence) {
      lines.push(`INSERT INTO evidence (id, source_type, source_url, title, publisher, retrieved_at, confidence, content_hash, excerpt, is_demo, created_at)
SELECT ${sqlString(evidence.evidenceId)}, ${sqlString(evidence.sourceType)}, ${sqlString(evidence.source.source_url)}, ${sqlString(evidence.title)}, ${sqlString(evidence.publisher)}, ${sqlString(wave.reviewed_at)}, ${evidence.confidence}, ${sqlString(evidence.contentHash)}, ${sqlString(evidence.excerpt)}, 0, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND NOT EXISTS (SELECT 1 FROM evidence existing WHERE existing.id = ${sqlString(evidence.evidenceId)});`);
      lines.push(`INSERT INTO evidence_claims (id, evidence_id, entity_type, entity_id, claim_key, claim_value, confidence, created_at)
SELECT ${sqlString(evidence.claimId)}, ${sqlString(evidence.evidenceId)}, 'project', p.id, ${sqlString(`${evidence.field}.source`)}, ${sqlString(evidence.value)}, ${evidence.confidence}, ${sqlString(now)}
FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
WHERE ${guard} AND EXISTS (SELECT 1 FROM evidence e WHERE e.id = ${sqlString(evidence.evidenceId)} AND e.source_url = ${sqlString(evidence.source.source_url)} AND e.content_hash IS ${sqlString(evidence.contentHash)})
  AND NOT EXISTS (SELECT 1 FROM evidence_claims existing WHERE existing.id = ${sqlString(evidence.claimId)});`);
    }
    const allEvidence = project.evidence.map((evidence) => evidenceExists(project, evidence)).join(" AND ");
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(project.nextRppsJson)}
  WHERE id = ${sqlString(project.row.current_version_id)} AND project_id = ${sqlString(project.row.id)} AND ${targetRppsConditions(project, "original", "")} AND ${allEvidence}
    AND EXISTS (SELECT 1 FROM projects p WHERE p.id = ${sqlString(project.row.id)} AND p.current_version_id = ${sqlString(project.row.current_version_id)} AND p.updated_at = ${sqlString(project.row.updated_at)} AND ${targetColumnConditions(project, "original", "p")});`);
    lines.push(`UPDATE projects SET ${targetSetClauses(project, "next")}, updated_at = ${sqlString(now)}
  WHERE id = ${sqlString(project.row.id)} AND slug = ${sqlString(project.row.slug)} AND name = ${sqlString(project.row.name)} AND project_kind = ${sqlString(project.row.project_kind)} AND repository_url IS ${sqlString(project.row.repository_url)} AND revision IS ${sqlString(project.row.revision)} AND ${targetColumnConditions(project, "original", "")} AND visibility = 'public' AND status = 'published' AND current_version_id = ${sqlString(project.row.current_version_id)} AND updated_at = ${sqlString(project.row.updated_at)}
    AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(project.row.current_version_id)} AND pv.project_id = ${sqlString(project.row.id)} AND ${targetRppsConditions(project, "next", "pv")});`);
  }
  return `${lines.join("\n")}\n`;
}

function originalOrNext(column: string, original: string | null, next: string | null): string {
  return `(${column} IS ${sqlString(original)} OR ${column} IS ${sqlString(next)})`;
}

export function buildReviewedRepositoryMetadataRollbackSql(
  projects: PreparedReviewedRepositoryMetadata[],
  wave: ReviewedRepositoryMetadataWave,
  now: string,
): string {
  const lines = [`-- Guarded rollback for source-backed repository metadata wave ${wave.wave}.`];
  for (const project of [...projects].reverse()) {
    const { row } = project;
    const currentGuard = `EXISTS (SELECT 1 FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.id = ${sqlString(row.id)} AND p.slug = ${sqlString(row.slug)} AND p.current_version_id = ${sqlString(row.current_version_id)} AND ${targetColumnConditions(project, "original-or-next", "p")} AND (p.updated_at = ${sqlString(row.updated_at)} OR p.updated_at = ${sqlString(now)}))`;
    for (const evidence of [...project.evidence].reverse()) {
      lines.push(`DELETE FROM evidence_claims WHERE id = ${sqlString(evidence.claimId)} AND evidence_id = ${sqlString(evidence.evidenceId)} AND entity_type = 'project' AND entity_id = ${sqlString(row.id)} AND created_at = ${sqlString(now)} AND ${currentGuard};`);
      lines.push(`DELETE FROM evidence WHERE id = ${sqlString(evidence.evidenceId)} AND source_url = ${sqlString(evidence.source.source_url)} AND content_hash IS ${sqlString(evidence.contentHash)} AND created_at = ${sqlString(now)} AND NOT EXISTS (SELECT 1 FROM evidence_claims ec WHERE ec.evidence_id = ${sqlString(evidence.evidenceId)}) AND ${currentGuard};`);
    }
    lines.push(`UPDATE project_versions SET rpps_json = ${sqlString(row.rpps_json)} WHERE id = ${sqlString(row.current_version_id)} AND project_id = ${sqlString(row.id)} AND ${targetRppsConditions(project, "next", "")} AND ${currentGuard};`);
    lines.push(`UPDATE projects SET ${targetSetClauses(project, "original")}, updated_at = ${sqlString(row.updated_at)} WHERE id = ${sqlString(row.id)} AND slug = ${sqlString(row.slug)} AND current_version_id = ${sqlString(row.current_version_id)} AND ${targetColumnConditions(project, "next", "")} AND updated_at = ${sqlString(now)} AND EXISTS (SELECT 1 FROM project_versions pv WHERE pv.id = ${sqlString(row.current_version_id)} AND pv.project_id = ${sqlString(row.id)} AND ${targetRppsConditions(project, "original", "pv")});`);
  }
  return `${lines.join("\n")}\n`;
}
