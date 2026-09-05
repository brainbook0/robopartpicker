#!/usr/bin/env tsx
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { officialActivityValue, parseOfficialPageMetadata, parseOfficialReaderMetadata, type OfficialPageMetadata } from "../src/lib/commercial-source-metadata";
import { applyCommercialIdentityOverride } from "../src/lib/commercial-identity";

type Candidate = { slug: string; name: string; manufacturer: string; model: string; category: string; officialProductUrl: string; officialDocsUrl?: string; lifecycle: string; retrievedAt: string; aliases: string[]; kind: "complete_robot"; sourceAvailability: "closed_source" };

async function collect(candidate: Candidate, capturedAt: string) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000);
  let html = ""; let response: Response | null = null; let error: string | null = null;
  try {
    response = await fetch(candidate.officialProductUrl, { redirect: "follow", signal: controller.signal, headers: { "User-Agent": "RoboPartPickerEvidenceCollector/1.0 (+https://robopartpicker.com/about)", Accept: "text/html,application/xhtml+xml" } });
    if (response.ok) html = (await response.text()).slice(0, 2_000_000); else error = `HTTP ${response.status}`;
  } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  finally { clearTimeout(timeout); }
  const directMetadata = response?.ok ? parseOfficialPageMetadata(html, response.url || candidate.officialProductUrl, response.headers.get("last-modified")) : { description: null, imageUrl: null, activityDate: null };
  const readerMetadata = !response?.ok || !directMetadata.description || !directMetadata.imageUrl
    ? await collectReaderMetadata(candidate.officialProductUrl)
    : null;
  const metadata = {
    description: directMetadata.description ?? readerMetadata?.description ?? null,
    imageUrl: directMetadata.imageUrl ?? readerMetadata?.imageUrl ?? null,
    activityDate: directMetadata.activityDate ?? readerMetadata?.activityDate ?? null,
  };
  const sourceOk = Boolean(response?.ok || readerMetadata);
  if (!response?.ok && readerMetadata) error = null;
  const officialActivity = officialActivityValue(metadata.activityDate, capturedAt, Boolean(sourceOk && candidate.lifecycle === "official_catalog_listing"));
  const identityDescription = `${candidate.manufacturer} ${candidate.model} is a complete closed-source ${candidate.category} robot listed on the manufacturer's model-specific official product page. Public design files, a reproducible BOM, assembly instructions, and build rights are not represented unless separately published by the manufacturer.`;
  return {
    candidate,
    fetch: { ok: sourceOk, httpStatus: response?.status ?? null, finalUrl: response?.url ?? candidate.officialProductUrl, transport: response?.ok ? "direct" : readerMetadata ? "official_reader" : "failed", error },
    metadata,
    profileDraft: {
      description: metadata.description ? `${metadata.description} ${identityDescription}`.slice(0, 4000) : identityDescription,
      useCases: [`Manufacturer-listed complete ${candidate.category} robot`],
      specs: [{ key: "core-technical-specifications", label: "Core technical specifications", undisclosed: true, sourceUrl: candidate.officialProductUrl, observedAt: candidate.retrievedAt, confidence: 0.5 }],
      price: { kind: "not_published", confidence: sourceOk ? 0.9 : 0.5, methodVersion: "official-page-price-status-v1", valuedAt: capturedAt, sourceUrls: [candidate.officialProductUrl], summary: "No source-backed price is recorded for this model." },
      evidence: [{ title: `Official ${candidate.manufacturer} ${candidate.model} product page`, sourceType: "official_product_page", sourceUrl: candidate.officialProductUrl, retrievedAt: candidate.retrievedAt, confidence: sourceOk ? 0.9 : 0.5 }],
      media: metadata.imageUrl ? [{ kind: "product_image", sourceUrl: metadata.imageUrl, retrievedAt: capturedAt, title: `Official product image for ${candidate.name}`, altText: `${candidate.manufacturer} ${candidate.model} product image`, attribution: candidate.manufacturer }] : [],
    },
    officialActivitySource: { candidateKey: candidate.slug, signal: "officialActivity", value: officialActivity, status: officialActivity == null ? (sourceOk ? "missing" : "blocked") : "ok", collectedAt: capturedAt, sourceUrl: candidate.officialProductUrl },
  };
}

async function collectReaderMetadata(sourceUrl: string): Promise<OfficialPageMetadata | null> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://r.jina.ai/${sourceUrl}`, { headers: { accept: "text/markdown", "user-agent": "RoboPartPickerEvidenceCollector/1.0 (+https://robopartpicker.com/about)" }, signal: AbortSignal.timeout(60_000) });
      const markdown = await response.text();
      if (response.status === 429 && attempt < 4) { await new Promise((resolve) => setTimeout(resolve, attempt * 8_000)); continue; }
      if (!response.ok || markdown.length < 500) return null;
      const metadata = parseOfficialReaderMetadata(markdown, sourceUrl);
      return metadata.description || metadata.imageUrl ? metadata : null;
    } catch {
      if (attempt === 4) return null;
    }
  }
  return null;
}

function loadCandidates(directory: string): Candidate[] { return readdirSync(directory).filter((name) => name.endsWith(".json")).sort().flatMap((name) => JSON.parse(readFileSync(resolve(directory, name), "utf8")) as Candidate[]).map(applyCommercialIdentityOverride); }
function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }

async function main(): Promise<void> {
  const directory = resolve(argument("--dir") ?? "data/commercial-catalog/candidates");
  const outputPath = resolve(argument("--output") ?? "data/commercial-catalog/collected/official-pages.json");
  const capturedAt = argument("--captured-at") ?? new Date().toISOString();
  const candidates = loadCandidates(directory); const results: unknown[] = [];
  const concurrency = Math.min(12, Math.max(1, Number(argument("--concurrency") ?? 4)));
  const reusable = argument("--reuse-existing") ? reusableResults(outputPath) : new Map<string, unknown>();
  const pending = candidates.filter((candidate) => {
    const prior = reusable.get(candidate.slug) as { candidate?: { officialProductUrl?: string }; fetch?: { ok?: boolean } } | undefined;
    if (prior?.fetch?.ok && prior.candidate?.officialProductUrl === candidate.officialProductUrl) { results.push(prior); return false; }
    return true;
  });
  for (let start = 0; start < pending.length; start += concurrency) {
    results.push(...await Promise.all(pending.slice(start, start + concurrency).map((candidate) => collect(candidate, capturedAt))));
    process.stderr.write(`official pages ${Math.min(start + concurrency, pending.length)}/${pending.length} pending (${results.length}/${candidates.length} total)\n`);
  }
  results.sort((left, right) => String((left as { candidate?: { slug?: string } }).candidate?.slug ?? "").localeCompare(String((right as { candidate?: { slug?: string } }).candidate?.slug ?? "")));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({ capturedAt, candidates: candidates.length, results }, null, 2)}\n`);
  const typed = results as Array<{ fetch: { ok: boolean }; metadata: OfficialPageMetadata }>;
  console.log(JSON.stringify({ output: outputPath, candidates: candidates.length, fetched: typed.filter((item) => item.fetch.ok).length, descriptions: typed.filter((item) => item.metadata.description).length, images: typed.filter((item) => item.metadata.imageUrl).length, activityDates: typed.filter((item) => item.metadata.activityDate).length }));
}

function reusableResults(path: string): Map<string, unknown> {
  try {
    const payload = JSON.parse(readFileSync(path, "utf8")) as { results?: Array<{ candidate?: { slug?: string } }> };
    return new Map((payload.results ?? []).flatMap((result) => result.candidate?.slug ? [[result.candidate.slug, result] as const] : []));
  } catch { return new Map(); }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
if (invoked === fileURLToPath(import.meta.url)) void main().catch((error) => { console.error(error); process.exitCode = 1; });
