import { env, exports } from "cloudflare:workers";
import { assertImportJsonLimits } from "../../worker/routes/imports";

const origin = "https://example.com";
const ingestionSecret = "test-only-ingestion-secret-32-characters-minimum";
const traceId = "89abcdef0123456789abcdef01234567";
const timestamp = "2026-07-29T12:00:00.000Z";

async function call(payload: unknown, overrides: { idempotencyKey?: string; rawBody?: string } = {}) {
  const body = overrides.rawBody ?? JSON.stringify(payload);
  const idempotencyKey = overrides.idempotencyKey
    ?? (payload && typeof payload === "object" && "idempotencyKey" in payload
      ? String((payload as { idempotencyKey: unknown }).idempotencyKey)
      : "missing-idempotency");
  return exports.default.fetch(new Request(`${origin}/api/v1/imports/batches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ingestionSecret}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      origin,
    },
    body,
  }));
}

async function responseBody<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function validV2(batchId = "v2-valid-batch") {
  return {
    schemaVersion: "2.0",
    batchId,
    idempotencyKey: `${batchId}-idempotency`,
    retrievalTimestamp: timestamp,
    traceId,
    traceparent: "00-89abcdef0123456789abcdef01234567-0123456789abcdef-01",
    source: {
      externalSourceId: "fixture-manufacturer",
      name: "Fixture Manufacturer",
      type: "manufacturer",
      baseUrl: "https://manufacturer.example",
      language: "en",
      countryOrRegion: "CA",
      policy: {
        robotsStatus: "allowed",
        termsStatus: "approved",
        reuseStatus: "metadata_and_facts",
      },
    },
    records: [{
      externalRecordId: "actuator-a-rev-a",
      recordType: "component",
      sourceUrl: "https://manufacturer.example/actuator-a",
      rawPayload: { name: "Actuator A", ratedTorque: "12 N.m" },
      parsedData: { name: "Actuator A", category: "actuator", manufacturerPartNumber: "A-12" },
      confidence: 0.97,
      provenance: {
        originalPublishedAt: "2026-07-01T00:00:00.000Z",
        lastSuccessfulCheckAt: timestamp,
        applicableRevision: "rev-a",
        extractionMethod: "fixture-json",
        scraperVersion: "collector-test-v1",
        copyrightReuseStatus: "metadata_and_facts",
      },
      snapshot: {
        sourceClass: "official",
        declaredMediaType: "application/json",
        detectedMediaType: "application/json",
        byteSize: 128,
        contentSha256: "a".repeat(64),
        immutableExternalUrl: "https://manufacturer.example/actuator-a?revision=rev-a",
        retrievalMetadata: { status: 200 },
      },
      claims: [{
        claimKey: "actuator.rated_torque",
        originalValue: "12 N.m",
        normalizedValue: 12,
        unit: "N.m",
        confidence: 0.97,
        evidenceLocator: "json:$.ratedTorque",
        classification: "official",
      }],
      lifecycleEvents: [{
        eventType: "observed",
        occurredAt: timestamp,
        reason: "fixture acquisition",
      }],
    }],
  };
}

function nestedObject(depth: number): Record<string, unknown> {
  let value: Record<string, unknown> = { leaf: true };
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

describe("external import contract v2", () => {
  it("stages universal provenance, snapshot, claims, lifecycle audit, and one trace", async () => {
    const payload = validV2();
    const response = await call(payload);
    expect(response.status).toBe(202);
    const result = await responseBody<{
      traceId: string;
      job: { id: string };
      records: Array<{ recordId: string; status: string }>;
    }>(response);
    expect(result.traceId).toBe(traceId);
    expect(result.records[0]?.status).toBe("staged");

    const lineage = await env.DB.prepare(`
      SELECT j.trace_id AS job_trace, r.trace_id AS record_trace, a.trace_id AS audit_trace,
             s.content_sha256, s.applicable_revision, s.retrieval_metadata_json, c.classification, c.evidence_locator
      FROM import_jobs AS j
      JOIN import_records AS r ON r.import_job_id = j.id
      JOIN import_audit_events AS a ON a.import_record_id = r.id
      JOIN source_snapshots AS s ON s.import_record_id = r.id
      JOIN field_claims AS c ON c.import_record_id = r.id
      WHERE j.id = ?
      ORDER BY a.created_at
      LIMIT 1
    `).bind(result.job.id).first<Record<string, unknown>>();
    expect(lineage).toMatchObject({
      job_trace: traceId,
      record_trace: traceId,
      audit_trace: traceId,
      content_sha256: "a".repeat(64),
      applicable_revision: "rev-a",
      classification: "official",
      evidence_locator: "json:$.ratedTorque",
    });
    expect(JSON.parse(String(lineage?.retrieval_metadata_json))).toMatchObject({
      externalSourceId: "fixture-manufacturer",
      lastSuccessfulCheckAt: timestamp,
      scraperVersion: "collector-test-v1",
      traceparent: "00-89abcdef0123456789abcdef01234567-0123456789abcdef-01",
    });

    const lifecycleAudit = await env.DB.prepare(`
      SELECT event_type FROM import_audit_events
      WHERE import_job_id = ? AND event_type = 'record.lifecycle.observed'
    `).bind(result.job.id).first<{ event_type: string }>();
    expect(lifecycleAudit?.event_type).toBe("record.lifecycle.observed");
  });

  it("rejects malformed trace context and invalid evidence classes without partial records", async () => {
    const malformedTrace = validV2("v2-malformed-trace");
    malformedTrace.traceId = "NOT-A-TRACE";
    const traceResponse = await call(malformedTrace);
    expect(traceResponse.status).toBe(422);
    expect(await responseBody<{ error: { code: string } }>(traceResponse)).toMatchObject({ error: { code: "INVALID_TRACE_ID" } });

    const malformedParent = validV2("v2-malformed-traceparent");
    malformedParent.traceparent = "not-w3c";
    const parentResponse = await call(malformedParent);
    expect(parentResponse.status).toBe(422);
    expect(await responseBody<{ error: { code: string } }>(parentResponse)).toMatchObject({ error: { code: "INVALID_TRACEPARENT" } });

    const invalidClaim = validV2("v2-invalid-claim");
    invalidClaim.records[0]!.claims[0]!.classification = "manufacturer_claim" as "official";
    const claimResponse = await call(invalidClaim);
    expect(claimResponse.status).toBe(422);
    const claimJob = await env.DB.prepare("SELECT id FROM import_jobs WHERE batch_id = ?").bind(invalidClaim.batchId).first();
    expect(claimJob).toBeNull();

    const unsupported = validV2("v2-unsupported-record");
    unsupported.records[0]!.recordType = "unknown_robot_fact" as "component";
    const unsupportedResponse = await call(unsupported);
    expect(unsupportedResponse.status).toBe(422);
    expect(await responseBody<{ error: { code: string } }>(unsupportedResponse))
      .toMatchObject({ error: { code: "UNSUPPORTED_RECORD_TYPE" } });

    const arbitraryRetainedKey = validV2("v2-arbitrary-retained-key");
    (arbitraryRetainedKey.records[0]!.snapshot as Record<string, unknown>).retainedObjectKey = "source-evidence/caller-selected";
    const retainedKeyResponse = await call(arbitraryRetainedKey);
    expect(retainedKeyResponse.status).toBe(422);
  });

  it("distinguishes exact replay from an idempotency conflict", async () => {
    const payload = validV2("v2-idempotency");
    expect((await call(payload)).status).toBe(202);
    const duplicate = await call(payload);
    expect(duplicate.status).toBe(200);
    expect(await responseBody<{ duplicate: boolean }>(duplicate)).toMatchObject({ duplicate: true });

    const reordered = structuredClone(payload);
    reordered.records[0]!.rawPayload = { ratedTorque: "12 N.m", name: "Actuator A" };
    reordered.records[0]!.parsedData = {
      manufacturerPartNumber: "A-12",
      category: "actuator",
      name: "Actuator A",
    };
    const normalizedDuplicate = await call(reordered);
    expect(normalizedDuplicate.status).toBe(200);
    expect(await responseBody<{ duplicate: boolean }>(normalizedDuplicate)).toMatchObject({ duplicate: true });

    const changed = structuredClone(payload);
    changed.records[0]!.confidence = 0.5;
    const conflict = await call(changed);
    expect(conflict.status).toBe(409);
    expect(await responseBody<{ error: { code: string } }>(conflict)).toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  it("claims a new source and import job once under concurrent replay", async () => {
    const payload = validV2("v2-concurrent-replay");
    payload.source.name = "Concurrent Replay Manufacturer";
    payload.source.externalSourceId = "concurrent-replay-manufacturer";

    const responses = await Promise.all([
      call(structuredClone(payload)),
      call(structuredClone(payload)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 202]);

    const jobs = await env.DB.prepare(`
      SELECT count(*) AS count
      FROM import_jobs AS j
      JOIN import_sources AS s ON s.id = j.source_id
      WHERE s.slug = 'concurrent-replay-manufacturer' AND j.batch_id = ?
    `).bind(payload.batchId).first<{ count: number }>();
    expect(jobs?.count).toBe(1);
  });

  it("keeps untrusted source assertions from superseding an approved policy revision", async () => {
    const first = validV2("v2-policy-lane-first");
    first.records[0]!.externalRecordId = "policy-lane-first";
    expect((await call(first)).status).toBe(202);
    const source = await env.DB.prepare("SELECT id FROM import_sources WHERE slug = 'fixture-manufacturer'")
      .first<{ id: string }>();
    expect(source).not.toBeNull();

    const approvedPolicyId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO source_policy_revisions
        (id, source_id, robots_status, robots_checked_at, terms_status, reuse_status, decision, decision_notes,
         approval_authority_reference, effective_at, created_at)
      VALUES (?, ?, 'allowed', ?, 'approved', 'retention_approved', 'approved_fixture_only',
              'Independent approved fixture policy', 'tests/worker/import-contract-v2.test.ts', ?, ?)
    `).bind(approvedPolicyId, source!.id, timestamp, timestamp, timestamp).run();

    const second = validV2("v2-policy-lane-second");
    second.records[0]!.externalRecordId = "policy-lane-second";
    expect((await call(second)).status).toBe(202);
    const superseded = await env.DB.prepare(`
      SELECT count(*) AS value FROM source_policy_revisions WHERE supersedes_policy_revision_id = ?
    `).bind(approvedPolicyId).first<{ value: number }>();
    expect(superseded?.value).toBe(0);
  });

  it("enforces exact v1 compatibility boundaries independent of Content-Length", () => {
    expect(() => assertImportJsonLimits({}, 1_048_576, "1.0")).not.toThrow();
    expect(() => assertImportJsonLimits({}, 1_048_577, "1.0")).toThrowError(expect.objectContaining({ code: "PAYLOAD_TOO_LARGE" }));

    expect(() => assertImportJsonLimits({ rawPayload: "x".repeat(65_534) }, 100, "1.0")).not.toThrow();
    expect(() => assertImportJsonLimits({ rawPayload: "x".repeat(65_535) }, 100, "1.0"))
      .toThrowError(expect.objectContaining({ code: "RAW_PAYLOAD_TOO_LARGE" }));

    expect(() => assertImportJsonLimits(nestedObject(9), 100, "1.0")).not.toThrow();
    expect(() => assertImportJsonLimits(nestedObject(10), 100, "1.0"))
      .toThrowError(expect.objectContaining({ code: "OBJECT_TOO_DEEP" }));

    expect(() => assertImportJsonLimits(Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`p${index}`, index])), 100, "1.0")).not.toThrow();
    expect(() => assertImportJsonLimits(Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`p${index}`, index])), 100, "1.0"))
      .toThrowError(expect.objectContaining({ code: "TOO_MANY_PROPERTIES" }));
  });

  it("returns the stable import payload error when Content-Length proves the body is over 1 MiB", async () => {
    const response = await exports.default.fetch(new Request(`${origin}/api/v1/imports/batches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ingestionSecret}`,
        "content-length": "1048577",
        "content-type": "application/json",
        "idempotency-key": "oversized-body-idempotency",
        origin,
      },
      body: "{}",
    }));
    expect(response.status).toBe(413);
    expect(await responseBody<{ error: { code: string } }>(response)).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  it("rejects nonexistent and entity-type-mismatched canonical references before staging", async () => {
    const manufacturerId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO manufacturers
        (id, slug, name, status, is_demo, created_at, updated_at)
      VALUES (?, 'wrong-type-reference', 'Wrong type reference', 'unverified', 0, ?, ?)
    `).bind(manufacturerId, now, now).run();

    const base = {
      schemaVersion: "1.0",
      batchId: "v1-canonical-reference",
      idempotencyKey: "v1-canonical-reference-idempotency",
      retrievalTimestamp: timestamp,
      source: { name: "Canonical Reference Fixture", type: "test" },
      records: [{
        externalRecordId: "offer-invalid-reference",
        recordType: "offer",
        sourceUrl: "https://example.com/offer",
        rawPayload: {},
        parsedData: {
          supplierExternalId: "supplier-external",
          componentExternalId: "component-external",
          supplierCanonicalId: crypto.randomUUID(),
          componentCanonicalId: manufacturerId,
          currency: "USD",
          unitPriceMinor: 100,
          observedAt: timestamp,
        },
        confidence: 1,
      }],
    };
    const response = await call(base);
    expect(response.status).toBe(422);
    const outcome = await responseBody<{ records: Array<{ errors?: Array<{ code: string }> }> }>(response);
    expect(outcome.records[0]?.errors?.map((error) => error.code)).toContain("CANONICAL_REFERENCE_NOT_FOUND");
    const record = await env.DB.prepare("SELECT id FROM import_records WHERE external_record_id = 'offer-invalid-reference'").first();
    expect(record).toBeNull();

    const mismatch = structuredClone(base);
    mismatch.batchId = "v1-canonical-type-mismatch";
    mismatch.idempotencyKey = "v1-canonical-type-mismatch-idempotency";
    mismatch.records[0]!.externalRecordId = "offer-wrong-type-reference";
    delete mismatch.records[0]!.parsedData.supplierCanonicalId;
    mismatch.records[0]!.parsedData.componentCanonicalId = manufacturerId;
    const mismatchResponse = await call(mismatch);
    expect(mismatchResponse.status).toBe(422);
    const mismatchOutcome = await responseBody<{ records: Array<{ errors?: Array<{ code: string }> }> }>(mismatchResponse);
    expect(mismatchOutcome.records[0]?.errors?.map((error) => error.code)).toContain("CANONICAL_REFERENCE_TYPE_MISMATCH");
    expect(await env.DB.prepare("SELECT id FROM import_records WHERE external_record_id = 'offer-wrong-type-reference'").first()).toBeNull();
  });

  it("puts every non-staged legacy reference type into explicit mandatory review", async () => {
    const payload = {
      schemaVersion: "1.0",
      batchId: "v1-reference-disposition",
      idempotencyKey: "v1-reference-disposition-idempotency",
      retrievalTimestamp: timestamp,
      source: { name: "Reference Disposition Fixture", type: "test" },
      records: [
        { externalRecordId: "evidence-ref", recordType: "evidence", sourceUrl: "https://example.com/evidence", rawPayload: {}, parsedData: { title: "Evidence", sourceType: "datasheet" }, confidence: 0.8 },
        { externalRecordId: "teardown-ref", recordType: "teardown", sourceUrl: "https://example.com/teardown", rawPayload: {}, parsedData: { title: "Teardown" }, confidence: 0.8 },
        { externalRecordId: "robot-ref", recordType: "commercial_robot", sourceUrl: "https://example.com/robot", rawPayload: {}, parsedData: { name: "Robot" }, confidence: 0.8 },
        { externalRecordId: "market-ref", recordType: "marketplace_reference", sourceUrl: "https://example.com/listing", rawPayload: {}, parsedData: { title: "Listing" }, confidence: 0.8 },
      ],
    };
    const response = await call(payload);
    expect(response.status).toBe(202);
    const rows = await env.DB.prepare(`
      SELECT record_type, status FROM import_records
      WHERE import_job_id = (SELECT id FROM import_jobs WHERE batch_id = ?)
      ORDER BY record_type
    `).bind(payload.batchId).all<{ record_type: string; status: string }>();
    expect(rows.results).toEqual([
      { record_type: "commercial_robot", status: "review" },
      { record_type: "evidence", status: "review" },
      { record_type: "marketplace_reference", status: "review" },
      { record_type: "teardown", status: "review" },
    ]);
  });

  it("records withdrawal as a new event without rewriting the prior record", async () => {
    const original = {
      schemaVersion: "1.0",
      batchId: "v1-withdrawal-original",
      idempotencyKey: "v1-withdrawal-original-idempotency",
      retrievalTimestamp: timestamp,
      source: { name: "Withdrawal Fixture", type: "test" },
      records: [{
        externalRecordId: "withdrawable-component",
        recordType: "component",
        sourceUrl: "https://example.com/component",
        rawPayload: {},
        parsedData: { name: "Withdrawable component", category: "actuator" },
        confidence: 0.8,
      }],
    };
    expect((await call(original)).status).toBe(202);
    const withdrawal = {
      ...structuredClone(original),
      batchId: "v1-withdrawal-event",
      idempotencyKey: "v1-withdrawal-event-idempotency",
      records: [{
        ...structuredClone(original.records[0]),
        externalRecordId: "withdrawable-component-withdrawal",
        action: "withdraw",
        withdrawalOfExternalRecordId: "withdrawable-component",
      }],
    };
    expect((await call(withdrawal)).status).toBe(202);
    const rows = await env.DB.prepare(`
      SELECT external_record_id, status, withdrawal_of_record_id
      FROM import_records
      WHERE source_id = (SELECT id FROM import_sources WHERE slug = 'withdrawal-fixture')
      ORDER BY created_at, external_record_id
    `).all<{ external_record_id: string; status: string; withdrawal_of_record_id: string | null }>();
    expect(rows.results).toEqual([
      { external_record_id: "withdrawable-component", status: "staged", withdrawal_of_record_id: null },
      {
        external_record_id: "withdrawable-component-withdrawal",
        status: "withdrawn",
        withdrawal_of_record_id: expect.any(String),
      },
    ]);
  });
});
