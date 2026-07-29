# Distributor pilot

## State

`distributor_pilot` is the disabled DigiKey candidate. Its persisted policy is
`unreviewed`; the adapter has no live API or catalog acquisition path. The two
synthetic fixtures are executed offline under `approved_fixture_only` and are
not publishable marketplace observations.

## Observation model

Each retrieval emits a distinct append-only offer observation ID containing
the observation timestamp. Price and stock are never updated in place. The
record preserves:

- source supplier and manufacturer identifiers;
- supplier SKU and manufacturer part number;
- original price, stock, and lead-time labels;
- ISO 4217 currency, BCP 47 locale, region, seller, distributor authorization,
  and condition;
- retrieval timestamp, content hash, evidence locators, and source revision.

A delisted fixture emits both its final observation and a v2 withdrawal linked
to the first observed record.

## Budget behavior

The adapter reserves `cloudflare_infra` and `paid_source_api` before reading
the acquisition input. A failed reservation releases any earlier
class-local reservation. Fixture parsing commits zero consumption and records
`ai_token=0`. Budgets never borrow across classes.

The fixture projections are test values, not approved live-source quotas.

## Fixture hashes

| Fixture | SHA-256 |
| --- | --- |
| `offer-2026-07-29.json` | `ace668f066ace156747311b34091a079a767487b3655c956da41d7aaec74a3d6` |
| `offer-2026-07-30-delisted.json` | `433ec40ee8d0a12a5312825a6d0afe0c5f0f6a5485b8bd36195e2c8efb49df6c` |

## Live-source review checklist

- Confirm an approved official API or catalog access method.
- Record robots, terms, reuse, quota, and pricing evidence.
- Set explicit per-run and monthly `paid_source_api` and
  `cloudflare_infra` limits.
- Confirm the contact-bearing user agent and owner approval.
- Append an `approved_live` policy revision, then separately enable the pilot.
- Re-run temporal, delisting, budget-exhaustion, and no-purchase tests.

The adapter cannot purchase, enter checkout, message sellers, or convert
currency.
