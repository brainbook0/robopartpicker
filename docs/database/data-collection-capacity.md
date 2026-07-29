# Data-collection D1 capacity

This report is an engineering envelope, not a traffic forecast or permission to enable live collection. It measures migration `0015` with deterministic local fixtures and keeps the original 400 MiB per-database design cap.

## Decision

- The five-source pilot fits one D1 database with conservative headroom.
- The bounded expansion envelope does **not** fit one 400 MiB database. It must be partitioned by stable `source_id` hash across seven databases before activation.
- Expansion also exceeds the Workers Free daily write allowance before index amplification. It remains disabled until a separate paid-capacity decision is recorded. Storage sharding is not permission to spend.
- Large source bodies stay in R2 or at their immutable external location. D1 stores bounded provenance metadata, claims, observations, and review state.

Cloudflare documents horizontal scale-out across multiple D1 databases, includes 5 GB total D1 storage on Workers Free, and counts index writes in billed row writes. Workers Free retains a 500 MB per-database limit and up to ten databases; RoboPartPicker uses the stricter 400 MiB design cap to preserve headroom.

## Fixture and measurements

One logical record contains one import job, one import record, one collection job, two snapshot metadata rows, twenty field claims, ten temporal observations, one conflict, two missing-information rows, one budget entry, and one lifecycle event. The scaled fixture therefore matches the declared `20 claims`, `10 observations`, `2 snapshots`, `1 conflict/review`, and `2 missing-information` ratios per import record.

Measurements were taken from the local D1 SQLite backing file after a clean 15-migration reset. `PRAGMA page_count * PRAGMA page_size` was read directly from that local file because D1's Worker SQL authorization layer rejects storage PRAGMAs.

The baseline measurement is reproducible after `npm run db:reset` with the following read-only command from the repository root. Pilot and expansion stages use the same transaction shapes and ratios implemented in `tests/worker/data-collection-capacity.test.ts`; the measurement transaction inserts those fixtures into local-only `.wrangler` state before repeating this command.

```powershell
@'
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = readdirSync(directory).find((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
if (!file) throw new Error("Local D1 SQLite file not found");
const database = new DatabaseSync(`${directory}/${file}`, { readOnly: true });
const pageCount = Number(database.prepare("PRAGMA page_count").get().page_count);
const pageSize = Number(database.prepare("PRAGMA page_size").get().page_size);
console.log(JSON.stringify({ page_count: pageCount, page_size: pageSize, bytes: pageCount * pageSize }));
database.close();
'@ | node --input-type=module -
```

| Stage | Pages | Page size | Database bytes | Increment |
| --- | ---: | ---: | ---: | ---: |
| Empty 15-migration schema | 643 | 4,096 | 2,633,728 | — |
| Five-source / five-record pilot sample | 658 | 4,096 | 2,695,168 | 61,440 |
| Fifty-source / 100-record expansion sample | 1,069 | 4,096 | 4,378,624 | 1,744,896 |

The test also computes bounded row payload with `length(quote(column))`, adds 48 bytes of row overhead, and reserves a conservative second byte for indexes and WAL per measured payload byte.

| Table | Sample rows | Average bounded row bytes | Explicit indexes |
| --- | ---: | ---: | ---: |
| `collection_jobs` | 100 | 338.1 | 4 |
| `source_snapshots` | 200 | 464.8 | 3 |
| `field_claims` | 2,000 | 290.1 | 3 |
| `temporal_observations` | 1,000 | 290.2 | 2 |
| `claim_conflict_sets` | 100 | 218.5 | 2 |
| `collection_missing_information` | 200 | 230.0 | 2 |
| `collection_budget_ledger` | 100 | 281.6 | 3 |
| `collection_lifecycle_events` | 100 | 265.4 | 3 |

## Projections and gates

| Envelope | Conservative projected bytes | Result |
| --- | ---: | --- |
| Pilot, 5,000 logical records on one database | 124,813,728 | Pass |
| Bounded expansion, 100,000 records on one database | 2,446,233,728 | Fail closed |
| Largest of seven deterministic source shards | 351,726,424 | Pass per shard |

The seven-shard projection leaves 67,703,976 bytes (16.1%) below the 400 MiB design cap on the largest shard. Actual sample page growth is lower than the conservative model, but capacity decisions use the conservative value.

A logical record creates 40 base-table rows before index amplification. At 100,000 records per 30-day month, the lower bound is 133,334 writes per day, already above the 100,000 Workers Free allowance. Consequently:

1. The production pilot may run only under its source, budget, and review gates.
2. Expansion must not be enabled merely because a shard has storage headroom.
3. Provisioning expansion shards, changing bindings, or moving to paid capacity requires a separate approved rollout unit with preview rehearsal and recovery checkpoints.
4. A shard approaching 400 MiB stops scheduling new work; it is never allowed to borrow another shard's budget implicitly.

## Query and invocation bounds

`tests/worker/data-collection-capacity.test.ts` proves indexed `SEARCH` plans, with no unbounded high-cardinality scan, for:

1. due collection work;
2. expired leases;
3. budget projection;
4. snapshot lineage;
5. field claims;
6. latest observations;
7. open conflicts; and
8. pending review.

Collector/import batches remain capped at 100 records, and Worker orchestration must stay at or below 50 D1 queries per invocation. The schema rejects bounded JSON values above 131,072 bytes; larger source material belongs in R2.

References:

- <https://developers.cloudflare.com/d1/platform/pricing/>
- <https://developers.cloudflare.com/d1/reference/faq/>
- <https://developers.cloudflare.com/d1/platform/release-notes/>
