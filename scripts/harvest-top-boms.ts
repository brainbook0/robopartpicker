/**
 * Run the app's real per-repo analyzer over the top (by stars) projects.
 * Avoids the GitHub REST API quota entirely:
 *   - list the tree via a shallow blob:none git clone (github smart protocol, not the API)
 *   - fetch only the relevant small files via raw.githubusercontent.com (no quota)
 *   - run the analyzer's own analyzeFileSet("github", ...) on those bytes (pure, no D1/R2)
 * Writes an analysis JSON per repo and a harvest-summary index. Mutation is a separate step.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { analyzeFileSet, artifactKind, isProjectMetadata, type InputFile } from "../worker/services/project-import";

const exec = promisify(execFile);
const PAR = Number(process.env.PAR || "10");
const OUT = process.env.OUT || "../.ingest/bom-harvest-2026-08-12";
const SCRATCH = process.env.SCRATCH || "/root/.agent-reach/bom-harvest-scratch";
const MAX_FETCH = 24;           // mirror the analyzer's github limit
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_FILE = 256 * 1024;
mkdirSync(OUT, { recursive: true });

async function run(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await exec(cmd, args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

function parseRepoUrl(url: string): { owner: string; repo: string } {
  const m = url.replace(/\/+$/, "").match(/github\.com[:/]([^/]+)\/([^/#?]+)/i);
  if (!m) throw new Error("bad repo url " + url);
  return { owner: m[1], repo: m[2].replace(/\.git$/i, "") };
}

async function listTree(cloneDir: string, url: string, revision?: string): Promise<{ paths: string[]; resolvedRevision: string }> {
  if (!existsSync(cloneDir)) {
    await run("git", ["-c", "protocol.version=2", "clone", "--depth", "1",
      "--filter=blob:none", "--no-checkout", "--single-branch", url, cloneDir]);
  }
  if (revision) await run("git", ["-C", cloneDir, "fetch", "--depth", "1", "origin", revision]);
  const ref = revision || "HEAD";
  const resolvedRevision = (await run("git", ["-C", cloneDir, "rev-parse", ref])).trim();
  if (revision && resolvedRevision.toLowerCase() !== revision.toLowerCase()) {
    throw new Error(`revision mismatch for ${url}: ${resolvedRevision} != ${revision}`);
  }
  const out = await run("git", ["-C", cloneDir, "ls-tree", "-r", "--name-only", resolvedRevision]);
  return { paths: out.split("\n").filter((l) => l.length), resolvedRevision };
}

async function fetchBlob(cloneDir: string, revision: string, path: string): Promise<Uint8Array> {
  // Lazy blob fetch via git's smart protocol (no raw.githubusercontent / API rate limits).
  const { stdout } = await exec("git", ["-C", cloneDir, "show", `${revision}:${path}`],
    { encoding: "buffer" as const, maxBuffer: 16 * 1024 * 1024 });
  return new Uint8Array(stdout as unknown as Buffer);
}

async function analyzeRepo(row: { slug: string; repository_url: string; stars: number; revision?: string }): Promise<any> {
  const { repository_url: url } = row;
  const { owner, repo } = parseRepoUrl(url);
  const label = `${owner}/${repo}`;
  const cloneDir = join(SCRATCH, `${row.slug}-${owner}-${repo}`.replace(/[^A-Za-z0-9_.-]/g, "_"));
  try {
    const { paths, resolvedRevision } = await listTree(cloneDir, url, row.revision);
    const relevant = paths
      .filter((p) => artifactKind(p) !== "other" || isProjectMetadata(p))
      .sort((a, b) => (artifactKind(b) === "bom" ? 1 : 0) - (artifactKind(a) === "bom" ? 1 : 0))
      .slice(0, 400);
    // fetch bytes
    const files: InputFile[] = [];
    let fetchedBytes = 0;
    let attempted = 0;
    for (const p of relevant) {
      if (files.length >= MAX_FETCH || fetchedBytes >= MAX_BYTES) break;
      attempted += 1;
      try {
        const bytes = await fetchBlob(cloneDir, resolvedRevision, p);
        if (bytes.byteLength > MAX_FILE) continue;
        fetchedBytes += bytes.byteLength;
        files.push({ path: p, sizeBytes: bytes.byteLength, bytes, sourceUrl: `https://github.com/${owner}/${repo}/blob/${resolvedRevision}/${p}`, sourceRevision: resolvedRevision });
      } catch {
        /* skip */
      }
    }
    const analysis = await analyzeFileSet("github", label, files, {
      sourceLabel: label,
      repositoryUrl: url,
      revision: resolvedRevision,
      name: repo,
      owner,
      totalFiles: paths.length,
      truncated: paths.length > 10_000,
      retrieval: { mode: "reference", provider: "github", requestCount: 1 + attempted, attemptedFiles: attempted, mirroredFiles: 0 },
    });
    return { ok: true, slug: row.slug, stars: row.stars, repository_url: url, analysis };
  } catch (e: any) {
    return { ok: false, slug: row.slug, stars: row.stars, repository_url: url, error: String((e && e.message) || e) };
  }
}

async function main() {
  const rows: { slug: string; repository_url: string; stars: number; revision?: string }[] =
    readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const results: any[] = [];
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      const r = await analyzeRepo(row);
      results.push(r);
      if (r.ok) {
        const fc = (r.analysis?.manifest?.components || []).length;
        const mpn = (r.analysis?.manifest?.components || []).filter((c: any) => c.mpn).length;
        console.log(`[${results.length}/${rows.length}] ${r.slug} (${row.stars}) bom=${fc} mpn=${mpn}`);
        writeFileSync(join(OUT, `manifest-${r.slug}.json`), JSON.stringify(r, null, 2));
      } else {
        console.log(`[${results.length}/${rows.length}] ${r.slug} FAIL ${r.error}`);
      }
    }
  }
  await Promise.all(Array.from({ length: PAR }, worker));
  const ok = results.filter((r) => r.ok);
  const okBom = ok.filter((r) => (r.analysis?.manifest?.components || []).length > 0);
  const okMpn = okBom.filter((r) => (r.analysis?.manifest?.components || []).some((c: any) => c.mpn));
  const tot = okBom.reduce((n, r) => n + (r.analysis?.manifest?.components || []).length, 0);
  writeFileSync(join(OUT, "harvest-summary.json"), JSON.stringify(results, null, 2));
  console.log(`\nrows=${rows.length} ok=${ok.length} with_bom=${okBom.length} with_mpn=${okMpn.length} total_components=${tot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
