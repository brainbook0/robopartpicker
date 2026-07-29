import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

const origin = "https://example.com";
const ingestionSecret = "test-only-ingestion-secret-32-characters-minimum";
const traceId = "1234567890abcdef1234567890abcdef";
const now = "2026-07-29T16:00:00.000Z";
let adminCookie = "";
let moderatorCookie = "";
let ordinaryCookie = "";
let adminId = "";
const recordIds = new Map<string, string>();

function cookies(response: Response): string {
  const values = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? [response.headers.get("set-cookie") ?? ""];
  return values.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function call(path: string, init: RequestInit = {}, cookie = "") {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}

function body(value: unknown) {
  return JSON.stringify(value);
}

function record(externalRecordId: string, claims = [{
  claimKey: "actuator.rated_torque",
  originalValue: "12 N.m",
  normalizedValue: 12,
  unit: "N.m",
  confidence: 0.95,
  evidenceLocator: "json:$.ratedTorque",
  classification: "official",
}]) {
  return {
    externalRecordId,
    recordType: "component",
    sourceUrl: `https://review.example/${externalRecordId}`,
    rawPayload: { name: externalRecordId, notes: "x".repeat(20_000) },
    parsedData: {
      name: externalRecordId.replaceAll("-", " "),
      category: "actuator",
      manufacturerPartNumber: externalRecordId.toUpperCase(),
    },
    confidence: 0.9,
    provenance: {
      lastSuccessfulCheckAt: now,
      applicableRevision: "rev-a",
      extractionMethod: "fixture-json",
      scraperVersion: "review-fixture-v1",
      copyrightReuseStatus: "metadata_and_facts",
    },
    snapshot: {
      sourceClass: "official",
      declaredMediaType: "application/json",
      detectedMediaType: "application/json",
      byteSize: 20_100,
      contentSha256: "b".repeat(64),
      immutableExternalUrl: `https://review.example/${externalRecordId}?revision=rev-a`,
      retrievalMetadata: { status: 200 },
    },
    claims,
    lifecycleEvents: [{ eventType: "observed", occurredAt: now, reason: "review fixture" }],
  };
}

beforeAll(async () => {
  for (const [name, email] of [
    ["Review Admin", "review-admin@example.com"],
    ["Review Moderator", "review-moderator@example.com"],
    ["Review Ordinary", "review-ordinary@example.com"],
  ]) {
    const response = await call("/api/auth/sign-up/email", {
      method: "POST",
      body: body({ name, email, password: "correct-horse-battery" }),
    });
    expect(response.status).toBe(200);
    const cookie = cookies(response);
    const user = await json<{ user: { id: string } }>(response);
    if (email.includes("admin")) {
      adminCookie = cookie;
      adminId = user.user.id;
    } else if (email.includes("moderator")) {
      moderatorCookie = cookie;
      await env.DB.prepare(`
        INSERT INTO platform_user_roles (user_id, role, granted_by_user_id, granted_at)
        VALUES (?, 'moderator', ?, ?)
      `).bind(user.user.id, adminId, now).run();
    } else {
      ordinaryCookie = cookie;
    }
  }
  await env.DB.prepare(`
    INSERT INTO platform_user_roles (user_id, role, granted_by_user_id, granted_at)
    VALUES (?, 'administrator', ?, ?)
  `).bind(adminId, adminId, now).run();

  const conflictClaims = [
    {
      claimKey: "actuator.rated_torque",
      originalValue: "12 N.m",
      normalizedValue: 12,
      unit: "N.m",
      confidence: 0.95,
      evidenceLocator: "json:$.ratedTorque",
      classification: "official",
    },
    {
      claimKey: "actuator.rated_torque",
      originalValue: "11.4 N.m",
      normalizedValue: 11.4,
      unit: "N.m",
      confidence: 0.7,
      evidenceLocator: "ai:comparison",
      classification: "ai_inferred",
    },
  ];
  const payload = {
    schemaVersion: "2.0",
    batchId: "review-v2-batch",
    idempotencyKey: "review-v2-batch-idempotency",
    retrievalTimestamp: now,
    traceId,
    source: {
      externalSourceId: "review-fixture",
      name: "Review Fixture",
      type: "manufacturer",
      baseUrl: "https://review.example",
      language: "en",
      countryOrRegion: "CA",
      policy: {
        robotsStatus: "allowed",
        termsStatus: "approved",
        reuseStatus: "metadata_and_facts",
      },
    },
    records: [
      record("approve-component"),
      record("reject-component"),
      record("defer-component"),
      record("conflict-component", conflictClaims),
    ],
  };
  const response = await call("/api/v1/imports/batches", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ingestionSecret}`,
      "content-type": "application/json",
      "idempotency-key": payload.idempotencyKey,
    },
    body: body(payload),
  });
  expect(response.status).toBe(202);
  const result = await json<{ records: Array<{ externalRecordId: string; recordId: string }> }>(response);
  for (const item of result.records) recordIds.set(item.externalRecordId, item.recordId);
});

describe("v2 import review authorization and detail", () => {
  it("allows moderator detail but denies anonymous and ordinary users", async () => {
    const id = recordIds.get("approve-component")!;
    expect((await call(`/api/v1/admin/import-records/${id}`)).status).toBe(401);
    expect((await call(`/api/v1/admin/import-records/${id}`, {}, ordinaryCookie)).status).toBe(403);
    expect((await call(`/api/v1/admin/import-records/${id}`, {}, moderatorCookie)).status).toBe(200);
  });

  it("returns bounded provenance, AI labels, conflicts context, trace, and a deterministic diff", async () => {
    const id = recordIds.get("conflict-component")!;
    const response = await call(`/api/v1/admin/import-records/${id}`, {}, moderatorCookie);
    expect(response.status).toBe(200);
    const detail = await json<{
      record: { id: string; traceId: string; reviewState: string };
      claims: Array<{ id: string; classification: string }>;
      evidence: Array<Record<string, unknown>>;
      previews: Array<{ text: string; truncated: boolean; byteSize: number }>;
      proposedMutation: { diff: Record<string, unknown>; hash: string };
    }>(response);
    expect(detail.record).toMatchObject({ id, traceId, reviewState: "pending" });
    expect(detail.claims.map((claim) => claim.classification)).toEqual(["ai_inferred", "official"]);
    expect(detail.evidence[0]).not.toHaveProperty("retainedObjectKey");
    expect(detail.previews[0]!.truncated).toBe(true);
    expect(new TextEncoder().encode(detail.previews[0]!.text).byteLength).toBeLessThanOrEqual(16_384);
    expect(detail.previews.reduce((total, item) => total + item.byteSize, 0)).toBeLessThanOrEqual(65_536);
    expect(detail.proposedMutation.hash).toMatch(/^[0-9a-f]{64}$/u);

    const repeat = await json<typeof detail>(await call(`/api/v1/admin/import-records/${id}`, {}, adminCookie));
    expect(repeat.proposedMutation).toEqual(detail.proposedMutation);
  });
});

describe("v2 import review decisions", () => {
  it("rejects a stale approval and applies the refreshed displayed mutation", async () => {
    const id = recordIds.get("approve-component")!;
    const initial = await json<{ proposedMutation: { hash: string } }>(
      await call(`/api/v1/admin/import-records/${id}`, {}, adminCookie),
    );
    await env.DB.prepare(`
      UPDATE import_records SET parsed_data_json = json_set(parsed_data_json, '$.summary', 'changed after preview')
      WHERE id = ?
    `).bind(id).run();
    const stale = await call(`/api/v1/admin/import-records/${id}/approve`, {
      method: "POST",
      body: body({ decision: "create", expectedDiffHash: initial.proposedMutation.hash }),
    }, adminCookie);
    expect(stale.status).toBe(409);
    expect((await json<{ error: { code: string } }>(stale)).error.code).toBe("STALE_REVIEW_DIFF");
    expect(await env.DB.prepare("SELECT id FROM components WHERE id = ?").bind(id).first()).toBeNull();

    const refreshed = await json<{ proposedMutation: { hash: string } }>(
      await call(`/api/v1/admin/import-records/${id}`, {}, adminCookie),
    );
    const approved = await call(`/api/v1/admin/import-records/${id}/approve`, {
      method: "POST",
      body: body({ decision: "create", expectedDiffHash: refreshed.proposedMutation.hash }),
    }, adminCookie);
    expect(approved.status).toBe(200);
    expect(await env.DB.prepare("SELECT id FROM components WHERE id = ?").bind(id).first()).toEqual({ id });
    expect(await env.DB.prepare(`
      SELECT trace_id FROM import_audit_events
      WHERE import_record_id = ? AND event_type = 'record.approved'
    `).bind(id).first()).toEqual({ trace_id: traceId });
  });

  it("keeps reject, defer, and conflict actions out of canonical tables and preserves trace", async () => {
    const before = Number((await env.DB.prepare("SELECT count(*) AS value FROM components").first<{ value: number }>())?.value);
    const rejectedId = recordIds.get("reject-component")!;
    const deferredId = recordIds.get("defer-component")!;
    const conflictId = recordIds.get("conflict-component")!;

    expect((await call(`/api/v1/admin/import-records/${rejectedId}/reject`, {
      method: "POST",
      body: body({ reason: "Fixture lacks sufficient revision evidence." }),
    }, adminCookie)).status).toBe(200);
    expect((await call(`/api/v1/admin/import-records/${deferredId}/defer`, {
      method: "POST",
      body: body({ reason: "Awaiting a second source.", reviewAfter: "2026-08-05T00:00:00.000Z" }),
    }, adminCookie)).status).toBe(200);

    const detail = await json<{ claims: Array<{ id: string }> }>(
      await call(`/api/v1/admin/import-records/${conflictId}`, {}, adminCookie),
    );
    expect((await call(`/api/v1/admin/import-records/${conflictId}/conflicts`, {
      method: "POST",
      body: body({
        claimIds: detail.claims.map((claim) => claim.id),
        conflictType: "reported_value_disagreement",
      }),
    }, adminCookie)).status).toBe(201);

    const after = Number((await env.DB.prepare("SELECT count(*) AS value FROM components").first<{ value: number }>())?.value);
    expect(after).toBe(before);
    expect(await env.DB.prepare("SELECT status FROM import_records WHERE id = ?").bind(rejectedId).first())
      .toEqual({ status: "rejected" });
    expect(await env.DB.prepare("SELECT status FROM import_records WHERE id = ?").bind(deferredId).first())
      .toEqual({ status: "review" });
    expect(await env.DB.prepare("SELECT status FROM import_records WHERE id = ?").bind(conflictId).first())
      .toEqual({ status: "review" });
    const actions = await env.DB.prepare(`
      SELECT event_type, trace_id FROM import_audit_events
      WHERE import_record_id IN (?, ?, ?)
        AND event_type IN ('record.rejected', 'record.deferred', 'record.conflict_recorded')
      ORDER BY event_type
    `).bind(rejectedId, deferredId, conflictId).all();
    expect(actions.results).toEqual([
      { event_type: "record.conflict_recorded", trace_id: traceId },
      { event_type: "record.deferred", trace_id: traceId },
      { event_type: "record.rejected", trace_id: traceId },
    ]);
  });

  it("keeps moderator mutation access denied", async () => {
    const id = recordIds.get("defer-component")!;
    expect((await call(`/api/v1/admin/import-records/${id}/defer`, {
      method: "POST",
      body: body({ reason: "Moderator cannot mutate review state." }),
    }, moderatorCookie)).status).toBe(403);
    expect((await call(`/api/v1/admin/import-records/${id}/reject`, {
      method: "POST",
      body: body({ reason: "Moderator cannot reject reviewed data." }),
    }, moderatorCookie)).status).toBe(403);
  });
});
