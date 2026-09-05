#!/usr/bin/env tsx
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { validateGeneratedProjectDescription, type GeneratedProjectDescriptionDraft, type ProjectDescriptionFact } from "../src/shared/generatedProjectDescription";
import { buildDescriptionPublicationSql, buildDescriptionReactivationSql } from "./lib/description-campaign";

const exec = promisify(execFile);
type EnvName = "local" | "preview" | "production";
type RecordRow = {
  projectId: string; slug: string; sourceFingerprint: string; modelId: string; promptVersion: string; voiceProfile: string;
  status: "validated" | "rejected"; facts: ProjectDescriptionFact[]; draft?: GeneratedProjectDescriptionDraft;
  validation: ReturnType<typeof validateGeneratedProjectDescription>; inputTokens?: number; outputTokens?: number;
};
const args = process.argv.slice(2);
const env = valueAfter("--env") as EnvName | undefined;
const apply = args.includes("--apply");
const inputPath = resolve(valueAfter("--input") ?? `.ingest/project-descriptions/${env}/generations.jsonl`);
const slugFilter = new Set((valueAfter("--slugs") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
if (!env || !["local", "preview", "production"].includes(env) || !existsSync(inputPath)) {
  console.error("Usage: tsx scripts/publish-project-descriptions.ts --env local|preview|production [--input file.jsonl] [--slugs a,b] [--apply]");
  process.exit(2);
}

async function main() {
  const latest = latestRecords(inputPath);
  const projects = new Map((await query<{ id: string; current_description_generation_id: string | null }>("SELECT id, current_description_generation_id FROM projects WHERE deleted_at IS NULL AND is_demo = 0")).map((row) => [row.id, row]));
  const columns = await query<{ name: string }>("PRAGMA table_info('project_description_generations')");
  if (!columns.some((column) => column.name === "source_fingerprint")) throw new Error("Migration 0032 must be applied before publishing descriptions.");
  const existing = new Map((await query<{ id: string; project_id: string; source_fingerprint: string; prompt_version: string; voice_profile: string; status: string }>(`SELECT id, project_id, source_fingerprint, prompt_version, voice_profile, status
    FROM project_description_generations`)).map((row) => [key(row.project_id, row.source_fingerprint, row.prompt_version, row.voice_profile), row]));
  const statementGroups: string[][] = [];
  const rejected: Array<{ slug: string; reason: string }> = [];
  let unchanged = 0;
  let reactivated = 0;
  for (const record of latest.values()) {
    if (slugFilter.size && !slugFilter.has(record.slug)) continue;
    if (record.status !== "validated" || !record.draft || !record.validation.ok) { rejected.push({ slug: record.slug, reason: "latest checkpoint is not validated" }); continue; }
    const project = projects.get(record.projectId);
    if (!project) { rejected.push({ slug: record.slug, reason: "project does not exist in target database" }); continue; }
    const validation = validateGeneratedProjectDescription(record.draft, record.facts);
    if (!validation.ok) { rejected.push({ slug: record.slug, reason: validation.errors.join(" | ") }); continue; }
    const generationId = uuidFromHash(`${record.projectId}\u0000${record.sourceFingerprint}\u0000${record.promptVersion}\u0000${record.voiceProfile}`);
    const existingGeneration = existing.get(key(record.projectId, record.sourceFingerprint, record.promptVersion, record.voiceProfile));
    if (existingGeneration) {
      if (existingGeneration.id !== generationId) throw new Error(`Generation identity drift for ${record.slug}.`);
      if (existingGeneration.status === "published") {
        if (project.current_description_generation_id === generationId) unchanged += 1;
        else {
          statementGroups.push(buildDescriptionReactivationSql({ generationId, projectId: record.projectId, now: new Date().toISOString() }));
          reactivated += 1;
        }
        continue;
      }
      if (existingGeneration.status === "superseded") {
        statementGroups.push(buildDescriptionReactivationSql({ generationId, projectId: record.projectId, now: new Date().toISOString() }));
        reactivated += 1;
        continue;
      }
      rejected.push({ slug: record.slug, reason: `matching immutable generation has non-publishable status ${existingGeneration.status}` });
      continue;
    }
    statementGroups.push(buildDescriptionPublicationSql({
      generationId, projectId: record.projectId, sourceFingerprint: record.sourceFingerprint, modelId: record.modelId,
      promptVersion: record.promptVersion, voiceProfile: record.voiceProfile, facts: record.facts,
      summary: validation.summary, description: validation.description, omittedFacts: record.draft.omittedFacts ?? [],
      sentences: validation.sentences, validationReport: { ok: validation.ok, errors: validation.errors, schemaVersion: "generated-description-validation/1" },
      inputTokens: record.inputTokens, outputTokens: record.outputTokens, now: new Date().toISOString(),
    }));
  }
  const waves = packWaves(statementGroups, 400, 1_500_000);
  const root = resolve(`.ingest/project-descriptions/${env}/publication`);
  mkdirSync(root, { recursive: true });
  const files = waves.map((statements, index) => {
    const path = join(root, `wave-${String(index + 1).padStart(3, "0")}.sql`);
    writeFileSync(path, `${statements.join("\n")}\n`);
    return path;
  });
  const report = { schemaVersion: "project-description-publication/1", environment: env, inputPath, records: latest.size, planned: statementGroups.length, reactivated, unchanged, rejected, waves: files };
  writeFileSync(join(root, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ records: latest.size, planned: statementGroups.length, reactivated, unchanged, rejected: rejected.length, waves: files.length, report: join(root, "report.json") }, null, 2));
  if (!apply) { console.log("DRY RUN ONLY. Add --apply after reviewing the report and SQL waves."); return; }
  for (const [index, file] of files.entries()) {
    console.log(`Applying description wave ${index + 1}/${files.length}`);
    await executeFile(file);
  }
  const audit = await query<{ published: number; linked: number }>(`SELECT
    (SELECT COUNT(*) FROM project_description_generations WHERE status = 'published') AS published,
    (SELECT COUNT(*) FROM projects WHERE current_description_generation_id IS NOT NULL) AS linked`);
  console.log(JSON.stringify({ applied: true, audit: audit[0] ?? {} }, null, 2));
}

function latestRecords(path: string): Map<string, RecordRow> {
  const records = new Map<string, RecordRow>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as RecordRow;
    records.set(record.projectId, record);
  }
  return records;
}

async function query<T>(sql: string): Promise<T[]> {
  const command = wranglerArgs(["--json", "--command", sql]);
  const { stdout } = await exec("node_modules/.bin/wrangler", command, { env: process.env, maxBuffer: 128 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as Array<{ results?: T[] }>;
  return parsed.flatMap((page) => page.results ?? []);
}
async function executeFile(path: string) { await exec("node_modules/.bin/wrangler", wranglerArgs(["--file", path]), { env: process.env, maxBuffer: 128 * 1024 * 1024 }); }
function wranglerArgs(tail: string[]): string[] { return env === "local" ? ["d1", "execute", "robopartpicker", "--local", ...tail] : ["d1", "execute", "DB", "--env", env!, "--remote", ...tail]; }
function key(projectId: string, fingerprint: string, prompt: string, voice: string) { return `${projectId}\u0000${fingerprint}\u0000${prompt}\u0000${voice}`; }
function uuidFromHash(value: string): string { const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split(""); hash[12] = "4"; hash[16] = ((Number.parseInt(hash[16], 16) & 3) | 8).toString(16); const text = hash.join(""); return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`; }
function packWaves(groups: string[][], maxStatements: number, maxBytes: number): string[][] { const waves: string[][] = []; let current: string[] = []; let bytes = 0; for (const group of groups) { const size = Buffer.byteLength(group.join("\n")); if (current.length && (current.length + group.length > maxStatements || bytes + size > maxBytes)) { waves.push(current); current = []; bytes = 0; } current.push(...group); bytes += size; } if (current.length) waves.push(current); return waves; }
function valueAfter(flag: string): string | undefined { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exit(1); });
