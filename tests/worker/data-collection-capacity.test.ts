import { env } from "cloudflare:workers";

const databaseBudgetBytes = 419_430_400;
const emptySchemaBytes = 2_633_728;
const expansionShardCount = 7;
const expansionLogicalRecords = 100_000;
const pilotLogicalRecords = 5_000;
const dailyFreeTierWriteLimit = 100_000;
const fixtureLogicalRecords = 100;
const traceId = "fedcba9876543210fedcba9876543210";
const timestamp = "2026-07-29T00:00:00Z";

type QueryPlanRow = { detail: string };

async function fixturePayloadBytes() {
  const tables = [
    ["import_sources", "id"],
    ["source_collection_profiles", "source_id"],
    ["source_policy_revisions", "id"],
    ["import_jobs", "id"],
    ["import_records", "id"],
    ["collection_jobs", "id"],
    ["source_snapshots", "id"],
    ["field_claims", "id"],
    ["temporal_observations", "id"],
    ["claim_conflict_sets", "id"],
    ["collection_missing_information", "id"],
    ["collection_budget_ledger", "id"],
    ["collection_lifecycle_events", "id"],
  ] as const;
  let bytes = 0;
  for (const [table, idColumn] of tables) {
    const columns = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const widthExpression = columns.results
      .map(({ name }) => `COALESCE(length(quote("${name.replaceAll("\"", "\"\"")}")), 0)`)
      .join(" + ");
    const result = await env.DB.prepare(`
      SELECT COALESCE(SUM(48 + ${widthExpression}), 0) AS bytes
      FROM ${table}
      WHERE ${idColumn} LIKE 'capacity-%'
    `).first<{ bytes: number }>();
    bytes += Number(result?.bytes ?? 0);
  }
  return bytes;
}

async function runBatches(statements: D1PreparedStatement[]) {
  for (let start = 0; start < statements.length; start += 100) {
    await env.DB.batch(statements.slice(start, start + 100));
  }
}

async function addSources(start: number, end: number) {
  const statements: D1PreparedStatement[] = [];
  for (let index = start; index < end; index += 1) {
    const sourceId = `capacity-source-${index}`;
    statements.push(
      env.DB.prepare(`
        INSERT INTO import_sources
          (id, slug, name, source_type, base_url, priority, trust_weight, status, created_at, updated_at)
        VALUES (?, ?, ?, 'manufacturer', ?, 10, 1, 'active', ?, ?)
      `).bind(sourceId, sourceId, `Capacity source ${index}`, `https://capacity.example/${index}`, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO source_policy_revisions
          (id, source_id, robots_status, terms_status, reuse_status, decision, approval_authority_reference, effective_at, created_at)
        VALUES (?, ?, 'allowed', 'approved', 'metadata_and_facts', 'approved_fixture_only', 'capacity-fixture', ?, ?)
      `).bind(`capacity-policy-${index}`, sourceId, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO source_collection_profiles
          (source_id, source_tier, policy_state, enabled, access_method, cadence_class, next_due_at, freshness_target_seconds, freshness_debt_seconds, circuit_state, created_at, updated_at)
        VALUES (?, 'official_manufacturer', 'approved_fixture_only', 1, 'fixture', 'daily', ?, 86400, 0, 'closed', ?, ?)
      `).bind(sourceId, timestamp, timestamp, timestamp),
    );
  }
  await runBatches(statements);
}

async function addLogicalRecords(start: number, end: number, sourceCount: number) {
  const roots: D1PreparedStatement[] = [];
  const snapshots: D1PreparedStatement[] = [];
  const claims: D1PreparedStatement[] = [];
  const observations: D1PreparedStatement[] = [];
  const review: D1PreparedStatement[] = [];
  const budgetsAndEvents: D1PreparedStatement[] = [];
  const observationTypes = [
    "price",
    "stock",
    "availability",
    "specification",
    "firmware",
    "release",
    "project_version",
    "source_policy_status",
    "delisting",
    "other",
  ];

  for (let index = start; index < end; index += 1) {
    const sourceIndex = index % sourceCount;
    const sourceId = `capacity-source-${sourceIndex}`;
    const importJobId = `capacity-import-job-${index}`;
    const importRecordId = `capacity-record-${index}`;
    const collectionJobId = `capacity-collection-job-${index}`;
    const sourceUrl = `https://capacity.example/${sourceIndex}/parts/${index}`;

    roots.push(
      env.DB.prepare(`
        INSERT INTO import_jobs
          (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash, trace_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, '2.0', 'staged', ?, ?, ?, ?, ?)
      `).bind(importJobId, sourceId, `capacity-batch-${index}`, `capacity-key-${index}`, timestamp, index.toString(16).padStart(64, "0"), traceId, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO import_records
          (id, import_job_id, source_id, external_record_id, record_type, source_url, confidence, raw_payload_json, parsed_data_json, status, trace_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'component', ?, 1, '{}', '{}', 'staged', ?, ?, ?)
      `).bind(importRecordId, importJobId, sourceId, `capacity-component-${index}`, sourceUrl, traceId, timestamp, timestamp),
      env.DB.prepare(`
        INSERT INTO collection_jobs
          (id, source_id, source_policy_revision_id, job_type, status, requested_url, dedup_key, priority, scheduled_for, attempt_count, max_attempts, trace_id, created_at, updated_at)
        VALUES (?, ?, ?, 'acquisition', 'queued', ?, ?, 100, ?, 0, 3, ?, ?, ?)
      `).bind(collectionJobId, sourceId, `capacity-policy-${sourceIndex}`, sourceUrl, `capacity-dedup-${index}`, timestamp, traceId, timestamp, timestamp),
    );

    for (let revision = 0; revision < 2; revision += 1) {
      snapshots.push(env.DB.prepare(`
        INSERT INTO source_snapshots
          (id, source_id, import_record_id, source_policy_revision_id, source_class, source_url, retrieved_at, declared_media_type, detected_media_type, byte_size, content_sha256, immutable_external_url, retrieval_metadata_json, retention_state, created_at)
        VALUES (?, ?, ?, ?, 'official', ?, ?, 'application/json', 'application/json', 1024, ?, ?, '{"status":200,"fixture":true}', 'external_reference', ?)
      `).bind(
        `capacity-snapshot-${index}-${revision}`,
        sourceId,
        importRecordId,
        `capacity-policy-${sourceIndex}`,
        sourceUrl,
        `2026-07-${String(29 + revision).padStart(2, "0")}T00:00:00Z`,
        `${index.toString(16).padStart(63, "0")}${revision}`,
        `${sourceUrl}?revision=${revision}`,
        timestamp,
      ));
    }

    for (let claimIndex = 0; claimIndex < 20; claimIndex += 1) {
      claims.push(env.DB.prepare(`
        INSERT INTO field_claims
          (id, source_id, import_record_id, snapshot_id, claim_key, original_value_json, normalized_value_json, unit, confidence, evidence_locator, classification, applicable_revision, extraction_method, extractor_version, schema_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'N.m', 0.95, ?, 'official', 'rev-a', 'fixture', 'capacity-v1', '2.0', ?)
      `).bind(
        `capacity-claim-${index}-${claimIndex}`,
        sourceId,
        importRecordId,
        `capacity-snapshot-${index}-1`,
        `actuator.torque.${claimIndex}`,
        JSON.stringify(`${claimIndex + 1} N.m`),
        JSON.stringify(claimIndex + 1),
        `datasheet-table-1-row-${claimIndex + 1}`,
        timestamp,
      ));
    }

    for (let observationIndex = 0; observationIndex < 10; observationIndex += 1) {
      observations.push(env.DB.prepare(`
        INSERT INTO temporal_observations
          (id, source_id, import_record_id, snapshot_id, field_claim_id, entity_type, entity_external_id, observation_type, original_value_json, normalized_value_json, unit, observed_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'component', ?, ?, ?, ?, 'count', ?, ?)
      `).bind(
        `capacity-observation-${index}-${observationIndex}`,
        sourceId,
        importRecordId,
        `capacity-snapshot-${index}-1`,
        `capacity-claim-${index}-${observationIndex}`,
        `capacity-component-${index}`,
        observationTypes[observationIndex],
        JSON.stringify(observationIndex),
        JSON.stringify(observationIndex),
        timestamp,
        timestamp,
      ));
    }

    review.push(
      env.DB.prepare(`
        INSERT INTO claim_conflict_sets
          (id, source_id, import_record_id, entity_type, entity_external_id, field_key, conflict_type, status, created_at)
        VALUES (?, ?, ?, 'component', ?, 'actuator.torque.0', 'value_mismatch', 'open', ?)
      `).bind(`capacity-conflict-${index}`, sourceId, importRecordId, `capacity-component-${index}`, timestamp),
      env.DB.prepare(`
        INSERT INTO collection_missing_information
          (id, source_id, import_record_id, snapshot_id, field_key, reason_code, details, status, created_at)
        VALUES (?, ?, ?, ?, 'actuator.continuous_torque', 'missing', 'Not stated in the fixture source', 'open', ?)
      `).bind(`capacity-missing-${index}-0`, sourceId, importRecordId, `capacity-snapshot-${index}-1`, timestamp),
      env.DB.prepare(`
        INSERT INTO collection_missing_information
          (id, source_id, import_record_id, snapshot_id, field_key, reason_code, details, status, created_at)
        VALUES (?, ?, ?, ?, 'actuator.backlash', 'ambiguous', 'Multiple units need human review', 'open', ?)
      `).bind(`capacity-missing-${index}-1`, sourceId, importRecordId, `capacity-snapshot-${index}-1`, timestamp),
    );

    budgetsAndEvents.push(
      env.DB.prepare(`
        INSERT INTO collection_budget_ledger
          (id, cost_class, source_id, collection_job_id, event_type, period_start, period_end, limit_microusd, consumed_microusd, projected_microusd, approval_state, trace_id, created_at)
        VALUES (?, 'cloudflare_infra', ?, ?, 'commit', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', 50000000, 100, 100, 'not_required', ?, ?)
      `).bind(`capacity-budget-${index}`, sourceId, collectionJobId, traceId, timestamp),
      env.DB.prepare(`
        INSERT INTO collection_lifecycle_events
          (id, collection_job_id, source_id, import_job_id, import_record_id, event_type, from_status, to_status, details_json, trace_id, occurred_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'created', NULL, 'queued', '{}', ?, ?, ?)
      `).bind(`capacity-event-${index}`, collectionJobId, sourceId, importJobId, importRecordId, traceId, timestamp, timestamp),
    );
  }

  for (const statements of [roots, snapshots, claims, observations, review, budgetsAndEvents]) {
    await runBatches(statements);
  }
}

async function expectIndexedPlan(sql: string, expectedIndex: string) {
  const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<QueryPlanRow>();
  const details = plan.results.map((row) => row.detail);
  expect(details.some((detail) => detail.includes(`USING INDEX ${expectedIndex}`) || detail.includes(`USING COVERING INDEX ${expectedIndex}`))).toBe(true);
  expect(details.some((detail) => /\bSCAN (collection_jobs|source_snapshots|field_claims|temporal_observations|claim_conflict_sets|collection_missing_information|collection_budget_ledger)\b/.test(detail))).toBe(false);
}

describe("data-collection D1 capacity", () => {
  it("keeps the pilot and each source-partitioned expansion shard below the D1 design cap", async () => {
    await addSources(0, 5);
    await addLogicalRecords(0, 5, 5);
    const pilotSamplePayloadBytes = await fixturePayloadBytes();

    await addSources(5, 50);
    await addLogicalRecords(5, fixtureLogicalRecords, 50);
    const expansionSamplePayloadBytes = await fixturePayloadBytes();

    // The 2x factor reserves one additional byte for indexes/WAL per measured
    // table-payload byte. The checked-in capacity report records the companion
    // file-level page_count * page_size measurement against local D1.
    const payloadBytesPerLogicalRecord = Math.ceil(expansionSamplePayloadBytes / fixtureLogicalRecords);
    const projectedPilotBytes = emptySchemaBytes
      + Math.ceil(pilotSamplePayloadBytes / 5) * pilotLogicalRecords * 2;
    const projectedUnshardedExpansionBytes = emptySchemaBytes
      + payloadBytesPerLogicalRecord * expansionLogicalRecords * 2;
    const projectedLargestExpansionShardBytes = emptySchemaBytes
      + payloadBytesPerLogicalRecord * Math.ceil(expansionLogicalRecords / expansionShardCount) * 2;

    expect(pilotSamplePayloadBytes).toBeGreaterThan(0);
    expect(expansionSamplePayloadBytes).toBeGreaterThan(pilotSamplePayloadBytes);
    expect(projectedPilotBytes).toBeLessThanOrEqual(databaseBudgetBytes);
    expect(projectedUnshardedExpansionBytes).toBeGreaterThan(databaseBudgetBytes);
    expect(projectedLargestExpansionShardBytes).toBeLessThanOrEqual(databaseBudgetBytes);

    // Forty base-table writes are required per logical record before index
    // amplification. Expansion therefore remains disabled on Workers Free and
    // requires an explicit paid-capacity approval even after storage sharding.
    const baseTableWritesPerLogicalRecord = 40;
    const expansionDailyWritesLowerBound = Math.ceil(
      baseTableWritesPerLogicalRecord * expansionLogicalRecords / 30,
    );
    expect(expansionDailyWritesLowerBound).toBeGreaterThan(dailyFreeTierWriteLimit);

    const maximumBoundedValue = await env.DB.prepare(`
      SELECT MAX(length(original_value_json)) AS bytes FROM field_claims WHERE id LIKE 'capacity-claim-%'
    `).first<{ bytes: number }>();
    expect(Number(maximumBoundedValue?.bytes ?? 0)).toBeLessThanOrEqual(131_072);
  });

  it("uses intended indexes for all eight representative expansion queries", async () => {
    await expectIndexedPlan(
      `SELECT collection_jobs.id
       FROM collection_jobs
       JOIN source_collection_profiles
         ON source_collection_profiles.source_id = collection_jobs.source_id
       WHERE collection_jobs.status = 'queued'
         AND collection_jobs.scheduled_for <= '2026-07-30T00:00:00Z'
         AND (collection_jobs.backoff_until IS NULL OR collection_jobs.backoff_until <= '2026-07-30T00:00:00Z')
         AND source_collection_profiles.enabled = 1
         AND source_collection_profiles.policy_state IN ('approved_fixture_only', 'approved_live')
         AND source_collection_profiles.circuit_state IN ('closed', 'half_open')
         AND (source_collection_profiles.next_due_at IS NULL OR source_collection_profiles.next_due_at <= '2026-07-30T00:00:00Z')
       ORDER BY collection_jobs.scheduled_for
       LIMIT 100`,
      "collection_jobs_due_idx",
    );
    await expectIndexedPlan(
      "SELECT id FROM collection_jobs WHERE status = 'leased' AND lease_expires_at <= '2026-07-30T00:00:00Z' ORDER BY lease_expires_at LIMIT 100",
      "collection_jobs_lease_expiry_idx",
    );
    await expectIndexedPlan(
      "SELECT projected_microusd FROM collection_budget_ledger WHERE cost_class = 'cloudflare_infra' AND period_start = '2026-07-01T00:00:00Z' AND period_end = '2026-08-01T00:00:00Z' ORDER BY created_at DESC LIMIT 1",
      "collection_budget_ledger_class_period_idx",
    );
    await expectIndexedPlan(
      "SELECT id FROM source_snapshots WHERE source_id = 'capacity-source-0' ORDER BY retrieved_at DESC LIMIT 100",
      "source_snapshots_source_retrieved_idx",
    );
    await expectIndexedPlan(
      "SELECT id FROM field_claims WHERE import_record_id = 'capacity-record-0' AND claim_key = 'actuator.torque.0' ORDER BY created_at DESC",
      "field_claims_import_record_key_idx",
    );
    await expectIndexedPlan(
      "SELECT id FROM temporal_observations WHERE source_id = 'capacity-source-0' AND entity_type = 'component' AND entity_external_id = 'capacity-component-0' AND observation_type = 'price' ORDER BY observed_at DESC LIMIT 1",
      "temporal_observations_current_idx",
    );
    await expectIndexedPlan(
      "SELECT id FROM claim_conflict_sets WHERE source_id = 'capacity-source-0' AND status = 'open' ORDER BY created_at LIMIT 100",
      "claim_conflict_sets_open_idx",
    );
    await expectIndexedPlan(
      "SELECT id FROM collection_missing_information WHERE source_id = 'capacity-source-0' AND status = 'open' ORDER BY created_at LIMIT 100",
      "collection_missing_information_review_idx",
    );
  });
});
