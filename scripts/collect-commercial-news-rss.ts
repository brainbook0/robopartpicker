#!/usr/bin/env tsx
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { googleNewsMentionCount, googleNewsQueryUrl } from "../src/lib/google-news";

type Candidate = { slug: string; manufacturer: string; model: string };
type Record = { candidateKey: string; signal: "newsVelocity"; value: number | null; status: "ok" | "missing" | "blocked"; collectedAt: string; sourceUrl: string; error?: string };
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function loadCandidates(directory: string): Candidate[] { return readdirSync(directory).filter((name) => name.endsWith(".json")).sort().flatMap((name) => JSON.parse(readFileSync(resolve(directory, name), "utf8")) as Candidate[]); }
async function sleep(ms: number) { await new Promise((done) => setTimeout(done, ms)); }
async function collect(candidate: Candidate, collectedAt: string): Promise<Record> {
  const sourceUrl = googleNewsQueryUrl(candidate.manufacturer, candidate.model); let error = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(sourceUrl, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; RoboPartPickerEvidenceCollector/1.0; +https://robopartpicker.com/about)", Accept: "application/rss+xml,application/xml,text/xml" } });
      if (response.status === 429 || response.status >= 500) { error = `HTTP ${response.status}`; await sleep(attempt * 1_000); continue; }
      if (!response.ok) return { candidateKey: candidate.slug, signal: "newsVelocity", value: null, status: "blocked", collectedAt, sourceUrl, error: `HTTP ${response.status}` };
      const count = googleNewsMentionCount(await response.text());
      return count == null
        ? { candidateKey: candidate.slug, signal: "newsVelocity", value: null, status: "missing", collectedAt, sourceUrl, error: "Valid RSS channel missing" }
        : { candidateKey: candidate.slug, signal: "newsVelocity", value: count, status: "ok", collectedAt, sourceUrl };
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); await sleep(attempt * 1_000); }
    finally { clearTimeout(timeout); }
  }
  return { candidateKey: candidate.slug, signal: "newsVelocity", value: null, status: "blocked", collectedAt, sourceUrl, error };
}
async function main() {
  const directory = resolve(argument("--dir") ?? "data/commercial-catalog/candidates"); const output = resolve(argument("--output") ?? "data/commercial-catalog/collected/news-signals.json"); const collectedAt = argument("--collected-at") ?? new Date().toISOString();
  const candidates = loadCandidates(directory); const records: Record[] = []; const concurrency = 8;
  mkdirSync(dirname(output), { recursive: true });
  for (let index = 0; index < candidates.length; index += concurrency) {
    records.push(...await Promise.all(candidates.slice(index, index + concurrency).map((candidate) => collect(candidate, collectedAt))));
    records.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));
    writeFileSync(output, `${JSON.stringify({ collectedAt, window: "90d", source: "Google News RSS exact identity query", records }, null, 2)}\n`);
    process.stderr.write(`Google News ${records.length}/${candidates.length}\n`); await sleep(250);
  }
  console.log(JSON.stringify({ output, candidates: candidates.length, ok: records.filter((record) => record.status === "ok").length, blocked: records.filter((record) => record.status === "blocked").length, missing: records.filter((record) => record.status === "missing").length }));
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
