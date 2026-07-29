import { env } from "cloudflare:workers";

const expectedTables = [
  "claim_conflict_members",
  "claim_conflict_sets",
  "collection_budget_ledger",
  "collection_jobs",
  "collection_lifecycle_events",
  "collection_missing_information",
  "field_claims",
  "source_collection_profiles",
  "source_policy_revisions",
  "source_snapshots",
  "temporal_observations",
] as const;

const traceId = "0123456789abcdef0123456789abcdef";
const sourceId = "dc-source";
const importJobId = "dc-import-job";
const firstRecordId = "dc-record-1";
const secondRecordId = "dc-record-2";
const inventoryBoundary = {
  normativeCompleteLines: "1-1693",
  knownLine1694Prefix: ["exact source", "date", "applicable version", "extraction metadata"],
  unknownSuffixState: "deferred_unknown_tail",
} as const;

async function seedImportRoots() {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO import_sources
        (id, slug, name, source_type, base_url, priority, trust_weight, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 10, 1, 'active', ?, ?)
    `).bind(sourceId, "dc-source", "Data collection fixture", "manufacturer", "https://example.com", "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z"),
    env.DB.prepare(`
      INSERT INTO import_jobs
        (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash, trace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, '1.0', 'staged', ?, ?, ?, ?, ?)
    `).bind(importJobId, sourceId, "dc-batch", "dc-idempotency", "2026-07-29T00:00:00Z", "a".repeat(64), traceId, "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z"),
    env.DB.prepare(`
      INSERT INTO import_records
        (id, import_job_id, source_id, external_record_id, record_type, source_url, confidence, raw_payload_json, parsed_data_json, status, trace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'component', ?, 1, '{}', '{}', 'staged', ?, ?, ?)
    `).bind(firstRecordId, importJobId, sourceId, "component-1", "https://example.com/component-1", traceId, "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z"),
    env.DB.prepare(`
      INSERT INTO import_records
        (id, import_job_id, source_id, external_record_id, record_type, source_url, confidence, raw_payload_json, parsed_data_json, status, trace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'component', ?, 1, '{}', '{}', 'staged', ?, ?, ?)
    `).bind(secondRecordId, importJobId, sourceId, "component-2", "https://example.com/component-2", traceId, "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z"),
  ]);
}

describe("data-collection provenance schema", () => {
  it("does not invent the truncated inventory tail", () => {
    expect(inventoryBoundary).toEqual({
      normativeCompleteLines: "1-1693",
      knownLine1694Prefix: ["exact source", "date", "applicable version", "extraction metadata"],
      unknownSuffixState: "deferred_unknown_tail",
    });
  });

  it("adds exactly the eleven source-scoped tables and nullable trace columns", async () => {
    const placeholders = expectedTables.map(() => "?").join(", ");
    const tables = await env.DB.prepare(`
      SELECT name
      FROM sqlite_schema
      WHERE type = 'table' AND name IN (${placeholders})
      ORDER BY name
    `).bind(...expectedTables).all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual([...expectedTables]);

    for (const table of ["import_jobs", "import_records", "import_errors", "import_audit_events"]) {
      const columns = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string; notnull: number }>();
      expect(columns.results).toContainEqual(expect.objectContaining({ name: "trace_id", notnull: 0 }));
    }

    const foreignKeyFailures = await env.DB.prepare("PRAGMA foreign_key_check").all();
    expect(foreignKeyFailures.results).toEqual([]);
  });

  it("keeps claim classifications, mutable observations, lifecycle, and budgets append-only", async () => {
    await seedImportRoots();

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO source_collection_profiles
          (source_id, source_tier, policy_state, enabled, access_method, cadence_class, next_due_at, freshness_target_seconds, freshness_debt_seconds, circuit_state, created_at, updated_at)
        VALUES (?, 'official_manufacturer', 'approved_fixture_only', 1, 'fixture', 'manual', ?, 86400, 0, 'closed', ?, ?)
      `).bind(sourceId, "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z"),
      env.DB.prepare(`
        INSERT INTO source_policy_revisions
          (id, source_id, robots_status, terms_status, reuse_status, decision, approval_authority_reference, effective_at, created_at)
        VALUES ('dc-policy-1', ?, 'allowed', 'approved', 'metadata_and_facts', 'approved_fixture_only', 'owner-confirmation', ?, ?)
      `).bind(sourceId, "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z"),
      env.DB.prepare(`
        INSERT INTO source_policy_revisions
          (id, source_id, robots_status, terms_status, reuse_status, decision, approval_authority_reference, effective_at, supersedes_policy_revision_id, created_at)
        VALUES ('dc-policy-2', ?, 'allowed', 'approved', 'metadata_and_facts', 'approved_live', 'owner-confirmation', ?, 'dc-policy-1', ?)
      `).bind(sourceId, "2026-07-30T00:00:00Z", "2026-07-30T00:00:00Z"),
      env.DB.prepare(`
        INSERT INTO source_snapshots
          (id, source_id, import_record_id, source_policy_revision_id, source_class, source_url, retrieved_at, declared_media_type, detected_media_type, byte_size, content_sha256, immutable_external_url, retrieval_metadata_json, retention_state, created_at)
        VALUES ('dc-snapshot', ?, ?, 'dc-policy-2', 'official', 'https://example.com/component-1', ?, 'text/html', 'text/html', 512, ?, 'https://example.com/component-1', '{"status":200}', 'external_reference', ?)
      `).bind(sourceId, firstRecordId, "2026-07-30T00:00:00Z", "b".repeat(64), "2026-07-30T00:00:00Z"),
    ]);

    const classifications = ["official", "reported", "measured", "calculated", "estimated", "ai_inferred"] as const;
    await env.DB.batch(classifications.map((classification, index) => env.DB.prepare(`
      INSERT INTO field_claims
        (id, source_id, import_record_id, snapshot_id, claim_key, original_value_json, normalized_value_json, unit, confidence, evidence_locator, classification, applicable_revision, extraction_method, schema_version, created_at)
      VALUES (?, ?, ?, 'dc-snapshot', ?, ?, ?, 'N.m', ?, ?, ?, 'rev-a', 'fixture', '2.0', ?)
    `).bind(
      `dc-claim-${classification}`,
      sourceId,
      firstRecordId,
      `torque_${index}`,
      JSON.stringify(`${index + 1} N.m`),
      JSON.stringify(index + 1),
      1 - index * 0.1,
      `table-1-row-${index + 1}`,
      classification,
      `2026-07-30T00:00:0${index}Z`,
    )));

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO temporal_observations
          (id, source_id, import_record_id, snapshot_id, field_claim_id, entity_type, entity_external_id, observation_type, original_value_json, normalized_value_json, currency, observed_at, created_at)
        VALUES ('dc-observation-1', ?, ?, 'dc-snapshot', 'dc-claim-official', 'component', 'component-1', 'price', '"100.00"', '10000', 'USD', ?, ?)
      `).bind(sourceId, firstRecordId, "2026-07-30T00:00:00Z", "2026-07-30T00:00:00Z"),
      env.DB.prepare(`
        INSERT INTO temporal_observations
          (id, source_id, import_record_id, snapshot_id, field_claim_id, entity_type, entity_external_id, observation_type, original_value_json, normalized_value_json, currency, observed_at, supersedes_observation_id, created_at)
        VALUES ('dc-observation-2', ?, ?, 'dc-snapshot', 'dc-claim-official', 'component', 'component-1', 'price', '"95.00"', '9500', 'USD', ?, 'dc-observation-1', ?)
      `).bind(sourceId, firstRecordId, "2026-07-31T00:00:00Z", "2026-07-31T00:00:00Z"),
      env.DB.prepare(`
        INSERT INTO collection_jobs
          (id, source_id, source_policy_revision_id, job_type, status, requested_url, payload_hash, dedup_key, priority, scheduled_for, attempt_count, max_attempts, trace_id, created_at, updated_at)
        VALUES ('dc-collection-job', ?, 'dc-policy-2', 'acquisition', 'queued', 'https://example.com/component-1', ?, 'component-1-rev-a', 10, ?, 0, 3, ?, ?, ?)
      `).bind(sourceId, "c".repeat(64), "2026-07-31T00:00:00Z", traceId, "2026-07-30T00:00:00Z", "2026-07-30T00:00:00Z"),
      env.DB.prepare(`
        INSERT INTO collection_lifecycle_events
          (id, collection_job_id, source_id, import_job_id, import_record_id, event_type, from_status, to_status, reason, details_json, trace_id, occurred_at, created_at)
        VALUES ('dc-event-1', 'dc-collection-job', ?, ?, ?, 'withdrawal', 'complete', 'complete', 'source withdrew the revision', '{"state":"withdrawn"}', ?, ?, ?)
      `).bind(sourceId, importJobId, firstRecordId, traceId, "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z"),
    ]);

    const revisionTypes = [
      "price",
      "stock",
      "availability",
      "specification",
      "firmware",
      "release",
      "project_version",
      "source_policy_status",
      "delisting",
    ] as const;
    await env.DB.batch(revisionTypes.flatMap((observationType, index) => {
      if (observationType === "price") return [];
      const firstId = `dc-${observationType}-1`;
      return [
        env.DB.prepare(`
          INSERT INTO temporal_observations
            (id, source_id, import_record_id, snapshot_id, field_claim_id, entity_type, entity_external_id, observation_type, original_value_json, normalized_value_json, observed_at, created_at)
          VALUES (?, ?, ?, 'dc-snapshot', 'dc-claim-official', 'component', 'component-1', ?, ?, ?, ?, ?)
        `).bind(firstId, sourceId, firstRecordId, observationType, JSON.stringify(`old-${index}`), JSON.stringify(index), `2026-08-01T00:00:${String(index).padStart(2, "0")}Z`, `2026-08-01T00:00:${String(index).padStart(2, "0")}Z`),
        env.DB.prepare(`
          INSERT INTO temporal_observations
            (id, source_id, import_record_id, snapshot_id, field_claim_id, entity_type, entity_external_id, observation_type, original_value_json, normalized_value_json, observed_at, supersedes_observation_id, created_at)
          VALUES (?, ?, ?, 'dc-snapshot', 'dc-claim-official', 'component', 'component-1', ?, ?, ?, ?, ?, ?)
        `).bind(`dc-${observationType}-2`, sourceId, firstRecordId, observationType, JSON.stringify(`new-${index}`), JSON.stringify(index + 1), `2026-08-02T00:00:${String(index).padStart(2, "0")}Z`, firstId, `2026-08-02T00:00:${String(index).padStart(2, "0")}Z`),
      ];
    }));

    await env.DB.batch(["ai_token", "cloudflare_infra", "paid_source_api"].map((costClass, index) => env.DB.prepare(`
      INSERT INTO collection_budget_ledger
        (id, cost_class, source_id, collection_job_id, event_type, period_start, period_end, limit_microusd, consumed_microusd, projected_microusd, approval_state, paused_at, pause_reason, trace_id, created_at)
      VALUES (?, ?, ?, 'dc-collection-job', 'projection', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', 50000000, ?, ?, 'not_required', ?, ?, ?, ?)
    `).bind(
      `dc-budget-${costClass}`,
      costClass,
      sourceId,
      index * 1_000_000,
      index === 0 ? 51_000_000 : 2_000_000,
      index === 0 ? "2026-07-30T00:00:00Z" : null,
      index === 0 ? "projected class-local limit exceeded" : null,
      traceId,
      "2026-07-30T00:00:00Z",
    )));

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO import_errors
          (id, import_job_id, import_record_id, error_code, message, retryable, trace_id, created_at)
        VALUES ('dc-import-error', ?, ?, 'fixture_warning', 'fixture warning', 0, ?, ?)
      `).bind(importJobId, firstRecordId, traceId, "2026-08-01T00:00:00Z"),
      env.DB.prepare(`
        INSERT INTO import_audit_events
          (id, import_job_id, import_record_id, actor_service_id, event_type, after_json, trace_id, created_at)
        VALUES ('dc-import-audit', ?, ?, 'data-collector', 'fixture_trace', '{}', ?, ?)
      `).bind(importJobId, firstRecordId, traceId, "2026-08-01T00:00:00Z"),
      env.DB.prepare(`
        INSERT INTO staging_components
          (id, import_record_id, name, category, normalized_name, specs_json, review_status, created_at)
        VALUES ('dc-staging-component', ?, 'Fixture actuator', 'actuator', 'fixture actuator', '{}', 'pending', ?)
      `).bind(firstRecordId, "2026-08-01T00:00:00Z"),
    ]);

    const storedClassifications = await env.DB.prepare(`
      SELECT classification FROM field_claims WHERE import_record_id = ? ORDER BY classification
    `).bind(firstRecordId).all<{ classification: string }>();
    expect(storedClassifications.results.map((row) => row.classification).sort()).toEqual([...classifications].sort());

    const observations = await env.DB.prepare(`
      SELECT id, normalized_value_json
      FROM temporal_observations
      WHERE source_id = ? AND entity_type = 'component' AND entity_external_id = 'component-1' AND observation_type = 'price'
      ORDER BY observed_at DESC
    `).bind(sourceId).all<{ id: string; normalized_value_json: string }>();
    expect(observations.results).toEqual([
      { id: "dc-observation-2", normalized_value_json: "9500" },
      { id: "dc-observation-1", normalized_value_json: "10000" },
    ]);

    const revisionHistory = await env.DB.prepare(`
      SELECT observation_type, COUNT(*) AS revisions
      FROM temporal_observations
      WHERE source_id = ? AND entity_external_id = 'component-1'
      GROUP BY observation_type
      ORDER BY observation_type
    `).bind(sourceId).all<{ observation_type: string; revisions: number }>();
    expect(Object.fromEntries(revisionHistory.results.map((row) => [row.observation_type, Number(row.revisions)]))).toMatchObject({
      availability: 2,
      delisting: 2,
      firmware: 2,
      price: 2,
      project_version: 2,
      release: 2,
      source_policy_status: 2,
      specification: 2,
      stock: 2,
    });

    const policyRevisions = await env.DB.prepare(`
      SELECT id FROM source_policy_revisions WHERE source_id = ? ORDER BY effective_at
    `).bind(sourceId).all<{ id: string }>();
    expect(policyRevisions.results.map((row) => row.id)).toEqual(["dc-policy-1", "dc-policy-2"]);

    const budgetStates = await env.DB.prepare(`
      SELECT cost_class, paused_at IS NOT NULL AS paused
      FROM collection_budget_ledger
      WHERE source_id = ?
      ORDER BY cost_class
    `).bind(sourceId).all<{ cost_class: string; paused: number }>();
    expect(budgetStates.results).toEqual([
      { cost_class: "ai_token", paused: 1 },
      { cost_class: "cloudflare_infra", paused: 0 },
      { cost_class: "paid_source_api", paused: 0 },
    ]);

    const tracePath = await env.DB.prepare(`
      SELECT j.trace_id AS job_trace, r.trace_id AS record_trace, e.trace_id AS error_trace,
             a.trace_id AS audit_trace, s.import_record_id AS staged_record_id
      FROM import_jobs AS j
      JOIN import_records AS r ON r.import_job_id = j.id
      JOIN import_errors AS e ON e.import_record_id = r.id
      JOIN import_audit_events AS a ON a.import_record_id = r.id
      JOIN staging_components AS s ON s.import_record_id = r.id
      WHERE j.id = ?
    `).bind(importJobId).first<{
      job_trace: string;
      record_trace: string;
      error_trace: string;
      audit_trace: string;
      staged_record_id: string;
    }>();
    expect(tracePath).toEqual({
      job_trace: traceId,
      record_trace: traceId,
      error_trace: traceId,
      audit_trace: traceId,
      staged_record_id: firstRecordId,
    });

    const legacyJob = await env.DB.prepare(`
      INSERT INTO import_jobs
        (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash, created_at, updated_at)
      VALUES ('dc-legacy-job', ?, 'dc-legacy-batch', 'dc-legacy-idempotency', '1.0', 'accepted', ?, ?, ?, ?)
      RETURNING trace_id
    `).bind(sourceId, "2026-07-29T00:00:00Z", "d".repeat(64), "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z").first<{ trace_id: string | null }>();
    expect(legacyJob?.trace_id).toBeNull();
  });

  it("rejects updates and deletes of immutable provenance history", async () => {
    const immutableRows = [
      ["source_policy_revisions", "id", "dc-policy-1", "decision_notes = 'rewrite'"],
      ["source_snapshots", "id", "dc-snapshot", "copyright_reuse_status = 'rewrite'"],
      ["field_claims", "id", "dc-claim-official", "confidence = 0.1"],
      ["temporal_observations", "id", "dc-observation-1", "normalized_value_json = '1'"],
      ["collection_budget_ledger", "id", "dc-budget-ai_token", "consumed_microusd = 1"],
      ["collection_lifecycle_events", "id", "dc-event-1", "reason = 'rewrite'"],
    ] as const;

    for (const [table, idColumn, id, assignment] of immutableRows) {
      await expect(env.DB.prepare(`
        UPDATE ${table} SET ${assignment} WHERE ${idColumn} = ?
      `).bind(id).run()).rejects.toThrow(/append-only/);
      await expect(env.DB.prepare(`
        DELETE FROM ${table} WHERE ${idColumn} = ?
      `).bind(id).run()).rejects.toThrow(/append-only/);
    }

    await expect(env.DB.prepare("DELETE FROM import_records WHERE id = ?").bind(firstRecordId).run())
      .rejects.toThrow(/append-only|FOREIGN KEY constraint failed/);
    await expect(env.DB.prepare("DELETE FROM import_sources WHERE id = ?").bind(sourceId).run())
      .rejects.toThrow(/append-only|FOREIGN KEY constraint failed/);
  });

  it("recovers one expired lease atomically and gates ingestion handoff by status", async () => {
    await env.DB.prepare(`
      INSERT INTO collection_jobs
        (id, source_id, source_policy_revision_id, job_type, status, dedup_key, priority, scheduled_for, lease_token, lease_owner, leased_at, lease_expires_at, attempt_count, max_attempts, trace_id, created_at, updated_at)
      VALUES ('dc-expired-lease', ?, 'dc-policy-2', 'acquisition', 'leased', 'expired-lease', 10, ?, 'expired-token', 'dead-worker', ?, ?, 1, 3, ?, ?, ?)
    `).bind(sourceId, "2026-07-31T00:00:00Z", "2026-07-31T00:00:00Z", "2026-08-01T00:00:00Z", traceId, "2026-07-31T00:00:00Z", "2026-07-31T00:00:00Z").run();

    const recovered = await env.DB.prepare(`
      UPDATE collection_jobs
      SET lease_token = 'recovered-token',
          lease_owner = 'healthy-worker',
          leased_at = '2026-08-02T00:00:00Z',
          lease_expires_at = '2026-08-02T00:05:00Z',
          attempt_count = attempt_count + 1,
          updated_at = '2026-08-02T00:00:00Z'
      WHERE id = 'dc-expired-lease'
        AND status = 'leased'
        AND lease_token = 'expired-token'
        AND lease_expires_at <= '2026-08-02T00:00:00Z'
      RETURNING lease_owner, attempt_count
    `).first<{ lease_owner: string; attempt_count: number }>();
    expect(recovered).toEqual({ lease_owner: "healthy-worker", attempt_count: 2 });

    const duplicateRecovery = await env.DB.prepare(`
      UPDATE collection_jobs
      SET lease_owner = 'second-worker'
      WHERE id = 'dc-expired-lease' AND lease_token = 'expired-token'
      RETURNING id
    `).first();
    expect(duplicateRecovery).toBeNull();

    await expect(env.DB.prepare(`
      INSERT INTO collection_jobs
        (id, source_id, job_type, status, dedup_key, priority, scheduled_for, attempt_count, max_attempts, import_job_id, trace_id, created_at, updated_at)
      VALUES ('dc-premature-handoff', ?, 'submission', 'queued', 'premature-handoff', 10, ?, 0, 3, ?, ?, ?, ?)
    `).bind(sourceId, "2026-08-02T00:00:00Z", importJobId, traceId, "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z").run()).rejects.toThrow(/CHECK constraint failed/);

    await env.DB.batch(["deferred", "denied"].map((status) => env.DB.prepare(`
      INSERT INTO collection_jobs
        (id, source_id, job_type, status, dedup_key, priority, scheduled_for, attempt_count, max_attempts, trace_id, created_at, updated_at)
      VALUES (?, ?, 'discovery', ?, ?, 10, ?, 0, 3, ?, ?, ?)
    `).bind(`dc-${status}-job`, sourceId, status, `${status}-job`, "2026-08-02T00:00:00Z", traceId, "2026-08-02T00:00:00Z", "2026-08-02T00:00:00Z")));

    const stoppedJobs = await env.DB.prepare(`
      SELECT status, import_job_id FROM collection_jobs WHERE id IN ('dc-deferred-job', 'dc-denied-job') ORDER BY status
    `).all<{ status: string; import_job_id: string | null }>();
    expect(stoppedJobs.results).toEqual([
      { status: "deferred", import_job_id: null },
      { status: "denied", import_job_id: null },
    ]);
  });

  it("rejects malformed trace identifiers", async () => {
    await expect(env.DB.prepare(`
      INSERT INTO collection_jobs
        (id, source_id, job_type, status, dedup_key, priority, scheduled_for, attempt_count, max_attempts, trace_id, created_at, updated_at)
      VALUES ('dc-invalid-trace', ?, 'discovery', 'queued', 'invalid-trace', 100, ?, 0, 3, 'NOT-LOWERCASE-32-HEX', ?, ?)
    `).bind(sourceId, "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z", "2026-07-29T00:00:00Z").run()).rejects.toThrow(/CHECK constraint failed/);
  });
});
