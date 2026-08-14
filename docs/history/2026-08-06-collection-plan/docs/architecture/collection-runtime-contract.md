# Cloudflare collection runtime contract

## Purpose

This document supplies the concrete binding, state, Queue, lease, evidence, ingestion, and health contracts shared by every Cloudflare-hosted source adapter. It keeps the initial runtime small while giving implementing agents exact interfaces.

The collection runtime is separate from the public Application Worker. The Collection Worker has no canonical D1 binding and no application-file R2 binding.

## Initial deployment units

Only two Worker deployments are required:

1. **Collection Worker**: Cron handlers, Queue producer and consumer, deterministic adapters, Operations D1, private raw-evidence R2, health evaluation, and ingestion submission.
2. **Application Worker**: existing RoboPartPicker application, external ingestion endpoint, staging, review, canonical D1, application R2, and website APIs.

No Durable Object, Workflow, Container, separate server, GitHub Actions scheduler, or AI agent is part of the initial runtime.

## Implementation destination

Target repository: `/home/lenovo/robopartpicker`.

Use the existing npm lockfile and TypeScript toolchain. Add a second Wrangler deployment configuration rather than a separate repository or package manager.

### Collection Worker paths

- `wrangler.collection.jsonc`
- `worker/collection/index.ts`
- `worker/collection/env.ts`
- `worker/collection/runtime/source-registry.ts`
- `worker/collection/runtime/leases.ts`
- `worker/collection/runtime/runs.ts`
- `worker/collection/runtime/incidents.ts`
- `worker/collection/runtime/usage.ts`
- `worker/collection/runtime/health.ts`
- `worker/collection/runtime/alerts.ts`
- `worker/collection/queue/messages.ts`
- `worker/collection/queue/consumer.ts`
- `worker/collection/queue/dead-letter.ts`
- `worker/collection/storage/evidence.ts`
- `worker/collection/ingestion/client.ts`
- `worker/collection/adapters/github/client.ts`
- `worker/collection/adapters/github/adapter.ts`
- `worker/collection/adapters/robotis-emanual-x-series.ts`
- `worker/collection/source-profiles/robotis-emanual.json`
- `migrations/collection/0001_collection_runtime.sql`
- `contracts/collection-queue-message.v1.schema.json`
- `contracts/collection-source-profile.v1.schema.json`
- `contracts/collection-evidence-manifest.v1.schema.json`
- `scripts/validate-collection-contracts.ts`
- `scripts/collection-ops.ts`
- `docs/collection-operations-runbook.md`
- `tests/collection/runtime.test.ts`
- `tests/collection/github-adapter.test.ts`
- `tests/collection/robotis-emanual-x-series.test.ts`
- `tests/collection/fixtures/robotis-emanual-x-series/**`

### Application Worker paths

Application changes for specification promotion are owned by [`component-spec-promotion-contract.md`](component-spec-promotion-contract.md). The Collection Worker implementation must not opportunistically edit those paths.

### Package scripts

Add only these noninteractive scripts to the root `package.json`:

```json
{
  "collection:dev": "wrangler dev --config wrangler.collection.jsonc",
  "collection:deploy:dry-run": "wrangler deploy --dry-run --config wrangler.collection.jsonc",
  "collection:migrate:local": "wrangler d1 migrations apply COLLECTION_OPS --local --config wrangler.collection.jsonc",
  "collection:validate": "tsx scripts/validate-collection-contracts.ts",
  "collection:ops": "tsx scripts/collection-ops.ts",
  "test:collection": "vitest run tests/collection"
}
```

## Environment resource names

| Resource | Preview | Production |
|---|---|---|
| Worker service | `robopartpicker-collection-preview` | `robopartpicker-collection-production` |
| Queue | `rpp-collection-preview` | `rpp-collection` |
| Dead-letter Queue | `rpp-collection-dlq-preview` | `rpp-collection-dlq` |
| Operations D1 | `rpp-collection-ops-preview` | `rpp-collection-ops` |
| Raw R2 | `rpp-collection-raw-preview` | `rpp-collection-raw` |
| Application service binding target | existing preview Application Worker | existing production Application Worker |

Resource IDs never appear in source-controlled planning examples. Wrangler environment configuration binds the names to account resources.

### Wrangler configuration invariants

`wrangler.collection.jsonc` uses the repository-pinned compatibility date unless implementation requires a documented newer date. It has no assets binding and no public custom domain.

| Setting | Preview | Production |
|---|---|---|
| Worker `name` | `robopartpicker-collection-preview` | `robopartpicker-collection-production` |
| `APP_INGEST.service` | `robopartpicker-preview` | `robopartpicker-production` |
| `COLLECTION_SCHEDULE_ENABLED` | `false` | `false` until recorded activation |
| `COLLECTION_MAX_DUE_PER_TICK` | `1` | `1` for pilot |
| Dispatcher Cron | `17 * * * *` | `17 * * * *` |
| Sentinel Cron | `43 * * * *` | `43 * * * *` |
| Queue producer binding | `COLLECTION_QUEUE` | `COLLECTION_QUEUE` |
| Queue consumer binding | environment Queue | environment Queue |
| Dead-letter consumer binding | environment dead-letter Queue | environment dead-letter Queue |
| D1 binding | `COLLECTION_OPS` | `COLLECTION_OPS` |
| R2 binding | `RAW_EVIDENCE` | `RAW_EVIDENCE` |

Cron presence is not activation. Both scheduled handlers fail closed unless `COLLECTION_SCHEDULE_ENABLED` is exactly `true`. The sentinel may be invoked manually in preview while the flag is false, but automated scheduled collection remains off.

## Binding names

### Collection Worker bindings

| Binding | Type | Required use |
|---|---|---|
| `COLLECTION_OPS` | D1 database | Source registry, leases, runs, incidents, health, usage, and checkpoints. |
| `COLLECTION_QUEUE` | Queue producer | Due source-run pointer messages. |
| Collection Queue consumer | Queue consumer | Execute source-run pointer messages. |
| Collection dead-letter consumer | Queue consumer | Mark terminal jobs and open incidents. |
| `RAW_EVIDENCE` | Private R2 bucket | Immutable permitted source blobs and run manifests. |
| `APP_INGEST` | Worker service binding | Call the existing Application Worker ingestion route without public CORS. |
| `BROWSER` | Browser Run binding | Optional. Present only after an approved adapter requires browser execution. |

### Configuration variables

| Name | Kind | Meaning |
|---|---|---|
| `COLLECTION_ENVIRONMENT` | Plain var | `preview` or `production`. |
| `COLLECTION_SCHEDULE_ENABLED` | Plain var | Must equal `true` before the dispatcher enqueues live work. Missing or false means disabled. |
| `COLLECTION_MAX_DUE_PER_TICK` | Plain var | Global dispatcher cap. Hard maximum is 25; preview and first production pilot configure 1. |
| `COLLECTION_INGEST_BASE_URL` | Plain var | Same-origin-shaped internal URL passed to `APP_INGEST.fetch`. It is not an arbitrary host. |
| `GITHUB_APP_ID` | Plain var | Approved GitHub App identifier. |
| `GITHUB_APP_INSTALLATION_ID` | Plain var | Approved installation identifier. |

### Secrets

| Name | Use |
|---|---|
| `GITHUB_APP_PRIVATE_KEY` | Generate short-lived GitHub App installation tokens. |
| `COLLECTION_ALERT_WEBHOOK_URL` | Operator-owned HTTPS incident endpoint. Required before any source is approved live. |
| `COLLECTION_INGEST_TOKEN` | Authenticate the current `POST /api/v1/imports/batches` contract. |

Secrets never enter Operations D1, Queue messages, R2 manifests, fixtures, URLs, or logs.

## GitHub App token lifecycle

1. Create a dedicated GitHub App named for RoboPartPicker collection in the approved organization account.
2. Disable webhook delivery because the pilot polls immutable repository state.
3. Grant repository metadata read and contents read only. Do not grant issues, pull requests, members, administration, actions, secrets, or write permissions.
4. Install the App only on individually approved repositories. Do not select all current and future repositories.
5. Record App ID and installation ID as environment-specific plain Wrangler variables.
6. Generate one private key, add it to the environment with `wrangler secret put GITHUB_APP_PRIVATE_KEY`, and delete any unnecessary local downloaded copy after the secret is verified.
7. Store `COLLECTION_INGEST_TOKEN` and `COLLECTION_ALERT_WEBHOOK_URL` through the same environment-specific Wrangler secret flow. Never reuse production values in preview.
8. At the start of a GitHub-backed source run, create a short-lived App JWT using Web Crypto.
9. Exchange it for one installation access token for the configured installation ID.
10. Keep the installation token only in invocation memory. Do not persist it to D1, R2, Queue, Cache API, logs, or module globals.
11. Reuse the token within that source run while honoring its returned expiration.
12. If the run outlives the token, checkpoint and obtain a new token. Do not refresh through an unbounded loop.
13. Redact authorization headers and provider error bodies before structured logging.
14. A 401 or 403 pauses the source and opens a credential or policy incident.

Preview and production use separate App installations or installation scopes when practical. Production credentials are never used by local fixture tests.

Secret-name setup, performed by the authorized operator after preview resources exist:

```bash
rtk npx wrangler secret put GITHUB_APP_PRIVATE_KEY --env preview --config wrangler.collection.jsonc
rtk npx wrangler secret put COLLECTION_INGEST_TOKEN --env preview --config wrangler.collection.jsonc
rtk npx wrangler secret put COLLECTION_ALERT_WEBHOOK_URL --env preview --config wrangler.collection.jsonc
```

Repeat for production only after preview acceptance and source approval. Secret values never appear in shell history, committed environment files, or CI logs.

## Operations D1 schema

The Operations D1 database is owned by the Collection Worker and migrated separately from canonical application D1.

### `collection_sources`

```sql
CREATE TABLE collection_sources (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  lifecycle_status TEXT NOT NULL CHECK (
    lifecycle_status IN ('candidate', 'approved', 'pilot', 'active', 'paused', 'denied', 'retired')
  ),
  health_status TEXT NOT NULL DEFAULT 'healthy' CHECK (
    health_status IN ('healthy', 'suspect', 'degraded', 'paused', 'denied', 'retired')
  ),
  policy_state TEXT NOT NULL CHECK (
    policy_state IN ('unreviewed', 'review_needed', 'approved_fixture_only', 'approved_live', 'restricted', 'denied')
  ),
  policy_reviewed_at TEXT,
  policy_expires_at TEXT,
  pilot_expires_at TEXT,
  policy_owner TEXT,
  policy_evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(policy_evidence_json)),
  retention_days INTEGER CHECK (retention_days IS NULL OR retention_days >= 0),
  alert_route_id TEXT,
  cadence_seconds INTEGER NOT NULL CHECK (cadence_seconds >= 300),
  next_run_at TEXT,
  last_success_at TEXT,
  last_source_revision TEXT,
  request_budget INTEGER NOT NULL CHECK (request_budget > 0),
  byte_budget INTEGER NOT NULL CHECK (byte_budget > 0),
  browser_seconds_budget INTEGER NOT NULL DEFAULT 0 CHECK (browser_seconds_budget >= 0),
  monthly_cost_budget_microusd INTEGER NOT NULL DEFAULT 0 CHECK (monthly_cost_budget_microusd >= 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_collection_sources_due
  ON collection_sources(enabled, lifecycle_status, health_status, next_run_at);
```

`config_json` contains only validated adapter configuration such as repository identity, branch, path allowlists, locale, field scope, and source-specific thresholds. Credentials are forbidden. Source registration refuses `approved_live` unless policy owner, nonempty policy evidence, retention, alert route, current policy expiry, pilot expiry, cadence, and every budget are present.

The first committed source profile validates against `collection-source-profile.v1` and remains disabled:

```json
{
  "version": 1,
  "sourceId": "src:robotis-emanual",
  "canonicalName": "ROBOTIS e-Manual",
  "adapterId": "robotis-emanual-x-series",
  "adapterVersion": "1.0.0",
  "sourceKind": "manufacturer_repository",
  "enabled": false,
  "lifecycleStatus": "candidate",
  "policy": {
    "state": "review_needed",
    "owner": null,
    "reviewedAt": null,
    "expiresAt": null,
    "pilotExpiresAt": null,
    "evidence": [],
    "retentionDays": null,
    "alertRouteId": null
  },
  "cadenceSeconds": 86400,
  "budgets": {
    "requests": 60,
    "bytes": 10485760,
    "browserSeconds": 0,
    "monthlyMicrousd": 5000000
  },
  "config": {
    "provider": "github",
    "repository": "ROBOTIS-GIT/emanual",
    "repositoryId": null,
    "branch": "master",
    "allowedPaths": [
      "LICENSE.txt",
      "_data/dxl_x_info.yml",
      "_includes/en/dxl/specifications_x.md",
      "docs/en/dxl/x/*.md"
    ],
    "maxPages": 1,
    "maxFiles": 53,
    "maxBlobBytes": 524288,
    "fixtureTransportOnly": true
  }
}
```

`fixtureTransportOnly` is mandatory while policy state is `review_needed`. `repositoryId` remains null in the offline seed and must be pinned from reviewed official GitHub API evidence before any credentialed preview run. Live registration rejects a null repository ID or wildcard paths until the resolved tree count is within the source packet ceiling and the reviewed profile revision is recorded.

### `collection_source_leases`

```sql
CREATE TABLE collection_source_leases (
  source_id TEXT PRIMARY KEY REFERENCES collection_sources(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);
```

Lease acquisition is one atomic statement:

```sql
INSERT INTO collection_source_leases
  (source_id, run_id, acquired_at, expires_at, heartbeat_at)
VALUES (?1, ?2, ?3, ?4, ?3)
ON CONFLICT(source_id) DO UPDATE SET
  run_id = excluded.run_id,
  acquired_at = excluded.acquired_at,
  expires_at = excluded.expires_at,
  heartbeat_at = excluded.heartbeat_at
WHERE collection_source_leases.expires_at <= ?3
RETURNING source_id, run_id, expires_at;
```

No returned row means another unexpired run owns the source. Lease extension and release must compare both `source_id` and `run_id`.

### `collection_runs`

```sql
CREATE TABLE collection_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES collection_sources(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('schedule', 'canary', 'manual', 'replay')),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'unchanged', 'succeeded', 'partial', 'retrying', 'failed', 'dead_lettered', 'cancelled', 'skipped')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  requested_revision TEXT,
  resolved_revision TEXT,
  trace_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  checkpoint_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(checkpoint_json)),
  metrics_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metrics_json)),
  error_class TEXT,
  error_signature TEXT,
  error_summary TEXT,
  ingest_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_collection_runs_source_time
  ON collection_runs(source_id, scheduled_at DESC);
CREATE INDEX idx_collection_runs_status_time
  ON collection_runs(status, updated_at);
```

`checkpoint_json` stores only bounded identifiers, page or blob cursors, and R2 manifest references. It never stores source bodies.

### `collection_incidents`

```sql
CREATE TABLE collection_incidents (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES collection_sources(id),
  signature TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'degraded', 'stop', 'security')),
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
  first_run_id TEXT REFERENCES collection_runs(id),
  latest_run_id TEXT REFERENCES collection_runs(id),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    notification_status IN ('pending', 'delivered', 'failed', 'suppressed', 'resolved')
  ),
  notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
  last_notified_at TEXT,
  next_notification_at TEXT,
  resolved_at TEXT,
  resolution_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_collection_incidents_one_open_signature
  ON collection_incidents(source_id, signature)
  WHERE status IN ('open', 'acknowledged');
```

The sentinel updates the existing open incident for the same source and signature instead of creating an alert storm.

### `collection_usage`

```sql
CREATE TABLE collection_usage (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES collection_sources(id),
  run_id TEXT REFERENCES collection_runs(id),
  cost_class TEXT NOT NULL CHECK (cost_class IN ('cloudflare', 'source_api', 'ai')),
  metric TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  estimated_microusd INTEGER NOT NULL DEFAULT 0 CHECK (estimated_microusd >= 0),
  observed_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json))
);

CREATE INDEX idx_collection_usage_period
  ON collection_usage(cost_class, observed_at, source_id);
```

The initial runtime records requests, bytes, browser seconds, Queue operations, R2 writes, and paid API calls. AI usage remains zero because AI is not in the collection path.

## Queue message contract

Queue messages are pointer-only JSON and must remain below an internal 16 KiB limit.

```json
{
  "version": 1,
  "kind": "source_run",
  "sourceId": "src:robotis-emanual",
  "runId": "019...",
  "adapterId": "github-versioned-source",
  "adapterVersion": "1.0.0",
  "triggerKind": "schedule",
  "requestedRevision": null,
  "attempt": 0,
  "traceId": "0123456789abcdef0123456789abcdef",
  "scheduledAt": "2026-08-06T22:00:00.000Z"
}
```

Incident notification retries use the same Queue with a second pointer-only variant:

```json
{
  "version": 1,
  "kind": "incident_alert",
  "incidentId": "019...",
  "sourceId": "src:robotis-emanual",
  "attempt": 0,
  "traceId": "0123456789abcdef0123456789abcdef",
  "scheduledAt": "2026-08-06T22:00:00.000Z"
}
```

Rules:

- `version` and `kind` are discriminators.
- IDs are bounded strings.
- `traceId` is lowercase 32-hex.
- `requestedRevision` is present only on `source_run` for replay or pinned canary work.
- `incidentId` is present only on `incident_alert` and resolves all delivery state from Operations D1.
- No source body, parsed record, evidence byte, credential, arbitrary URL, or free-form error enters a Queue message.
- The consumer reloads the source profile and run or incident state from Operations D1.
- A message is acknowledged only after durable terminal, retry, or notification-delivery state is written.
- Duplicate delivery is expected. `source_run` is idempotent through `runId`, lease ownership, and `idempotency_key`; `incident_alert` is idempotent through incident notification state and deduplication key.

## Dispatcher Cron contract

The dispatcher Cron performs no source fetch.

1. Return immediately when `COLLECTION_SCHEDULE_ENABLED` is not exactly `true`.
2. Select at most `COLLECTION_MAX_DUE_PER_TICK` due sources where:
   - `enabled = 1`
   - lifecycle is `pilot` or `active`
   - health is `healthy` or `suspect`
   - policy is `approved_live`
   - policy expiry is present and in the future
   - pilot expiry is present and in the future
   - policy owner, evidence, retention, alert route, and nonzero monthly budget are present
   - `next_run_at <= now`
3. Generate one run ID, trace ID, and idempotency key per source cadence slot.
4. Acquire the atomic source lease.
5. If acquired, insert one `queued` run and send one Queue pointer.
6. If Queue send fails, mark the run failed and release the lease.
7. Do not advance `next_run_at` merely because the message was sent. Terminal run policy owns the next schedule.

A canary or manual run uses the same lease and Queue contract.

## Queue consumer contract

An `incident_alert` message loads the incident, applies deduplication and notification timing, sends the bounded webhook envelope, records delivery state, and acknowledges. It never executes a source adapter or holds a source lease.

For `source_run`:

1. Validate the message schema and internal byte cap.
2. Load the run, source, and lease.
3. Acknowledge duplicate terminal messages without repeating acquisition.
4. Reject messages whose adapter or source profile no longer matches the recorded run.
5. Change the run to `running`, increment attempt, and extend the lease.
6. Execute the deterministic adapter within source budgets.
7. Write raw evidence and manifest to R2 before parsing.
8. Checkpoint after discovery, snapshot, parse, validation, and submission stages.
9. Submit the bounded import batch through `APP_INGEST`.
10. Write the terminal run state and metrics before acknowledgement.
11. Release the source lease using both source and run IDs.
12. Apply `next_run_at` from source cadence only after a successful, partial, or approved unchanged outcome.

Transient network and Cloudflare infrastructure failures may retry. Policy, authentication, source-schema, deterministic parsing, budget, provenance, and semantic failures do not enter an unbounded retry loop.

### Queue delivery settings

Initial Wrangler consumer settings are `max_batch_size = 1`, `max_batch_timeout = 5`, `max_retries = 3`, and the environment-specific dead-letter Queue named above. One-message batches make source-local acknowledgement and retry explicit during the pilot.

Retry behavior:

- attempts are numbered 1 through 4, consisting of the initial delivery plus at most three Queue retries
- transient provider or Cloudflare failures call message retry only after durable `retrying` state is written
- default retry delays are 60, 300, and 900 seconds
- provider `Retry-After` or rate reset overrides the default when later, capped by the source's maximum freshness delay
- deterministic, policy, credential, provenance, validation, and budget failures write a terminal state and acknowledge without retry
- an unexpected uncaught failure is allowed to fail the delivery and is captured by the Queue retry and dead-letter policy
- every attempt revalidates the source profile, lease, run checkpoint, and remaining budget before external work
- retries reuse the run ID and trace ID but never reuse a stale provider token

`incident_alert` uses at most three logical delivery attempts total. After the third expected webhook failure it records `notification_status = 'failed'` and acknowledges, preventing recursive alert messages. Only an unexpected uncaught delivery failure can reach the dead-letter Queue.

The attempt count in the message is advisory. Operations D1 is authoritative and increments atomically before work.

## Dead-letter contract

The dead-letter consumer:

1. Validates the pointer and loads the referenced run or incident.
2. For `source_run`, marks the run `dead_lettered` if it is not already terminal and records final attempt and error signature.
3. For `incident_alert`, marks notification delivery `failed` and retains the original incident as unresolved.
4. Opens or updates one source-local dead-letter or alert-delivery incident without recursion.
5. Sets source health to `paused`.
6. Releases only a matching expired or owned source-run lease. Alert messages own no lease.
7. Does not replay automatically.

Administrator replay creates a new run with `trigger_kind = 'replay'`, links the prior run in `checkpoint_json`, and uses a new idempotency key. History is not rewritten.

## R2 evidence contract

Object keys are generated from identifiers and hashes, not raw filenames:

```text
blobs/<source-id>/<content-sha256>
manifests/<source-id>/<run-id>.json
incidents/<source-id>/<incident-id>/<content-sha256>
```

The manifest maps original source path or locator to:

- content object key
- source revision
- provider blob ID or ETag
- SHA-256 content hash
- MIME type
- byte size
- retrieval timestamp
- adapter ID and version
- retention state
- license locator
- parse disposition

Raw objects are private and never publicly enumerable. The Application Worker receives references and hashes, not direct collection-bucket authority.

## Application ingestion handoff

The Collection Worker calls:

```text
APP_INGEST.fetch("https://internal.robopartpicker/api/v1/imports/batches", request)
```

Required request properties:

- method `POST`
- `Content-Type: application/json`
- `Authorization: Bearer <COLLECTION_INGEST_TOKEN>`
- `Idempotency-Key` exactly matching the batch body
- current versioned ingestion batch body
- bounded body size and record count

The service binding prevents dependence on public DNS or CORS. The existing ingestion authentication, validation, staging, per-record errors, review, and audit behavior remains authoritative.

## Structured log envelope

Every collection log event uses JSON with:

```json
{
  "event": "collection.stage.completed",
  "sourceId": "src:robotis-emanual",
  "runId": "019...",
  "traceId": "0123456789abcdef0123456789abcdef",
  "adapterId": "github-versioned-source",
  "adapterVersion": "1.0.0",
  "stage": "snapshot",
  "outcome": "ok",
  "attempt": 1,
  "durationMs": 123,
  "requestCount": 4,
  "bytes": 47048,
  "timestamp": "2026-08-06T22:00:00.000Z"
}
```

Do not log source bodies, credentials, authorization headers, personal data, or arbitrary raw errors. Error summaries are bounded and classified.

## Health evaluation contract

The hourly sentinel evaluates:

- overdue `next_run_at`
- stuck `queued`, `running`, or `retrying` runs
- expired leases
- consecutive run failures
- dead-letter arrivals
- canary failure
- request, byte, browser, and cost budgets
- record count and join-yield drift
- ingestion rejection and semantic-invariant failures
- policy expiration
- missing raw evidence or provenance

State transitions follow the Cloudflare-first operations plan. A source in `degraded` stops automatic promotion. A source in `paused` receives no new scheduled run.

## Migration and rollout order

1. Add the Collection Worker project and Wrangler configuration with schedules disabled.
2. Create the Operations D1 migration containing these five tables and indexes.
3. Create preview Queue and dead-letter Queue bindings.
4. Create private preview raw-evidence R2.
5. Add `APP_INGEST` preview service binding and preview ingestion secret.
6. Implement registry, lease, Queue, run, incident, usage, and log contracts using fixtures.
7. Implement the GitHub adapter family.
8. Implement the first source packet.
9. Run preview canary and shadow collection with canonical promotion disabled.
10. Create production resources only after preview evidence and source approval.
11. Set `COLLECTION_SCHEDULE_ENABLED=true` only after explicit pilot activation.

## Implementation and verification commands

Run from `/home/lenovo/robopartpicker` with the repository-pinned npm toolchain:

```bash
rtk npm install
rtk npm run collection:validate
rtk npm run collection:migrate:local
rtk npm run test:collection
rtk npm run contracts:validate
rtk npm run test:worker
rtk npm run typecheck
rtk npm run lint
rtk npm run collection:deploy:dry-run -- --env preview
```

Local integration uses fixture transport and local D1/R2/Queue bindings. It must not require GitHub credentials. The only credentialed validation is a manually invoked preview canary after the policy packet and preview secret scope are approved.

The implementation-owned operator CLI must support these read-only or explicitly guarded commands:

```bash
rtk npm run collection:ops -- sources --env preview
rtk npm run collection:ops -- runs --source src:robotis-emanual --env preview
rtk npm run collection:ops -- incidents --open --env preview
rtk npm run collection:ops -- usage --month 2026-08 --env preview
rtk npm run collection:ops -- canary --source src:robotis-emanual --revision 95e2dfa4b64cd282180f9350c467fa06861b1458 --env preview
rtk npm run collection:ops -- pause --source src:robotis-emanual --reason <reason> --env preview
rtk npm run collection:ops -- resume --source src:robotis-emanual --incident <incident-id> --canary-run <run-id> --env preview
```

`sources`, `runs`, `incidents`, and `usage` are read-only. `canary`, `pause`, and `resume` require an explicit environment, write an audit event, and refuse production unless `--confirm-production` is supplied. Resume also refuses without a passing canary, resolved incident, current policy approval, valid alert destination, and unexpired source lease state.

Preview resource provisioning and migration commands, executed only after account approval, are:

```bash
rtk npx wrangler queues create rpp-collection-preview
rtk npx wrangler queues create rpp-collection-dlq-preview
rtk npx wrangler d1 create rpp-collection-ops-preview
rtk npx wrangler r2 bucket create rpp-collection-raw-preview
rtk npx wrangler d1 migrations apply COLLECTION_OPS --env preview --remote --config wrangler.collection.jsonc
rtk npx wrangler deploy --env preview --config wrangler.collection.jsonc
```

Record returned non-secret resource identifiers in the matching `wrangler.collection.jsonc` environment only after provisioning. Review the binding diff and never copy identifiers into fixtures, logs, or unrelated prose examples.

## Verification requirements

- D1 migration applies from empty preview database and validates all constraints.
- Atomic lease test permits one winner under concurrent acquisition and permits takeover only after expiry.
- Queue duplicate-delivery test produces one source acquisition and one import batch.
- Queue retry and dead-letter tests preserve one trace ID and durable run history.
- Dispatcher test performs zero external subrequests.
- Disabled schedule test enqueues nothing when the var is absent or false.
- R2 test proves evidence is written before parse and no raw body enters Queue or canonical D1.
- Service-binding test proves the current ingestion authentication and idempotency contract.
- Sentinel tests cover stale run, expired lease, drift, policy expiry, DLQ, pause, and deduplicated incident.
- Collection Worker has no canonical D1 or application-file R2 binding.
- Application Worker has no source-crawling adapter or broad collector credential.

## Stop conditions

Stop implementation when:

- a third Worker, Workflow, Durable Object, Container, server, or agent is required without measured evidence
- Collection Worker gains canonical D1 write authority
- raw evidence enters Queue messages
- source acquisition occurs in Cron rather than the Queue consumer
- lease acquisition is not atomic
- acknowledgement can occur before durable run state
- retry or dead-letter behavior can duplicate source work or imports
- live schedules can activate when the enable variable is absent
- credentials can enter D1, R2 manifests, Queue messages, or logs
- Application Worker ingestion validation or review is bypassed

## Cloudflare references

- Cron Triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Cloudflare Queues: <https://developers.cloudflare.com/queues/>
- Queue retries and dead letters: <https://developers.cloudflare.com/queues/configuration/batching-retries/>
- D1: <https://developers.cloudflare.com/d1/>
- R2: <https://developers.cloudflare.com/r2/>
- Worker service bindings: <https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/>
- Workers Logs: <https://developers.cloudflare.com/workers/observability/logs/workers-logs/>
