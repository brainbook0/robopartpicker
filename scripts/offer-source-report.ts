#!/usr/bin/env tsx
/**
 * Dry-run supplier offer coverage report for MPN-bearing components.
 *
 * Reads a candidate list (component identities exported read-only from the
 * catalog), resolves each through a supplier source adapter, and emits:
 *   - a human-readable coverage report (stdout + REPORT_*.md)
 *   - a machine-readable first batch (data/offer-source/*-first-batch.json)
 *   - review-only forward/rollback SQL (NOT applied; production writes are
 *     out of scope and never performed here).
 *
 * Every accepted offer is verified against the supplier's own page: exact SKU
 * match and a positive, currency-carrying price. Prices, stock quantities,
 * lead times and matches are never invented.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createWaveshareSource } from "../src/lib/offer-source/waveshare";
import type { ComponentIdentity, OfferObservation, OfferRejectionReason, OfferSourceOutcome } from "../src/lib/offer-source/types";

type Candidate = {
  id: string;
  mpn: string;
  name: string;
  source_url: string | null;
  manufacturer: string;
  supplierId?: string;
};

type CandidateFile = { schema_version: number; generated_at: string; candidates: Candidate[] };

type Args = { input: string; limit: number; concurrency: number };

function parseArgs(argv: string[]): Args {
  const args: Args = { input: "", limit: Number.POSITIVE_INFINITY, concurrency: 6 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    else if (arg === "--limit") args.limit = Number.parseInt(argv[++i], 10);
    else if (arg === "--concurrency") args.concurrency = Number.parseInt(argv[++i], 10);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.input) throw new Error("--input <candidates.json> is required");
  return args;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function isoSoon(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = JSON.parse(readFileSync(resolve(args.input), "utf8")) as CandidateFile;
  const candidates = file.candidates.slice(0, args.limit);
  if (!candidates.length) throw new Error("no candidates to process");
  const source = createWaveshareSource();

  return (async () => {
    const rows = await mapLimit(candidates, args.concurrency, async (candidate): Promise<{ candidate: Candidate; outcome: OfferSourceOutcome }> => {
      const identity: ComponentIdentity = {
        componentId: candidate.id,
        manufacturer: candidate.manufacturer || "",
        manufacturerPartNumber: candidate.mpn,
        name: candidate.name,
        sourceUrl: candidate.source_url,
      };
      const outcome = await source.match(identity);
      return { candidate, outcome };
    });

    const matched = rows.filter((row): row is { candidate: Candidate; outcome: Extract<OfferSourceOutcome, { status: "matched" }> } => row.outcome.status === "matched");
    const rejected = rows.filter((row): row is { candidate: Candidate; outcome: Extract<OfferSourceOutcome, { status: "rejected" }> } => row.outcome.status === "rejected");

    const byReason = new Map<OfferRejectionReason, number>();
    for (const row of rejected) byReason.set(row.outcome.reason, (byReason.get(row.outcome.reason) ?? 0) + 1);

    const observedAt = new Date().toISOString();
    const summaries = matched.map(({ candidate, outcome }) => {
      const observation = outcome.observation;
      const offerId = stableId("offer", `sup-waveshare\0${candidate.id}\0${observation.supplierSku}\0US`);
      return {
        offerId,
        componentId: candidate.id,
        componentMpn: candidate.mpn,
        supplierSku: observation.supplierSku,
        manufacturerPartNumber: observation.manufacturerPartNumber,
        productName: observation.productName,
        productUrl: observation.productUrl,
        currency: observation.currency,
        unitPriceMinor: observation.unitPriceMinor,
        availability: observation.availability,
        observedAt: observation.observedAt,
        sourceSha256: observation.sourceSha256,
      };
    });

    const forwardSql = buildForwardSql(matched, observedAt);
    const rollbackSql = matched.map(({ candidate }) => {
      const sku = candidate.mpn;
      const offerId = stableId("offer", `sup-waveshare\0${candidate.id}\0${sku}\0US`);
      return `DELETE FROM supplier_offers WHERE id = ${sqlString(offerId)} AND component_id = ${sqlString(candidate.id)};`;
    });

    const batch = {
      schema_version: 1,
      generated_at: observedAt,
      supplier: { slug: "waveshare", id: "sup-waveshare", name: "Waveshare" },
      policy: { dry_run: true, production_write: false, deploy: false },
      processed: rows.length,
      matched: matched.length,
      rejected: rejected.length,
      rejected_by_reason: Object.fromEntries([...byReason.entries()].sort()),
      offers: summaries,
    };

    const batchPath = "data/offer-source/2026-08-21-waveshare-first-batch.json";
    writeFileSync(batchPath, `${JSON.stringify(batch, null, 2)}\n`);

    const reportPath = "REPORT_supplier-offer-coverage.md";
    writeFileSync(reportPath, buildReport(batch, candidates.length, forwardSql.length, rollbackSql.length));

    const scratch = process.env.JCODE_SCRATCH_DIR || "/root/.jcode/scratch";
    mkdirSync(scratch, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sqlPath = `${scratch}/waveshare-offers-${stamp}.sql`;
    const rollbackPath = `${scratch}/waveshare-offers-rollback-${stamp}.sql`;
    writeFileSync(sqlPath, forwardSql.join("\n"));
    writeFileSync(rollbackPath, rollbackSql.join("\n"));

    console.log(JSON.stringify({ processed: rows.length, matched: matched.length, rejected: rejected.length, rejected_by_reason: Object.fromEntries(byReason), batchPath, reportPath, sqlPath, rollbackPath }, null, 2));
    console.log("DRY RUN ONLY. No database rows were written; SQL is for review.");
  })().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  });
}

function buildForwardSql(matched: Array<{ candidate: Candidate; outcome: Extract<OfferSourceOutcome, { status: "matched" }> }>, observedAt: string): string[] {
  const lines = [
    `-- ${basename(import.meta.url)} generated ${new Date().toISOString()}`,
    "-- DRY RUN: review only; not applied.",
  ];
  for (const { candidate, outcome } of matched) {
    const observation: OfferObservation = outcome.observation;
    const offerId = stableId("offer", `sup-waveshare\0${candidate.id}\0${observation.supplierSku}\0US`);
    const priceBreaks = JSON.stringify([{ quantity: 1, unitPriceMinor: observation.unitPriceMinor }]);
    lines.push(
      `INSERT INTO supplier_offers (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency, unit_price_minor, minimum_quantity, stock_quantity, lead_time_days, availability, observed_at, expires_at, is_demo, created_at, updated_at, condition, price_breaks, reliability_score, risk_label, freshness_label) VALUES (${sqlString(offerId)}, 'sup-waveshare', ${sqlString(candidate.id)}, ${sqlString(observation.supplierSku)}, ${sqlString(observation.productUrl)}, 'US', ${sqlString(observation.currency)}, ${observation.unitPriceMinor}, 1, NULL, NULL, ${sqlString(observation.availability)}, ${sqlString(observation.observedAt)}, ${sqlString(isoSoon(7))}, 0, ${sqlString(observation.observedAt)}, ${sqlString(observation.observedAt)}, 'new', ${sqlString(priceBreaks)}, NULL, 'exact', 'fresh');`,
    );
  }
  return lines;
}

function buildReport(batch: Record<string, unknown>, totalCandidates: number, statments: number, rollbackStatements: number): string {
  const reasons = batch.rejected_by_reason as Record<string, number>;
  const reasonLines = Object.entries(reasons).map(([reason, count]) => `- ${reason}: ${count}`).join("\n") || "- (none)";
  return `# Supplier offer coverage: Waveshare first batch

Generated: ${batch.generated_at}

## Summary

- Candidates (uncovered MPN-bearing Waveshare components): ${totalCandidates}
- Processed in this batch: ${batch.processed}
- Verified offers (exact SKU + positive price): ${batch.matched}
- Rejected: ${batch.rejected}

## Rejections by reason

${reasonLines}

## Policy

- Dry-run only: no production writes, no deploy.
- Every accepted offer carries supplier (Waveshare), supplier SKU, manufacturer MPN (where published), product URL, region, currency, unit price (minor), availability, observed_at, and a SHA-256 of the retrieved page.
- Stock quantity and lead time are left NULL (never invented).
- Rejected candidates are never partially written.

## Coverage delta

Verified offers materializable from the Waveshare catalog: ${batch.matched} of ${totalCandidates} sampled
(unbounded ceiling ${totalCandidates}; see data/offer-source/2026-08-21-waveshare-candidates.json).

Review SQL emitted for ${statments} INSERT statements with ${rollbackStatements} rollback DELETEs.
`;
}

main();