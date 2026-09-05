#!/usr/bin/env tsx
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { captureWranglerJson } from "./wrangler-cli";

type EnvName = "production" | "preview";
type Project = { id: string; slug: string; name: string; maintainer: string | null; robot_category: string | null; official_url: string | null };
type SourceRecord = { slug: string; projectId: string; name: string; manufacturer: string | null; category: string | null; sourceUrl: string; readerUrl: string; status: "ok" | "rejected" | "error"; text?: string; contentHash?: string; fetchedAt: string; error?: string };
type WranglerStatement<T> = { results?: T[] };

const args = process.argv.slice(2);
const env = valueAfter("--env") as EnvName | undefined;
const concurrency = Math.min(16, Math.max(1, Number(valueAfter("--concurrency") ?? 8)));
const limit = Math.max(0, Number(valueAfter("--limit") ?? 0));
if (env !== "production" && env !== "preview") throw new Error("Use --env production or --env preview.");
const outputPath = resolve(`.ingest/commercial-product-enrichment/${env}/sources.jsonl`);

async function main(): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });
  const projects = query<Project>(`SELECT p.id,p.slug,p.name,p.maintainer,p.robot_category,coalesce(p.upstream_url,p.repository_url) official_url FROM projects p WHERE p.project_kind='commercial_showcase' AND p.deleted_at IS NULL ORDER BY p.slug`)
    .filter((project) => Boolean(project.official_url))
    .slice(0, limit || undefined);
  const completed = loadCompleted();
  const pending = projects.filter((project) => completed.get(project.slug)?.sourceUrl !== project.official_url || completed.get(project.slug)?.status !== "ok");
  console.log(JSON.stringify({ projects: projects.length, completed: projects.length - pending.length, pending: pending.length, concurrency, outputPath }));
  let cursor = 0;
  let ok = 0;
  let rejected = 0;
  let errors = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= pending.length) return;
      const project = pending[index];
      const record = await fetchProject(project);
      appendFileSync(outputPath, `${JSON.stringify(record)}\n`);
      if (record.status === "ok") ok += 1; else if (record.status === "rejected") rejected += 1; else errors += 1;
      console.log(`[${index + 1}/${pending.length}] ${project.slug}: ${record.status}${record.error ? ` (${record.error})` : ""}`);
    }
  }));
  const latest = loadCompleted();
  const report = { projects: projects.length, fetchedThisRun: pending.length, okThisRun: ok, rejectedThisRun: rejected, errorsThisRun: errors, okTotal: [...latest.values()].filter((row) => row.status === "ok").length, outputPath };
  console.log(JSON.stringify(report, null, 2));
}

async function fetchProject(project: Project): Promise<SourceRecord> {
  const sourceUrl = project.official_url!;
  const readerUrl = `https://r.jina.ai/${sourceUrl}`;
  const base = { slug: project.slug, projectId: project.id, name: project.name, manufacturer: project.maintainer, category: project.robot_category, sourceUrl, readerUrl, fetchedAt: new Date().toISOString() };
  try {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await fetch(readerUrl, { headers: { accept: "text/markdown", "user-agent": "RoboPartPickerCatalogResearch/1.0" }, signal: AbortSignal.timeout(90_000) });
      const raw = await response.text();
      if (response.status === 429 && attempt < 5) {
        const retryAfter = Math.min(60, Math.max(5, Number(response.headers.get("retry-after") ?? 0) || attempt * 10));
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000));
        continue;
      }
      if (!response.ok) return { ...base, status: "error", error: `reader HTTP ${response.status}` };
      const text = normalize(raw).slice(0, 60_000);
      const rejection = rejectReason(text, project);
      if (rejection) return { ...base, status: "rejected", error: rejection };
      return { ...base, status: "ok", text, contentHash: createHash("sha256").update(text).digest("hex") };
    }
    return { ...base, status: "error", error: "reader retry budget exhausted" };
  } catch (cause) {
    return { ...base, status: "error", error: cause instanceof Error ? cause.message : String(cause) };
  }
}

function rejectReason(text: string, project: Project): string | null {
  if (text.length < 700) return `source text too short (${text.length})`;
  if (/\n#\s*404\b|\bpage not found\b|\blooks like you(?:'|’)re lost\b/iu.test(text)) return "official page returned not found";
  const tokens = project.name.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, " ").split(" ").filter((token) => token.length >= 3 && !["robot", "robotics", "series"].includes(token));
  const lower = text.toLocaleLowerCase("en-US");
  if (tokens.length && !tokens.some((token) => lower.includes(token))) return "model identity absent from source text";
  return null;
}

function normalize(value: string): string {
  return value.replace(/\r/gu, "").replace(/[ \t]+\n/gu, "\n").replace(/\n{4,}/gu, "\n\n\n").trim();
}

function loadCompleted(): Map<string, SourceRecord> {
  const records = new Map<string, SourceRecord>();
  if (!existsSync(outputPath)) return records;
  for (const line of readFileSync(outputPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const record = JSON.parse(line) as SourceRecord; records.set(record.slug, record); } catch { /* preserve valid checkpoints */ }
  }
  return records;
}

function query<T>(sql: string): T[] {
  return captureWranglerJson<Array<WranglerStatement<T>>>(["d1", "execute", "DB", "--env", env!, "--remote", "--command", sql]).flatMap((statement) => statement.results ?? []);
}
function valueAfter(flag: string): string | undefined { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exit(1); });
