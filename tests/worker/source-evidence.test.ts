import { env, exports } from "cloudflare:workers";
import { EVIDENCE_CLASS_LIMITS, validateRetainedEvidence } from "../../worker/services/source-evidence";

const origin = "https://example.com";
const ingestionSecret = "test-only-ingestion-secret-32-characters-minimum";
const sourceId = "source-evidence-fixture";
const policyId = "source-evidence-policy-fixture";
const deniedPolicyId = "source-evidence-policy-denied";
let administratorCookie = "";
let ordinaryCookie = "";

async function call(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function cookies(response: Response): string {
  const values = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.()
    ?? [response.headers.get("set-cookie") ?? ""];
  return values.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function retainedManifest(contentSha256: string, byteSize: number) {
  return {
    schemaVersion: "1.0",
    externalRegistrationId: `fixture-${contentSha256}`,
    mode: "retained_bytes",
    sourceId,
    sourcePolicyRevisionId: policyId,
    sourceClass: "official",
    evidenceClass: "structured_text",
    sourceUrl: "https://manufacturer.example/datasheet",
    retrievedAt: "2026-07-29T12:00:00.000Z",
    applicableRevision: "rev-a",
    declaredMediaType: "text/plain",
    detectedMediaType: "text/plain",
    byteSize,
    contentSha256,
    retrievalMetadata: { status: 200, collector: "fixture-v1" },
    copyrightReuseStatus: "retention_approved",
  };
}

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO import_sources
      (id, slug, name, source_type, base_url, priority, trust_weight, status, service_credential_id, created_at, updated_at)
      VALUES (?, 'source-evidence-fixture', 'Source Evidence Fixture', 'manufacturer', 'https://manufacturer.example',
              1, 1, 'active', 'ingestion-secret', ?, ?)`).bind(sourceId, now, now),
    env.DB.prepare(`INSERT INTO source_collection_profiles
      (source_id, source_tier, policy_state, enabled, access_method, cadence_class, freshness_target_seconds, created_at, updated_at)
      VALUES (?, 'official_manufacturer', 'approved_fixture_only', 0, 'fixture', 'manual', 86400, ?, ?)`)
      .bind(sourceId, now, now),
    env.DB.prepare(`INSERT INTO source_policy_revisions
      (id, source_id, robots_status, robots_checked_at, terms_status, reuse_status, decision, decision_notes,
       approval_authority_reference, effective_at, created_at)
      VALUES (?, ?, 'allowed', ?, 'approved', 'retention_approved', 'approved_fixture_only',
              'Test fixture policy', 'tests/worker/source-evidence.test.ts', ?, ?)`)
      .bind(policyId, sourceId, now, now, now),
    env.DB.prepare(`INSERT INTO source_policy_revisions
      (id, source_id, robots_status, robots_checked_at, terms_status, reuse_status, decision, decision_notes,
       approval_authority_reference, effective_at, created_at)
      VALUES (?, ?, 'disallowed', ?, 'denied', 'denied', 'denied',
              'Denied test fixture policy', 'tests/worker/source-evidence.test.ts', ?, ?)`)
      .bind(deniedPolicyId, sourceId, now, now, now),
  ]);

  const suffix = crypto.randomUUID();
  const administrator = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "Evidence Administrator", email: `evidence-admin-${suffix}@example.com`, password: "correct-horse-battery" }),
  });
  expect(administrator.status).toBe(200);
  administratorCookie = cookies(administrator);
  const administratorId = (await json<{ user: { id: string } }>(administrator)).user.id;
  await env.DB.prepare(`INSERT INTO platform_user_roles (user_id, role, granted_by_user_id, granted_at)
    VALUES (?, 'administrator', ?, ?)`).bind(administratorId, administratorId, now).run();

  const ordinary = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "Evidence Reader", email: `evidence-reader-${suffix}@example.com`, password: "correct-horse-battery" }),
  });
  expect(ordinary.status).toBe(200);
  ordinaryCookie = cookies(ordinary);
});

describe.sequential("immutable source evidence", () => {
  it("streams checksum-verified bytes to one content-addressed object and registers one immutable snapshot", async () => {
    const bytes = new TextEncoder().encode("rated torque: 12 N.m");
    const hash = await sha256(bytes);
    const uploadPath = `/api/v1/source-evidence/objects/${hash}`;
    const headers = {
      authorization: `Bearer ${ingestionSecret}`,
      "content-type": "text/plain",
      "content-length": String(bytes.byteLength),
      "x-detected-media-type": "text/plain",
      "x-evidence-class": "structured_text",
      "x-source-policy-revision-id": policyId,
      "x-source-url": "https://manufacturer.example/datasheet",
    };

    const uploaded = await call(uploadPath, { method: "PUT", headers, body: bytes });
    expect(uploaded.status).toBe(201);
    const uploadResult = await json<{ deduplicated: boolean; object: { retainedObjectKey: string } }>(uploaded);
    expect(uploadResult).toMatchObject({
      deduplicated: false,
      object: { retainedObjectKey: `source-evidence/sha256/${hash.slice(0, 2)}/${hash}` },
    });

    const duplicateUpload = await call(uploadPath, { method: "PUT", headers, body: bytes });
    expect(duplicateUpload.status).toBe(200);
    expect(await json<{ deduplicated: boolean }>(duplicateUpload)).toMatchObject({ deduplicated: true });

    const registered = await call("/api/v1/source-evidence/registrations", {
      method: "POST",
      headers: { authorization: `Bearer ${ingestionSecret}` },
      body: JSON.stringify(retainedManifest(hash, bytes.byteLength)),
    });
    expect(registered.status).toBe(201);
    const registration = await json<{ duplicate: boolean; snapshot: { id: string; retentionState: string } }>(registered);
    expect(registration).toMatchObject({ duplicate: false, snapshot: { retentionState: "retained" } });

    const duplicateRegistration = await call("/api/v1/source-evidence/registrations", {
      method: "POST",
      headers: { authorization: `Bearer ${ingestionSecret}` },
      body: JSON.stringify(retainedManifest(hash, bytes.byteLength)),
    });
    expect(duplicateRegistration.status).toBe(200);
    expect(await json<{ duplicate: boolean }>(duplicateRegistration)).toMatchObject({ duplicate: true });

    const count = await env.DB.prepare("SELECT count(*) AS value FROM source_snapshots WHERE id = ?")
      .bind(registration.snapshot.id).first<{ value: number }>();
    expect(count?.value).toBe(1);
  });

  it("fails closed for denied retention, MIME mismatch, oversized classes, and non-retainable media", async () => {
    const bytes = new TextEncoder().encode("bounded");
    const hash = await sha256(bytes);
    const baseHeaders = {
      authorization: `Bearer ${ingestionSecret}`,
      "content-type": "text/plain",
      "content-length": String(bytes.byteLength),
      "x-detected-media-type": "text/plain",
      "x-evidence-class": "structured_text",
      "x-source-policy-revision-id": policyId,
      "x-source-url": "https://manufacturer.example/datasheet",
    };

    const mismatch = await call(`/api/v1/source-evidence/objects/${hash}`, {
      method: "PUT",
      headers: { ...baseHeaders, "x-detected-media-type": "application/pdf" },
      body: bytes,
    });
    expect(mismatch.status).toBe(422);

    const oversized = await call(`/api/v1/source-evidence/objects/${hash}`, {
      method: "PUT",
      headers: { ...baseHeaders, "content-length": String(8 * 1024 * 1024 + 1) },
      body: bytes,
    });
    expect(oversized.status).toBe(413);

    const media = await call(`/api/v1/source-evidence/objects/${hash}`, {
      method: "PUT",
      headers: { ...baseHeaders, "x-evidence-class": "media_or_other" },
      body: bytes,
    });
    expect(media.status).toBe(422);

    const denied = await call(`/api/v1/source-evidence/objects/${hash}`, {
      method: "PUT",
      headers: { ...baseHeaders, "x-source-policy-revision-id": deniedPolicyId },
      body: bytes,
    });
    expect(denied.status).toBe(403);
    expect(await env.FILES.head(`source-evidence/sha256/${hash.slice(0, 2)}/${hash}`)).toBeNull();

    const wrongOrigin = await call(`/api/v1/source-evidence/objects/${hash}`, {
      method: "PUT",
      headers: { ...baseHeaders, "x-source-url": "https://unapproved.example/datasheet" },
      body: bytes,
    });
    expect(wrongOrigin.status).toBe(403);
  });

  it("enforces every retained-class boundary and records non-retained dispositions without hidden uploads", async () => {
    const cases = [
      ["structured_text", "text/plain"],
      ["document", "application/pdf"],
      ["image", "image/png"],
      ["archive_or_cad", "model/step"],
    ] as const;
    for (const [evidenceClass, mediaType] of cases) {
      const limit = EVIDENCE_CLASS_LIMITS[evidenceClass]!;
      expect(validateRetainedEvidence(evidenceClass, mediaType, mediaType, limit)).toMatchObject({ limit, mediaType });
      expect(() => validateRetainedEvidence(evidenceClass, mediaType, mediaType, limit + 1))
        .toThrow(expect.objectContaining({ code: "EVIDENCE_TOO_LARGE" }));
    }

    const externalHash = "b".repeat(64);
    const external = {
      ...retainedManifest(externalHash, 500 * 1024 * 1024),
      externalRegistrationId: "external-video-fixture",
      mode: "external_reference",
      evidenceClass: "media_or_other",
      declaredMediaType: "video/mp4",
      detectedMediaType: "video/mp4",
      immutableExternalUrl: "https://manufacturer.example/watch/fixture#ignored",
    };
    const externalResponse = await call("/api/v1/source-evidence/registrations", {
      method: "POST",
      headers: { authorization: `Bearer ${ingestionSecret}` },
      body: JSON.stringify(external),
    });
    expect(externalResponse.status).toBe(201);
    expect(await json<{ snapshot: { retentionState: string; immutableExternalUrl: string } }>(externalResponse)).toMatchObject({
      snapshot: {
        retentionState: "external_reference",
        immutableExternalUrl: "https://manufacturer.example/watch/fixture",
      },
    });

    const wrongOriginExternal = {
      ...external,
      externalRegistrationId: "external-video-wrong-origin",
      immutableExternalUrl: "https://unapproved.example/watch/fixture",
    };
    const wrongOriginExternalResponse = await call("/api/v1/source-evidence/registrations", {
      method: "POST",
      headers: { authorization: `Bearer ${ingestionSecret}` },
      body: JSON.stringify(wrongOriginExternal),
    });
    expect(wrongOriginExternalResponse.status).toBe(403);

    const rejected = {
      ...retainedManifest("c".repeat(64), 0),
      externalRegistrationId: "rejected-policy-fixture",
      mode: "rejected",
      sourcePolicyRevisionId: deniedPolicyId,
      evidenceClass: "media_or_other",
      declaredMediaType: "application/octet-stream",
      detectedMediaType: "application/octet-stream",
      rejectionCode: "POLICY_DENIED",
      rejectionReason: "The current policy does not authorize retention or extraction.",
    };
    const rejectedResponse = await call("/api/v1/source-evidence/registrations", {
      method: "POST",
      headers: { authorization: `Bearer ${ingestionSecret}` },
      body: JSON.stringify(rejected),
    });
    expect(rejectedResponse.status).toBe(201);
    expect(await json<{ snapshot: { retentionState: string } }>(rejectedResponse))
      .toMatchObject({ snapshot: { retentionState: "rejected" } });
  });

  it("keeps evidence metadata and bytes behind platform-role authorization", async () => {
    const snapshot = await env.DB.prepare("SELECT id FROM source_snapshots WHERE source_id = ? AND retention_state = 'retained' ORDER BY created_at DESC LIMIT 1")
      .bind(sourceId).first<{ id: string }>();
    expect(snapshot).not.toBeNull();

    const anonymous = await call(`/api/v1/admin/source-evidence/${snapshot!.id}`);
    expect(anonymous.status).toBe(401);
    const denied = await call(`/api/v1/admin/source-evidence/${snapshot!.id}`, {}, ordinaryCookie);
    expect(denied.status).toBe(403);

    const metadata = await call(`/api/v1/admin/source-evidence/${snapshot!.id}`, {}, administratorCookie);
    expect(metadata.status).toBe(200);
    const metadataBody = await json<{ snapshot: Record<string, unknown> }>(metadata);
    expect(metadataBody.snapshot).not.toHaveProperty("retainedObjectKey");
    expect(metadataBody.snapshot).toHaveProperty("contentUrl");

    const content = await call(`/api/v1/admin/source-evidence/${snapshot!.id}/content`, {}, administratorCookie);
    expect(content.status).toBe(200);
    expect(await content.text()).toBe("rated torque: 12 N.m");
  });

  it("records takedown as append-only revisions and lifecycle events before restricting bytes", async () => {
    const retained = await env.DB.prepare(`
      SELECT id, retained_object_key FROM source_snapshots
      WHERE source_id = ? AND retention_state = 'retained'
      ORDER BY created_at DESC LIMIT 1
    `).bind(sourceId).first<{ id: string; retained_object_key: string }>();
    expect(retained).not.toBeNull();

    const ordinaryDenied = await call(`/api/v1/admin/source-evidence/${retained!.id}/retention`, {
      method: "POST",
      body: JSON.stringify({ toState: "takedown_pending", reason: "Fixture takedown request" }),
    }, ordinaryCookie);
    expect(ordinaryDenied.status).toBe(403);

    const pendingResponse = await call(`/api/v1/admin/source-evidence/${retained!.id}/retention`, {
      method: "POST",
      body: JSON.stringify({ toState: "takedown_pending", reason: "Fixture takedown request" }),
    }, administratorCookie);
    expect(pendingResponse.status).toBe(201);
    const pending = await json<{ duplicate: boolean; snapshot: { id: string; retentionState: string } }>(pendingResponse);
    expect(pending).toMatchObject({ duplicate: false, snapshot: { retentionState: "takedown_pending" } });

    const hidden = await call(`/api/v1/admin/source-evidence/${retained!.id}/content`, {}, administratorCookie);
    expect(hidden.status).toBe(423);
    const supersededMetadata = await call(`/api/v1/admin/source-evidence/${retained!.id}`, {}, administratorCookie);
    expect(await json<{ snapshot: { contentUrl: string | null } }>(supersededMetadata))
      .toMatchObject({ snapshot: { contentUrl: null } });

    const replay = await call(`/api/v1/admin/source-evidence/${retained!.id}/retention`, {
      method: "POST",
      body: JSON.stringify({ toState: "takedown_pending", reason: "Fixture takedown request" }),
    }, administratorCookie);
    expect(replay.status).toBe(200);
    expect(await json<{ duplicate: boolean }>(replay)).toMatchObject({ duplicate: true });

    const completedResponse = await call(`/api/v1/admin/source-evidence/${pending.snapshot.id}/retention`, {
      method: "POST",
      body: JSON.stringify({ toState: "takedown_complete", reason: "Fixture takedown completed" }),
    }, administratorCookie);
    expect(completedResponse.status).toBe(201);
    expect(await json<{ snapshot: { retentionState: string } }>(completedResponse))
      .toMatchObject({ snapshot: { retentionState: "takedown_complete" } });
    expect(await env.FILES.head(retained!.retained_object_key)).not.toBeNull();

    const lineage = await env.DB.prepare(`
      SELECT count(*) AS snapshots,
        (SELECT count(*) FROM collection_lifecycle_events
          WHERE source_id = ? AND event_type = 'evidence.retention.transition') AS events
      FROM source_snapshots
      WHERE id = ? OR supersedes_snapshot_id IN (?, ?)
    `).bind(sourceId, retained!.id, retained!.id, pending.snapshot.id).first<{ snapshots: number; events: number }>();
    expect(lineage).toEqual({ snapshots: 3, events: 2 });
  });

  it("keeps deduplicated bytes restricted without breaking another current snapshot reference", async () => {
    const bytes = new TextEncoder().encode("shared immutable evidence");
    const hash = await sha256(bytes);
    const key = `source-evidence/sha256/${hash.slice(0, 2)}/${hash}`;
    const upload = await call(`/api/v1/source-evidence/objects/${hash}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${ingestionSecret}`,
        "content-type": "text/plain",
        "content-length": String(bytes.byteLength),
        "x-detected-media-type": "text/plain",
        "x-evidence-class": "structured_text",
        "x-source-policy-revision-id": policyId,
        "x-source-url": "https://manufacturer.example/datasheet",
      },
      body: bytes,
    });
    expect(upload.status).toBe(201);

    const ids: string[] = [];
    for (const suffix of ["a", "b"]) {
      const manifest = {
        ...retainedManifest(hash, bytes.byteLength),
        externalRegistrationId: `shared-object-${suffix}`,
      };
      const response = await call("/api/v1/source-evidence/registrations", {
        method: "POST",
        headers: { authorization: `Bearer ${ingestionSecret}` },
        body: JSON.stringify(manifest),
      });
      expect(response.status).toBe(201);
      ids.push((await json<{ snapshot: { id: string } }>(response)).snapshot.id);
    }

    const completeTakedown = async (snapshotId: string) => {
      const pendingResponse = await call(`/api/v1/admin/source-evidence/${snapshotId}/retention`, {
        method: "POST",
        body: JSON.stringify({ toState: "takedown_pending", reason: "Shared-object retention test" }),
      }, administratorCookie);
      expect(pendingResponse.status).toBe(201);
      const pendingId = (await json<{ snapshot: { id: string } }>(pendingResponse)).snapshot.id;
      const completedResponse = await call(`/api/v1/admin/source-evidence/${pendingId}/retention`, {
        method: "POST",
        body: JSON.stringify({ toState: "takedown_complete", reason: "Shared-object retention test completed" }),
      }, administratorCookie);
      expect(completedResponse.status).toBe(201);
    };

    await completeTakedown(ids[0]!);
    expect(await env.FILES.head(key)).not.toBeNull();
    const remainingContent = await call(`/api/v1/admin/source-evidence/${ids[1]}/content`, {}, administratorCookie);
    expect(remainingContent.status).toBe(200);
    expect(await remainingContent.text()).toBe("shared immutable evidence");

    await completeTakedown(ids[1]!);
    expect(await env.FILES.head(key)).not.toBeNull();
    const restrictedContent = await call(`/api/v1/admin/source-evidence/${ids[1]}/content`, {}, administratorCookie);
    expect(restrictedContent.status).toBe(423);
  });
});
