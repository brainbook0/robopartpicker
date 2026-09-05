#!/usr/bin/env tsx
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseYouTubeSearchHtml, recentVideoViewVelocity, youtubeSearchUrl } from "../src/lib/youtube-velocity";

type Candidate = { slug: string; manufacturer: string; model: string };
type Record = { candidateKey: string; signal: "videoViewVelocity"; value: number | null; status: "ok" | "missing" | "blocked"; collectedAt: string; sourceUrl: string; sampledVideos: number; error?: string };
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function loadCandidates(directory: string): Candidate[] { return readdirSync(directory).filter((name) => name.endsWith(".json")).sort().flatMap((name) => JSON.parse(readFileSync(resolve(directory, name), "utf8")) as Candidate[]); }
async function sleep(ms: number) { await new Promise((done) => setTimeout(done, ms)); }
async function collect(candidate: Candidate, collectedAt: string): Promise<Record> {
  const sourceUrl = youtubeSearchUrl(candidate.manufacturer, candidate.model); let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(sourceUrl, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" } });
      if (response.status === 429 || response.status >= 500) { lastError = `HTTP ${response.status}`; await sleep(attempt * 2_000); continue; }
      if (!response.ok) return { candidateKey: candidate.slug, signal: "videoViewVelocity", value: null, status: "blocked", collectedAt, sourceUrl, sampledVideos: 0, error: `HTTP ${response.status}` };
      const videos = parseYouTubeSearchHtml((await response.text()).slice(0, 3_000_000), 10);
      if (!videos.length) return { candidateKey: candidate.slug, signal: "videoViewVelocity", value: null, status: "missing", collectedAt, sourceUrl, sampledVideos: 0, error: "No parseable video results" };
      return { candidateKey: candidate.slug, signal: "videoViewVelocity", value: recentVideoViewVelocity(videos, 365), status: "ok", collectedAt, sourceUrl, sampledVideos: videos.length };
    } catch (cause) { lastError = cause instanceof Error ? cause.message : String(cause); await sleep(attempt * 2_000); }
    finally { clearTimeout(timeout); }
  }
  return { candidateKey: candidate.slug, signal: "videoViewVelocity", value: null, status: "blocked", collectedAt, sourceUrl, sampledVideos: 0, error: lastError };
}
async function main() {
  const directory = resolve(argument("--dir") ?? "data/commercial-catalog/candidates"); const output = resolve(argument("--output") ?? "data/commercial-catalog/collected/video-signals.json"); const collectedAt = argument("--collected-at") ?? new Date().toISOString();
  const candidates = loadCandidates(directory); const records: Record[] = []; const concurrency = 4;
  for (let index = 0; index < candidates.length; index += concurrency) {
    records.push(...await Promise.all(candidates.slice(index, index + concurrency).map((candidate) => collect(candidate, collectedAt))));
    process.stderr.write(`YouTube ${Math.min(index + concurrency, candidates.length)}/${candidates.length}\n`); await sleep(500);
  }
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify({ collectedAt, methodology: "first-10-unique-public-search-results; sum views/day for results <=365 days old", records }, null, 2)}\n`);
  console.log(JSON.stringify({ output, candidates: candidates.length, ok: records.filter((record) => record.status === "ok").length, blocked: records.filter((record) => record.status === "blocked").length, missing: records.filter((record) => record.status === "missing").length }));
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
