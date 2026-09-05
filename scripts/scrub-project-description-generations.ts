#!/usr/bin/env tsx
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateGeneratedProjectDescription, type GeneratedProjectDescriptionDraft, type ProjectDescriptionFact } from "../src/shared/generatedProjectDescription";

type GenerationRecord = {
  projectId: string; slug: string; sourceFingerprint: string; modelId: string; promptVersion: string;
  voiceProfile: string; status: "validated" | "rejected"; facts: ProjectDescriptionFact[];
  draft?: GeneratedProjectDescriptionDraft; validation: ReturnType<typeof validateGeneratedProjectDescription>;
  inputTokens?: number; outputTokens?: number; generatedAt: string; error?: string;
};

const args = process.argv.slice(2);
const env = valueAfter("--env");
const apply = args.includes("--apply");
if (!env || !["local", "preview", "production"].includes(env)) throw new Error("Use --env local, preview, or production.");
const inputPath = resolve(`.ingest/project-descriptions/${env}/generations.jsonl`);
const reportPath = resolve(`.ingest/project-descriptions/${env}/scrub-report.json`);
const promptVersion = "project-description/4-natural-public-copy";
const modelId = "deterministic-copy-scrubber-v2";

function main(): void {
  if (!existsSync(inputPath)) throw new Error(`Missing ${inputPath}`);
  const latest = latestRecords();
  const changed: GenerationRecord[] = [];
  const rejected: Array<{ slug: string; errors: string[] }> = [];
  for (const record of latest.values()) {
    const needsVersionedScrub = record.modelId === modelId && record.promptVersion !== promptVersion;
    if (record.status !== "validated" || !record.draft || (!containsInternalCopy(record.draft) && !needsVersionedScrub)) continue;
    let draft = scrubDraft(record.draft);
    let validation = validateGeneratedProjectDescription(draft, record.facts);
    if (!validation.ok) {
      draft = fallbackDraft(record);
      validation = validateGeneratedProjectDescription(draft, record.facts);
    }
    if (!validation.ok) {
      rejected.push({ slug: record.slug, errors: validation.errors });
      continue;
    }
    changed.push({ ...record, modelId, promptVersion, draft, validation, inputTokens: 0, outputTokens: 0, generatedAt: new Date().toISOString(), error: undefined, status: "validated" });
  }
  const report = { schemaVersion: "project-description-copy-scrub/1", environment: env, records: latest.size, changed: changed.length, rejected: rejected.length, rejectedRecords: rejected, mode: apply ? "apply" : "dry-run", outputPath: inputPath };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath }));
  if (!apply) return;
  for (const record of changed) appendFileSync(inputPath, `${JSON.stringify(record)}\n`);
}

function fallbackDraft(record: GenerationRecord): GeneratedProjectDescriptionDraft {
  const usable = record.facts.flatMap((fact) => {
    if (containsInternalText(fact.text)) return [];
    const text = scrubText(fact.text);
    return text.length >= 15 ? [{ text, sourceRefs: [fact.id] }] : [];
  }).slice(0, 8);
  const splitAt = Math.max(1, Math.ceil(usable.length / 2));
  const paragraphs = [{ sentences: usable.slice(0, splitAt) }, { sentences: usable.slice(splitAt) }].filter((paragraph) => paragraph.sentences.length > 0);
  let summary = record.draft ? scrubText(record.draft.summary) : "";
  let summarySourceRefs = record.draft?.summarySourceRefs ?? [];
  if (summary.length < 90 || summary.length > 220 || containsInternalText(summary)) {
    const selected = usable.slice(0, 3);
    summary = selected.map((sentence) => sentence.text).join(" ").slice(0, 220).trim();
    summarySourceRefs = [...new Set(selected.flatMap((sentence) => sentence.sourceRefs))];
  }
  return { summary, summarySourceRefs, paragraphs, omittedFacts: ["Internal revision and integrity identifiers omitted from public copy."] };
}

function scrubDraft(draft: GeneratedProjectDescriptionDraft): GeneratedProjectDescriptionDraft {
  const paragraphs = draft.paragraphs.map((paragraph) => ({
    sentences: paragraph.sentences.flatMap((sentence) => {
      const text = scrubText(sentence.text);
      return text.length >= 15 ? [{ ...sentence, text }] : [];
    }),
  })).filter((paragraph) => paragraph.sentences.length > 0);
  const sentences = paragraphs.flatMap((paragraph) => paragraph.sentences);
  if (paragraphs.length === 1 && sentences.length >= 2) {
    const splitAt = Math.ceil(sentences.length / 2);
    paragraphs.splice(0, 1, { sentences: sentences.slice(0, splitAt) }, { sentences: sentences.slice(splitAt) });
  }
  let summary = scrubText(draft.summary);
  let summarySourceRefs = [...draft.summarySourceRefs];
  if (summary.length < 90 || summary.length > 220 || containsInternalText(summary)) {
    const selected: typeof sentences = [];
    let candidate = "";
    for (const sentence of sentences) {
      const next = [candidate, sentence.text].filter(Boolean).join(" ");
      if (next.length > 220 && candidate.length >= 90) break;
      if (next.length > 220) continue;
      selected.push(sentence);
      candidate = next;
      if (candidate.length >= 120) break;
    }
    if (candidate) {
      summary = candidate;
      summarySourceRefs = [...new Set(selected.flatMap((sentence) => sentence.sourceRefs))];
    }
  }
  return { summary, summarySourceRefs, paragraphs, omittedFacts: [...(draft.omittedFacts ?? []), "Internal revision and integrity identifiers omitted from public copy."] };
}

function scrubText(value: string): string {
  let text = value;
  text = text.replace(/\b(?:the\s+)?source record is catalog-[a-z0-9.-]+\b[.,;:]?/giu, "");
  text = text.replace(/\b(?:at|to|from)\s+(?:the\s+)?pinned\s+(?:source\s+)?revision\s+[0-9a-f]{7,64}\b/giu, "");
  text = text.replace(/\b(?:the\s+)?pinned\s+(?:source\s+)?revision\s+(?:is\s+)?[0-9a-f]{7,64}\b[.,;:]?/giu, "");
  text = text.replace(/\b(?:source\s+)?revision\s+[0-9a-f]{7,64}\b/giu, "the recorded source revision");
  text = text.replace(/\bat\s+(?:(?:the|its|that)\s+)?pinned\s+(?:source\s+)?revision\b/giu, "in the source record");
  text = text.replace(/\b(?:(?:the|its|that)\s+)?pinned\s+(?:source\s+)?revision\b/giu, "source record");
  text = text.replace(/\bpinned\s+project\s+identity\b/giu, "project identity");
  text = text.replace(/\bverified\s+by\s+(?:the\s+)?(?:published\s+|recorded\s+)?sha[- ]?256(?:\s+(?:hash|value|record|digest))?(?:\s+[0-9a-f]{32,64})?\b/giu, "verified against the source record");
  text = text.replace(/\bsha[- ]?256(?:\s+(?:hash|value|record|digest))?(?:\s+[0-9a-f]{32,64})?\b/giu, "source integrity verification");
  text = text.replace(/\b(?:checksum|source fingerprint|internal id)\b(?:\s+[0-9a-f]{32,64})?/giu, "source integrity record");
  text = text.replace(/\b[0-9a-f]{32,64}\b/giu, "");
  text = text.replace(/\s+([,.;:])/gu, "$1").replace(/([,;:]){2,}/gu, "$1").replace(/\s{2,}/gu, " ").trim();
  text = text.replace(/^[-,.;:\s]+|[-,;:\s]+$/gu, "").trim();
  return text;
}

function containsInternalCopy(draft: GeneratedProjectDescriptionDraft): boolean {
  return [draft.summary, ...draft.paragraphs.flatMap((paragraph) => paragraph.sentences.map((sentence) => sentence.text))].some(containsInternalText);
}
function containsInternalText(value: string): boolean { return /\b(?:sha[- ]?256|checksum|source fingerprint|internal id|pinned\s+(?:source\s+)?revision)\b|\b(?:the\s+)?source record is catalog-[a-z0-9.-]+|\b[0-9a-f]{32,64}\b/iu.test(value); }
function latestRecords(): Map<string, GenerationRecord> { const records = new Map<string, GenerationRecord>(); for (const line of readFileSync(inputPath, "utf8").split("\n")) { if (!line.trim()) continue; try { const record = JSON.parse(line) as GenerationRecord; records.set(record.projectId, record); } catch { /* preserve valid checkpoints */ } } return records; }
function valueAfter(flag: string): string | undefined { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }
main();
