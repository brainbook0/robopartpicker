import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { ProjectsRepository } from "../db/repositories/projects";
import { BuildsRepository } from "../db/repositories/builds";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedRead, assertScopedWrite, authenticatedUserId, hasPlatformRole, organizationRole } from "../middleware/authorization";
import { recordAuditEvent } from "../services/audit";
import { createInAppNotification } from "../services/notifications";
import { parseJson } from "../validation";

const visibilitySchema = z.enum(["private", "organization", "unlisted", "public"]);
const draftSchema = z.object({ content: z.record(z.string(), z.unknown()), entityType: z.string().trim().max(100).optional(), entityId: z.string().trim().max(200).optional(), organizationId: z.string().uuid().optional(), expiresAt: z.string().datetime().optional() }).strict();
const missingRequestSchema = z.object({ question: z.string().trim().min(4).max(4_000), missingFields: z.array(z.string().trim().min(1).max(160)).max(100).default([]), reliabilityReason: z.string().trim().min(4).max(4_000), suggestedSources: z.array(z.string().trim().min(1).max(500)).max(50).default([]), visibility: z.enum(["private", "project", "public"]).default("project"), sourceTaskRunId: z.string().uuid().optional(), buildId: z.string().uuid().optional() }).strict();
const missingResponseSchema = z.object({ responseText: z.string().trim().min(4).max(40_000), sources: z.array(z.record(z.string(), z.unknown())).max(100).default([]), fileIds: z.array(z.string().uuid()).max(50).default([]) }).strict();
const reviewResponseSchema = z.object({ decision: z.enum(["approve", "reject"]), notes: z.string().trim().max(4_000).optional() }).strict();
const bomLineSchema = z.object({ lineKey: z.string().trim().min(1).max(200), rawText: z.string().trim().min(1).max(4_000), componentId: z.string().trim().min(1).max(200).nullable().optional(), identity: z.record(z.string(), z.unknown()).default({}), quantity: z.number().positive().nullable().optional(), status: z.enum(["resolved", "unresolved", "fabricated", "rejected"]).default("unresolved"), confidence: z.number().min(0).max(1).default(0), notes: z.string().trim().max(4_000).optional() }).strict();
const bomVerificationSchema = z.object({ bomId: z.string().uuid().optional(), projectId: z.string().uuid().optional(), sourceType: z.enum(["upload", "repository", "manual", "ai_extraction"]), sourceReference: z.record(z.string(), z.unknown()).default({}), snapshot: z.record(z.string(), z.unknown()).default({}), lines: z.array(bomLineSchema).max(10_000).default([]), changeDescription: z.string().trim().max(2_000).optional() }).strict().refine((value) => value.bomId || value.projectId, "A BOM or project is required.");
const bomCorrectionSchema = z.object({ snapshot: z.record(z.string(), z.unknown()), lines: z.array(bomLineSchema).max(10_000), changeDescription: z.string().trim().min(2).max(2_000) }).strict();
const bomReviewSchema = z.object({ decision: z.enum(["request_changes", "verify", "dispute", "reject"]), notes: z.string().trim().min(2).max(4_000) }).strict();
const measurementSchema = z.object({ label: z.string().trim().min(1).max(200), value: z.union([z.number(), z.string().trim().max(500)]), unit: z.string().trim().min(1).max(50) });
const technicalRecordSchema = z.object({ recordType: z.enum(["test_result", "calibration", "measurement", "integration_result", "substitution_result", "failure", "resolution", "configuration_snapshot", "firmware_snapshot", "assembly_checkpoint", "supplier_outcome", "safety_check"]), projectId: z.string().uuid().optional(), projectVersionId: z.string().uuid().optional(), buildId: z.string().uuid().optional(), buildVersionId: z.string().uuid().optional(), componentId: z.string().trim().min(1).max(200).optional(), applicableVersion: z.string().trim().max(200).optional(), title: z.string().trim().min(2).max(300), method: z.string().trim().max(20_000).optional(), conditions: z.record(z.string(), z.unknown()).default({}), resultText: z.string().trim().min(1).max(40_000), measurements: z.array(measurementSchema).max(1_000).default([]), evidence: z.array(z.record(z.string(), z.unknown())).max(500).default([]), fileIds: z.array(z.string().uuid()).max(100).default([]), confidence: z.number().min(0).max(1).default(0), reproductionCount: z.number().int().nonnegative().default(0), verificationState: z.enum(["unverified", "self_reported", "evidence_backed", "maintainer_reviewed", "disputed", "superseded"]).default("unverified"), visibility: visibilitySchema.default("private"), occurredAt: z.string().datetime().optional() }).strict().refine((value) => value.projectId || value.buildId || value.componentId, "A project, build, or component is required.");
const recordVersionSchema = z.object({ snapshot: z.record(z.string(), z.unknown()), versionLabel: z.string().trim().max(100).optional(), status: z.enum(["draft", "published"]).default("draft"), changeDescription: z.string().trim().max(2_000).optional() }).strict();
const proposalSchema = z.object({ buildId: z.string().uuid().optional(), targetEntityType: z.string().trim().min(1).max(100), targetEntityId: z.string().trim().max(200).optional(), targetVersionId: z.string().trim().max(200).optional(), proposalType: z.string().trim().min(1).max(100), title: z.string().trim().min(2).max(300), rationale: z.string().trim().min(4).max(20_000), change: z.record(z.string(), z.unknown()), evidence: z.array(z.record(z.string(), z.unknown())).max(200).default([]), submit: z.boolean().default(true) }).strict();
const proposalReviewSchema = z.object({ decision: z.enum(["comment", "request_changes", "approve", "reject"]), body: z.string().trim().min(1).max(20_000) }).strict();
const commentSchema = z.object({ entityType: z.string().trim().min(1).max(100), entityId: z.string().trim().min(1).max(200), parentCommentId: z.string().uuid().optional(), bodyMarkdown: z.string().trim().min(1).max(40_000) }).strict();
const collaboratorSchema = z.object({ username: z.string().trim().min(2).max(64), role: z.enum(["maintainer", "editor", "reviewer", "builder", "viewer"]) }).strict();
const reproductionSchema = z.object({ projectId: z.string().uuid(), projectVersionId: z.string().uuid(), bomVersionId: z.string().uuid(), buildId: z.string().uuid(), status: z.enum(["started", "self_reported_complete", "evidence_backed", "failed", "abandoned"]).default("started"), evidence: z.array(z.record(z.string(), z.unknown())).max(500).default([]), photoFileIds: z.array(z.string().uuid()).max(100).default([]), buildTimeMinutes: z.number().int().nonnegative().optional(), cost: z.record(z.string(), z.unknown()).default({}), substitutions: z.array(z.record(z.string(), z.unknown())).max(1_000).default([]), problems: z.array(z.record(z.string(), z.unknown())).max(1_000).default([]), tests: z.array(z.record(z.string(), z.unknown())).max(1_000).default([]), measuredPerformance: z.array(z.record(z.string(), z.unknown())).max(1_000).default([]) }).strict();

export const knowledgeWorkflowRoutes = new Hono<AppBindings>();

knowledgeWorkflowRoutes.put("/drafts/:surface/:key", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, draftSchema); const serialized = JSON.stringify(body.content);
  if (new TextEncoder().encode(serialized).byteLength > 1_000_000) throw new AppError(413, "DRAFT_TOO_LARGE", "Autosaved drafts are limited to 1 MB.");
  const now = new Date().toISOString(); const surface = c.req.param("surface").slice(0, 120); const key = c.req.param("key").slice(0, 200);
  await c.env.DB.prepare(`INSERT INTO content_drafts
    (id, user_id, organization_id, surface, entity_type, entity_id, draft_key, content_json, version, created_at, updated_at, expires_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?9, ?10)
    ON CONFLICT(user_id, surface, draft_key) DO UPDATE SET content_json = excluded.content_json, entity_type = excluded.entity_type,
      entity_id = excluded.entity_id, organization_id = excluded.organization_id, version = content_drafts.version + 1,
      updated_at = excluded.updated_at, expires_at = excluded.expires_at`)
    .bind(crypto.randomUUID(), userId, body.organizationId ?? null, surface, body.entityType ?? null, body.entityId ?? null, key, serialized, now, body.expiresAt ?? null).run();
  const saved = await c.env.DB.prepare("SELECT id, version, updated_at FROM content_drafts WHERE user_id = ?1 AND surface = ?2 AND draft_key = ?3").bind(userId, surface, key).first();
  return c.json({ item: saved });
});
knowledgeWorkflowRoutes.get("/drafts/:surface/:key", loadAuthSession, requireAuth, async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM content_drafts WHERE user_id = ?1 AND surface = ?2 AND draft_key = ?3 AND (expires_at IS NULL OR expires_at > ?4)")
    .bind(authenticatedUserId(c), c.req.param("surface"), c.req.param("key"), new Date().toISOString()).first<Record<string, unknown>>();
  if (!row) throw new AppError(404, "DRAFT_NOT_FOUND", "Autosaved draft not found.");
  return c.json({ item: jsonColumns(row) });
});
knowledgeWorkflowRoutes.delete("/drafts/:surface/:key", loadAuthSession, requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM content_drafts WHERE user_id = ?1 AND surface = ?2 AND draft_key = ?3").bind(authenticatedUserId(c), c.req.param("surface"), c.req.param("key")).run();
  return c.body(null, 204);
});

knowledgeWorkflowRoutes.get("/projects/:id/missing-information", loadAuthSession, async (c) => {
  const project = await projectById(c.env.DB, c.req.param("id")); await assertScopedRead(c.env.DB, c.get("authSession")?.user?.id ?? null, project.row);
  const rows = await c.env.DB.prepare(`SELECT mir.*, p.username AS requester_username,
    (SELECT COUNT(*) FROM missing_information_responses r WHERE r.request_id = mir.id AND r.status <> 'rejected') AS response_count
    FROM missing_information_requests mir LEFT JOIN profiles p ON p.id = mir.requested_by_user_id
    WHERE mir.project_id = ?1 AND (mir.visibility <> 'private' OR mir.requested_by_user_id = ?2) ORDER BY mir.created_at DESC`)
    .bind(project.row.id, c.get("authSession")?.user?.id ?? null).all<Record<string, unknown>>();
  return c.json({ items: rows.results.map(jsonColumns) });
});
knowledgeWorkflowRoutes.post("/projects/:id/missing-information", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const project = await projectById(c.env.DB, c.req.param("id")); await assertScopedRead(c.env.DB, userId, project.row);
  const body = await parseJson(c, missingRequestSchema); const id = crypto.randomUUID(); const frictionId = crypto.randomUUID(); const now = new Date().toISOString();
  const currentVersionId = await currentProjectVersionId(c.env.DB, project.row.id);
  if (body.buildId) await readableBuild(c.env.DB, body.buildId, userId);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO ai_friction_events
      (id, user_id, feature, project_id, build_id, task_run_id, category, sanitized_context_json, privacy_state, consent_state, created_at)
      VALUES (?1, ?2, 'missing-information', ?3, ?4, ?5, 'information_unavailable', ?6, 'private', 'operational_only', ?7)`)
      .bind(frictionId, userId, project.row.id, body.buildId ?? null, body.sourceTaskRunId ?? null, JSON.stringify({ missingFields: body.missingFields, reliabilityReason: body.reliabilityReason.slice(0, 500) }), now),
    c.env.DB.prepare(`INSERT INTO missing_information_requests
      (id, project_id, project_version_id, build_id, requested_by_user_id, source_task_run_id, friction_event_id, question,
       missing_fields_json, reliability_reason, suggested_sources_json, status, visibility, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'open', ?12, ?13, ?13)`)
      .bind(id, project.row.id, currentVersionId, body.buildId ?? null, userId, body.sourceTaskRunId ?? null, frictionId,
        body.question, JSON.stringify(body.missingFields), body.reliabilityReason, JSON.stringify(body.suggestedSources), body.visibility, now),
    c.env.DB.prepare("INSERT INTO missing_information_subscriptions (request_id, user_id, created_at) VALUES (?1, ?2, ?3)").bind(id, userId, now),
    analyticsStatement(c.env.DB, project.row.id, "missing_information_request", userId, { requestId: id }, now),
  ]);
  return c.json({ id, status: "open", frictionEventId: frictionId }, 201);
});
knowledgeWorkflowRoutes.get("/missing-information/:id", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null; const request = await c.env.DB.prepare("SELECT * FROM missing_information_requests WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!request) throw new AppError(404, "MISSING_INFORMATION_NOT_FOUND", "Missing-information request not found.");
  if (request.project_id) { const project = await projectById(c.env.DB, String(request.project_id)); await assertScopedRead(c.env.DB, userId, project.row); }
  if (request.visibility === "private" && request.requested_by_user_id !== userId) throw new AppError(userId ? 403 : 401, userId ? "MISSING_INFORMATION_ACCESS_DENIED" : "AUTHENTICATION_REQUIRED", "This information request is private.");
  const responses = await c.env.DB.prepare(`SELECT r.*, p.username AS responder_username, COALESCE(p.display_name, u.name) AS responder_name
    FROM missing_information_responses r LEFT JOIN user u ON u.id = r.responder_user_id LEFT JOIN profiles p ON p.id = r.responder_user_id
    WHERE r.request_id = ?1 AND (r.status <> 'rejected' OR r.responder_user_id = ?2) ORDER BY r.created_at`).bind(request.id, userId ?? "").all<Record<string, unknown>>();
  return c.json({ item: jsonColumns(request), responses: responses.results.map(jsonColumns) });
});
knowledgeWorkflowRoutes.post("/missing-information/:id/responses", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const request = await c.env.DB.prepare("SELECT * FROM missing_information_requests WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!request) throw new AppError(404, "MISSING_INFORMATION_NOT_FOUND", "Missing-information request not found.");
  if (request.project_id) { const project = await projectById(c.env.DB, String(request.project_id)); await assertScopedRead(c.env.DB, userId, project.row); }
  const body = await parseJson(c, missingResponseSchema); await assertOwnedReadyFiles(c.env.DB, userId, body.fileIds); const id = crypto.randomUUID(); const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO missing_information_responses
      (id, request_id, responder_user_id, response_text, sources_json, file_ids_json, status, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'submitted', ?7)`).bind(id, request.id, userId, body.responseText, JSON.stringify(body.sources), JSON.stringify(body.fileIds), now),
    c.env.DB.prepare("UPDATE missing_information_requests SET status = 'answered', updated_at = ?1 WHERE id = ?2 AND status = 'open'").bind(now, request.id),
  ]);
  if (request.requested_by_user_id && request.requested_by_user_id !== userId) await createInAppNotification(c.env.DB, { userId: String(request.requested_by_user_id), type: "missing_information_response", title: "New response to an information gap", body: String(request.question).slice(0, 200), internalPath: request.project_id ? `/projects/${request.project_id}` : null, data: { requestId: request.id, responseId: id } });
  return c.json({ id, status: "submitted" }, 201);
});
knowledgeWorkflowRoutes.post("/missing-information/:id/subscribe", loadAuthSession, requireAuth, async (c) => {
  await c.env.DB.prepare(`INSERT INTO missing_information_subscriptions (request_id, user_id, created_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(request_id, user_id) DO NOTHING`).bind(c.req.param("id"), authenticatedUserId(c), new Date().toISOString()).run();
  return c.json({ subscribed: true });
});
knowledgeWorkflowRoutes.post("/missing-information/responses/:id/review", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, reviewResponseSchema);
  const response = await c.env.DB.prepare(`SELECT r.*, q.project_id, q.project_version_id, q.build_id, q.requested_by_user_id, q.question, q.id AS request_id
    FROM missing_information_responses r JOIN missing_information_requests q ON q.id = r.request_id WHERE r.id = ?1`).bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!response) throw new AppError(404, "MISSING_RESPONSE_NOT_FOUND", "Response not found.");
  if (response.project_id) await assertProjectReviewer(c.env.DB, userId, String(response.project_id)); else if (!(await hasPlatformRole(c.env.DB, userId, ["moderator", "administrator"]))) throw new AppError(403, "REVIEW_DENIED", "A maintainer must review this response.");
  const now = new Date().toISOString(); const approved = body.decision === "approve";
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE missing_information_responses SET status = ?1, reviewed_by_user_id = ?2, reviewed_at = ?3 WHERE id = ?4")
      .bind(approved ? "approved" : "rejected", userId, now, response.id),
  ];
  if (approved) {
    statements.push(c.env.DB.prepare("UPDATE missing_information_requests SET status = 'resolved', accepted_response_id = ?1, updated_at = ?2, resolved_at = ?2 WHERE id = ?3").bind(response.id, now, response.request_id));
    if (response.project_id || response.build_id) statements.push(c.env.DB.prepare(`INSERT INTO technical_records
      (id, record_type, project_id, project_version_id, build_id, title, method, result_text, evidence_json, confidence,
       reproduction_count, verification_state, visibility, author_user_id, occurred_at, created_at, updated_at)
      VALUES (?1, 'resolution', ?2, ?3, ?4, ?5, 'Maintainer-reviewed missing-information response', ?6, ?7, 1, 1, 'maintainer_reviewed', 'private', ?8, ?9, ?9, ?9)`)
      .bind(crypto.randomUUID(), response.project_id ?? null, response.project_version_id ?? null, response.build_id ?? null,
        `Resolved information gap: ${String(response.question).slice(0, 240)}`, response.response_text, response.sources_json, response.responder_user_id ?? null, now));
  }
  await c.env.DB.batch(statements);
  const subscribers = await c.env.DB.prepare("SELECT user_id FROM missing_information_subscriptions WHERE request_id = ?1").bind(response.request_id).all<{ user_id: string }>();
  await Promise.all(subscribers.results.filter((item) => item.user_id !== userId).map((item) => createInAppNotification(c.env.DB, { userId: item.user_id, type: "missing_information_resolution", title: approved ? "Information gap resolved" : "Information response reviewed", body: String(response.question).slice(0, 200), internalPath: response.project_id ? `/projects/${response.project_id}` : null, data: { requestId: response.request_id } })));
  return c.json({ reviewed: true, status: approved ? "resolved" : "answered" });
});

knowledgeWorkflowRoutes.get("/projects/:id/bom-availability", loadAuthSession, async (c) => {
  const project = await projectById(c.env.DB, c.req.param("id")); await assertScopedRead(c.env.DB, c.get("authSession")?.user?.id ?? null, project.row);
  const bom = await c.env.DB.prepare(`SELECT b.id, b.name, b.current_version_id, bv.version_label FROM boms b LEFT JOIN bom_versions bv ON bv.id = b.current_version_id
    WHERE b.project_id = ?1 ORDER BY b.updated_at DESC LIMIT 1`).bind(project.row.id).first();
  return c.json(bom ? { available: true, bom } : { available: false, reliableBom: false, message: "No reliable BOM is available. Upload one or enter it manually; it will remain unverified until reviewed.", actions: ["upload", "manual_entry", "create_verification_request"] });
});
knowledgeWorkflowRoutes.post("/bom-verifications", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, bomVerificationSchema);
  if (body.projectId) { const project = await projectById(c.env.DB, body.projectId); await assertScopedWrite(c.env.DB, userId, project.row); }
  if (body.bomId) { const bom = await c.env.DB.prepare("SELECT owner_user_id, organization_id FROM boms WHERE id = ?1").bind(body.bomId).first<{ owner_user_id: string | null; organization_id: string | null }>(); if (!bom) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found."); await assertScopedWrite(c.env.DB, userId, bom); }
  const id = crypto.randomUUID(); const versionId = crypto.randomUUID(); const now = new Date().toISOString(); const status = body.sourceType === "ai_extraction" ? "ai_extracted" : "draft";
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO bom_verifications
      (id, bom_id, project_id, submitter_user_id, status, source_type, source_reference_json, current_version_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`).bind(id, body.bomId ?? null, body.projectId ?? null, userId, status, body.sourceType, JSON.stringify(body.sourceReference), versionId, now),
    c.env.DB.prepare(`INSERT INTO bom_verification_versions
      (id, verification_id, version_number, snapshot_json, change_description, created_by_user_id, created_at)
      VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6)`).bind(versionId, id, JSON.stringify(body.snapshot), body.changeDescription ?? "Original submission", userId, now),
  ];
  statements.push(...bomLineStatements(c.env.DB, versionId, body.lines)); await batch(c.env.DB, statements);
  return c.json({ id, versionId, status, unresolvedLines: body.lines.filter((line) => line.status === "unresolved").length }, 201);
});
knowledgeWorkflowRoutes.get("/bom-verifications/:id", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const verification = await c.env.DB.prepare("SELECT * FROM bom_verifications WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!verification) throw new AppError(404, "BOM_VERIFICATION_NOT_FOUND", "BOM verification not found."); await assertVerificationAccess(c.env.DB, userId, verification);
  const [versions, lines, reviews] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM bom_verification_versions WHERE verification_id = ?1 ORDER BY version_number DESC").bind(verification.id).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT l.* FROM bom_verification_lines l JOIN bom_verification_versions v ON v.id = l.version_id
      WHERE v.verification_id = ?1 ORDER BY v.version_number DESC, l.line_key`).bind(verification.id).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM bom_verification_reviews WHERE verification_id = ?1 ORDER BY created_at").bind(verification.id).all<Record<string, unknown>>(),
  ]);
  return c.json({ item: jsonColumns(verification), versions: versions.results.map(jsonColumns), lines: lines.results.map(jsonColumns), reviews: reviews.results });
});
knowledgeWorkflowRoutes.post("/bom-verifications/:id/versions", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const verification = await c.env.DB.prepare("SELECT * FROM bom_verifications WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!verification) throw new AppError(404, "BOM_VERIFICATION_NOT_FOUND", "BOM verification not found."); await assertVerificationAccess(c.env.DB, userId, verification, true);
  const body = await parseJson(c, bomCorrectionSchema); const max = await c.env.DB.prepare("SELECT COALESCE(MAX(version_number), 0) AS value FROM bom_verification_versions WHERE verification_id = ?1").bind(verification.id).first<{ value: number }>();
  const versionId = crypto.randomUUID(); const version = Number(max?.value ?? 0) + 1; const now = new Date().toISOString();
  const statements = [c.env.DB.prepare(`INSERT INTO bom_verification_versions
    (id, verification_id, version_number, snapshot_json, change_description, created_by_user_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(versionId, verification.id, version, JSON.stringify(body.snapshot), body.changeDescription, userId, now),
    c.env.DB.prepare("UPDATE bom_verifications SET current_version_id = ?1, status = 'user_confirmed', updated_at = ?2 WHERE id = ?3").bind(versionId, now, verification.id), ...bomLineStatements(c.env.DB, versionId, body.lines)];
  await batch(c.env.DB, statements); return c.json({ versionId, versionNumber: version, status: "user_confirmed" }, 201);
});
knowledgeWorkflowRoutes.post("/bom-verifications/:id/submit", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const verification = await c.env.DB.prepare("SELECT * FROM bom_verifications WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!verification) throw new AppError(404, "BOM_VERIFICATION_NOT_FOUND", "BOM verification not found."); await assertVerificationAccess(c.env.DB, userId, verification, true);
  const now = new Date().toISOString(); await c.env.DB.prepare("UPDATE bom_verifications SET status = 'submitted', updated_at = ?1 WHERE id = ?2 AND status IN ('draft','ai_extracted','user_confirmed')").bind(now, verification.id).run();
  return c.json({ status: "submitted" });
});
knowledgeWorkflowRoutes.post("/bom-verifications/:id/reviews", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, bomReviewSchema); const verification = await c.env.DB.prepare("SELECT * FROM bom_verifications WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!verification) throw new AppError(404, "BOM_VERIFICATION_NOT_FOUND", "BOM verification not found.");
  if (verification.project_id) await assertProjectReviewer(c.env.DB, userId, String(verification.project_id)); else if (!(await hasPlatformRole(c.env.DB, userId, ["moderator", "administrator"]))) throw new AppError(403, "BOM_REVIEW_DENIED", "A maintainer or moderator must review this BOM.");
  const next: Record<string, string> = { request_changes: "under_review", verify: "verified", dispute: "disputed", reject: "rejected" }; const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO bom_verification_reviews (id, verification_id, reviewer_user_id, decision, notes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(crypto.randomUUID(), verification.id, userId, body.decision, body.notes, now),
    c.env.DB.prepare("UPDATE bom_verifications SET status = ?1, updated_at = ?2, decided_at = CASE WHEN ?1 IN ('verified','disputed','rejected') THEN ?2 ELSE NULL END WHERE id = ?3").bind(next[body.decision], now, verification.id),
  ]);
  if (verification.submitter_user_id && verification.submitter_user_id !== userId) await createInAppNotification(c.env.DB, { userId: String(verification.submitter_user_id), type: "bom_verification_result", title: "BOM verification reviewed", body: `${next[body.decision]}${body.notes ? `: ${body.notes.slice(0, 200)}` : ""}`, internalPath: `/bom-verifications/${verification.id}`, data: { verificationId: verification.id, decision: body.decision } });
  return c.json({ status: next[body.decision] });
});

knowledgeWorkflowRoutes.get("/technical-records", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null; const projectId = c.req.query("projectId"); const buildId = c.req.query("buildId"); const componentId = c.req.query("componentId");
  if (!projectId && !buildId && !componentId) throw new AppError(422, "RECORD_SCOPE_REQUIRED", "Filter technical records by project, build, or component.");
  let scopeAuthorized = false;
  if (projectId) { const project = await projectById(c.env.DB, projectId); await assertScopedRead(c.env.DB, userId, project.row); scopeAuthorized = await canReadPrivateProjectRecords(c.env.DB, userId, project.row); }
  if (buildId) { const build = await readableBuild(c.env.DB, buildId, userId); scopeAuthorized = scopeAuthorized || await canReadPrivateBuildRecords(c.env.DB, userId, build); }
  const q = c.req.query("q")?.trim().slice(0, 100) ?? ""; const type = c.req.query("type")?.trim().slice(0, 60) ?? "";
  const rows = await c.env.DB.prepare(`SELECT tr.*, p.username AS author_username FROM technical_records tr LEFT JOIN profiles p ON p.id = tr.author_user_id
    WHERE (?1 = '' OR tr.project_id = ?1) AND (?2 = '' OR tr.build_id = ?2) AND (?3 = '' OR tr.component_id = ?3)
      AND (?4 = '' OR tr.record_type = ?4) AND (?5 = '' OR tr.title LIKE '%' || ?5 || '%' OR tr.result_text LIKE '%' || ?5 || '%')
      AND (?6 = 1 OR tr.visibility IN ('public','unlisted') OR tr.author_user_id = ?7)
    ORDER BY COALESCE(tr.occurred_at, tr.created_at) DESC LIMIT 500`).bind(projectId ?? "", buildId ?? "", componentId ?? "", type, q, scopeAuthorized ? 1 : 0, userId ?? "").all<Record<string, unknown>>();
  return c.json({ items: rows.results.map(jsonColumns), total: rows.results.length });
});
knowledgeWorkflowRoutes.post("/technical-records", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, technicalRecordSchema);
  if (body.projectId) { const project = await projectById(c.env.DB, body.projectId); await assertScopedWrite(c.env.DB, userId, project.row); }
  if (body.buildId) { const build = await new BuildsRepository(c.env.DB).find(body.buildId); if (!build) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found."); await assertScopedWrite(c.env.DB, userId, build, "build"); }
  await assertOwnedReadyFiles(c.env.DB, userId, body.fileIds); const id = crypto.randomUUID(); const now = new Date().toISOString();
  const snapshot = { ...body, fileIds: undefined };
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO technical_records
      (id, record_type, project_id, project_version_id, build_id, build_version_id, component_id, applicable_version, title, method,
       conditions_json, result_text, measurements_json, evidence_json, confidence, reproduction_count, verification_state, visibility,
       author_user_id, occurred_at, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21)`)
      .bind(id, body.recordType, body.projectId ?? null, body.projectVersionId ?? null, body.buildId ?? null, body.buildVersionId ?? null,
        body.componentId ?? null, body.applicableVersion ?? null, body.title, body.method ?? null, JSON.stringify(body.conditions), body.resultText,
        JSON.stringify(body.measurements), JSON.stringify(body.evidence), body.confidence, body.reproductionCount, body.verificationState, body.visibility, userId, body.occurredAt ?? null, now),
    c.env.DB.prepare(`INSERT INTO record_versions
      (id, entity_type, entity_id, version_number, version_label, status, snapshot_json, change_description, created_by_user_id, created_at, published_at)
      VALUES (?1, 'technical_record', ?2, 1, '1', ?3, ?4, 'Initial record', ?5, ?6, ?7)`)
      .bind(crypto.randomUUID(), id, body.visibility === "public" ? "published" : "draft", JSON.stringify(snapshot), userId, now, body.visibility === "public" ? now : null),
  ];
  body.fileIds.forEach((fileId) => statements.push(c.env.DB.prepare("INSERT INTO technical_record_files (technical_record_id, file_id, purpose, created_at) VALUES (?1, ?2, 'evidence', ?3)").bind(id, fileId, now)));
  await batch(c.env.DB, statements); return c.json({ id, verificationState: body.verificationState }, 201);
});
knowledgeWorkflowRoutes.post("/records/:entityType/:entityId/versions", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const entityType = c.req.param("entityType");
  if (!["integration", "substitution", "software_configuration", "firmware", "technical_record"].includes(entityType)) throw new AppError(422, "VERSION_ENTITY_INVALID", "This record type is not versioned by this endpoint.");
  const body = await parseJson(c, recordVersionSchema); if (entityType === "technical_record") { const record = await c.env.DB.prepare("SELECT author_user_id FROM technical_records WHERE id = ?1").bind(c.req.param("entityId")).first<{ author_user_id: string | null }>(); if (!record || record.author_user_id !== userId) throw new AppError(403, "RECORD_VERSION_DENIED", "You cannot version this record."); }
  const max = await c.env.DB.prepare("SELECT COALESCE(MAX(version_number), 0) AS value FROM record_versions WHERE entity_type = ?1 AND entity_id = ?2").bind(entityType, c.req.param("entityId")).first<{ value: number }>();
  const id = crypto.randomUUID(); const version = Number(max?.value ?? 0) + 1; const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO record_versions
    (id, entity_type, entity_id, version_number, version_label, status, snapshot_json, change_description, created_by_user_id, created_at, published_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
    .bind(id, entityType, c.req.param("entityId"), version, body.versionLabel ?? String(version), body.status, JSON.stringify(body.snapshot), body.changeDescription ?? null, userId, now, body.status === "published" ? now : null).run();
  return c.json({ id, versionNumber: version, status: body.status }, 201);
});

knowledgeWorkflowRoutes.get("/projects/:id/contributions", loadAuthSession, async (c) => {
  const project = await projectById(c.env.DB, c.req.param("id")); await assertScopedRead(c.env.DB, c.get("authSession")?.user?.id ?? null, project.row);
  const rows = await c.env.DB.prepare(`SELECT cp.*, p.username AS author_username FROM contribution_proposals cp LEFT JOIN profiles p ON p.id = cp.author_user_id
    WHERE cp.project_id = ?1 ORDER BY cp.updated_at DESC LIMIT 200`).bind(project.row.id).all<Record<string, unknown>>(); return c.json({ items: rows.results.map(jsonColumns) });
});
knowledgeWorkflowRoutes.post("/projects/:id/contributions", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const project = await projectById(c.env.DB, c.req.param("id")); await assertScopedRead(c.env.DB, userId, project.row); const body = await parseJson(c, proposalSchema); const id = crypto.randomUUID(); const now = new Date().toISOString();
  const currentVersionId = await currentProjectVersionId(c.env.DB, project.row.id);
  await c.env.DB.prepare(`INSERT INTO contribution_proposals
    (id, project_id, build_id, target_entity_type, target_entity_id, target_version_id, proposal_type, title, rationale,
     change_json, evidence_json, status, author_user_id, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)`)
    .bind(id, project.row.id, body.buildId ?? null, body.targetEntityType, body.targetEntityId ?? null, body.targetVersionId ?? currentVersionId,
      body.proposalType, body.title, body.rationale, JSON.stringify(body.change), JSON.stringify(body.evidence), body.submit ? "submitted" : "draft", userId, now).run();
  const maintainers = await projectMaintainerIds(c.env.DB, project.row.id); await Promise.all(maintainers.filter((id) => id !== userId).map((id) => createInAppNotification(c.env.DB, { userId: id, type: "contribution_proposal", title: "New project contribution proposal", body: body.title, internalPath: `/projects/${project.item.slug}`, data: { proposalId: id } })));
  return c.json({ id, status: body.submit ? "submitted" : "draft", canonicalChanged: false }, 201);
});
knowledgeWorkflowRoutes.post("/contributions/:id/reviews", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const proposal = await c.env.DB.prepare("SELECT * FROM contribution_proposals WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>(); if (!proposal) throw new AppError(404, "CONTRIBUTION_NOT_FOUND", "Contribution proposal not found."); if (proposal.project_id) await assertProjectReviewer(c.env.DB, userId, String(proposal.project_id)); const body = await parseJson(c, proposalReviewSchema); const now = new Date().toISOString();
  const status = body.decision === "approve" ? "accepted" : body.decision === "reject" ? "rejected" : body.decision === "request_changes" ? "changes_requested" : "under_review";
  await c.env.DB.batch([c.env.DB.prepare("INSERT INTO contribution_reviews (id, proposal_id, reviewer_user_id, decision, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(crypto.randomUUID(), proposal.id, userId, body.decision, body.body, now), c.env.DB.prepare("UPDATE contribution_proposals SET status = ?1, updated_at = ?2, decided_at = CASE WHEN ?1 IN ('accepted','rejected') THEN ?2 ELSE NULL END WHERE id = ?3").bind(status, now, proposal.id)]);
  if (proposal.author_user_id && proposal.author_user_id !== userId) await createInAppNotification(c.env.DB, { userId: String(proposal.author_user_id), type: "contribution_review", title: `Contribution ${status.replaceAll("_", " ")}`, body: body.body.slice(0, 200), internalPath: proposal.project_id ? `/projects/${proposal.project_id}` : null, data: { proposalId: proposal.id } });
  return c.json({ status, canonicalChanged: false, note: "Acceptance records maintainer approval; a separate versioned publication is required to change the canonical project." });
});

knowledgeWorkflowRoutes.get("/comments", loadAuthSession, async (c) => {
  const entityType = c.req.query("entityType")?.slice(0, 100); const entityId = c.req.query("entityId")?.slice(0, 200); if (!entityType || !entityId) throw new AppError(422, "COMMENT_SCOPE_REQUIRED", "entityType and entityId are required.");
  const rows = await c.env.DB.prepare(`SELECT rc.*, p.username, COALESCE(p.display_name, u.name) AS author_name FROM record_comments rc
    LEFT JOIN profiles p ON p.id = rc.author_user_id LEFT JOIN user u ON u.id = rc.author_user_id
    WHERE rc.entity_type = ?1 AND rc.entity_id = ?2 AND rc.status <> 'deleted' ORDER BY rc.created_at`).bind(entityType, entityId).all(); return c.json({ items: rows.results });
});
knowledgeWorkflowRoutes.post("/comments", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, commentSchema); const id = crypto.randomUUID(); const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO record_comments (id, entity_type, entity_id, parent_comment_id, author_user_id, body_markdown, status, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'visible', ?7, ?7)`).bind(id, body.entityType, body.entityId, body.parentCommentId ?? null, userId, body.bodyMarkdown, now).run();
  const usernames = Array.from(new Set([...body.bodyMarkdown.matchAll(/(?:^|\s)@([a-zA-Z0-9_-]{2,64})/gu)].map((match) => match[1].toLowerCase()))).slice(0, 20);
  if (usernames.length) { const users = await c.env.DB.prepare("SELECT id, username FROM profiles WHERE lower(username) IN (SELECT value FROM json_each(?1))").bind(JSON.stringify(usernames)).all<{ id: string; username: string }>(); for (const user of users.results.filter((item) => item.id !== userId)) { await c.env.DB.prepare("INSERT OR IGNORE INTO mentions (id, mentioned_user_id, actor_user_id, entity_type, entity_id, comment_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(crypto.randomUUID(), user.id, userId, body.entityType, body.entityId, id, now).run(); await createInAppNotification(c.env.DB, { userId: user.id, type: "mention", title: "You were mentioned", body: body.bodyMarkdown.slice(0, 200), internalPath: null, data: { entityType: body.entityType, entityId: body.entityId, commentId: id } }); } }
  return c.json({ id, mentions: usernames }, 201);
});

knowledgeWorkflowRoutes.get("/projects/:id/collaborators", loadAuthSession, async (c) => {
  const project = await projectById(c.env.DB, c.req.param("id")); await assertScopedRead(c.env.DB, c.get("authSession")?.user?.id ?? null, project.row);
  const rows = await c.env.DB.prepare(`SELECT * FROM (SELECT pc.role, pc.status, pc.invited_at, pc.responded_at, p.id AS user_id, p.username,
    COALESCE(p.display_name, u.name) AS display_name, p.avatar_url, up.messaging_policy
    FROM project_collaborators pc JOIN user u ON u.id = pc.user_id LEFT JOIN profiles p ON p.id = u.id LEFT JOIN user_preferences up ON up.user_id = u.id
    WHERE pc.project_id = ?1 AND pc.status IN ('active','invited')
    UNION ALL SELECT 'owner' AS role, 'active' AS status, pr.created_at AS invited_at, pr.created_at AS responded_at, p.id AS user_id, p.username,
      COALESCE(p.display_name, u.name) AS display_name, p.avatar_url, up.messaging_policy
      FROM projects pr JOIN user u ON u.id = pr.owner_user_id LEFT JOIN profiles p ON p.id = u.id LEFT JOIN user_preferences up ON up.user_id = u.id
      WHERE pr.id = ?1 AND pr.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM project_collaborators pc WHERE pc.project_id = pr.id AND pc.user_id = pr.owner_user_id))
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'maintainer' THEN 1 ELSE 2 END, display_name`).bind(project.row.id).all<Record<string, unknown>>();
  return c.json({ project: { id: project.row.id, ownerUserId: project.row.owner_user_id, organizationId: project.row.organization_id }, items: rows.results.map((row) => ({ ...row, contactAllowed: row.messaging_policy !== "nobody", messaging_policy: undefined })) });
});
knowledgeWorkflowRoutes.post("/projects/:id/collaborators", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const project = await projectById(c.env.DB, c.req.param("id")); await assertProjectReviewer(c.env.DB, userId, project.row.id); const body = await parseJson(c, collaboratorSchema); const invitee = await c.env.DB.prepare("SELECT id FROM profiles WHERE username = ?1 COLLATE NOCASE").bind(body.username).first<{ id: string }>(); if (!invitee) throw new AppError(404, "USER_NOT_FOUND", "No user has that username."); const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO project_collaborators (project_id, user_id, role, status, invited_by_user_id, invited_at)
    VALUES (?1, ?2, ?3, 'invited', ?4, ?5) ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, status = 'invited', invited_by_user_id = excluded.invited_by_user_id, invited_at = excluded.invited_at, responded_at = NULL`).bind(project.row.id, invitee.id, body.role, userId, now).run();
  await createInAppNotification(c.env.DB, { userId: invitee.id, type: "project_invitation", title: `Invitation to ${project.item.name}`, body: `Role: ${body.role}`, internalPath: `/projects/${project.item.slug}`, data: { projectId: project.row.id, role: body.role } }); return c.json({ invited: true }, 201);
});
knowledgeWorkflowRoutes.post("/projects/:id/collaborators/respond", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, z.object({ accept: z.boolean() }).strict()); const result = await c.env.DB.prepare("UPDATE project_collaborators SET status = ?1, responded_at = ?2 WHERE project_id = ?3 AND user_id = ?4 AND status = 'invited'").bind(body.accept ? "active" : "declined", new Date().toISOString(), c.req.param("id"), userId).run(); if (result.meta.changes !== 1) throw new AppError(404, "INVITATION_NOT_FOUND", "Active project invitation not found."); return c.json({ status: body.accept ? "active" : "declined" });
});

knowledgeWorkflowRoutes.post("/reproductions", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, reproductionSchema); const project = await projectById(c.env.DB, body.projectId); await assertScopedRead(c.env.DB, userId, project.row); const build = await new BuildsRepository(c.env.DB).find(body.buildId); if (!build) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found."); await assertScopedWrite(c.env.DB, userId, build, "build");
  const exact = await c.env.DB.prepare(`SELECT 1 AS valid FROM project_versions pv, bom_versions bv WHERE pv.id = ?1 AND pv.project_id = ?2 AND bv.id = ?3`).bind(body.projectVersionId, body.projectId, body.bomVersionId).first(); if (!exact) throw new AppError(422, "REPRODUCTION_VERSION_INVALID", "The reproduction must reference exact project and BOM versions.");
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const verification = body.status === "evidence_backed" ? "evidence_backed" : body.status === "self_reported_complete" ? "self_reported" : "unverified";
  await c.env.DB.prepare(`INSERT INTO reproductions
    (id, project_id, project_version_id, bom_version_id, build_id, builder_user_id, status, evidence_json, photo_file_ids_json,
     build_time_minutes, cost_json, substitutions_json, problems_json, tests_json, measured_performance_json, verification_state,
     created_at, updated_at, completed_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17, ?18)`)
    .bind(id, body.projectId, body.projectVersionId, body.bomVersionId, body.buildId, userId, body.status, JSON.stringify(body.evidence), JSON.stringify(body.photoFileIds), body.buildTimeMinutes ?? null, JSON.stringify(body.cost), JSON.stringify(body.substitutions), JSON.stringify(body.problems), JSON.stringify(body.tests), JSON.stringify(body.measuredPerformance), verification, now, body.status.includes("complete") || body.status === "evidence_backed" ? now : null).run();
  return c.json({ id, status: body.status, verificationState: verification }, 201);
});
knowledgeWorkflowRoutes.get("/projects/:id/reproductions", loadAuthSession, async (c) => {
  const project = await projectById(c.env.DB, c.req.param("id"));
  await assertScopedRead(c.env.DB, c.get("authSession")?.user?.id ?? null, project.row);
  const rows = await c.env.DB.prepare(`SELECT bp.id, rr.version_label AS release_version, bp.created_at,
    o.outcome, o.independence, o.submitted_at,
    CASE WHEN b.visibility = 'public' THEN o.summary ELSE NULL END AS outcome_summary,
    CASE WHEN b.visibility = 'public' THEN p.username ELSE NULL END AS builder_username,
    CASE WHEN b.visibility = 'public' THEN COALESCE(p.display_name, u.name) ELSE NULL END AS builder_name,
    CASE WHEN b.visibility = 'public' THEN p.avatar_url ELSE NULL END AS builder_avatar_url,
    CASE WHEN b.visibility = 'public' THEN 1 ELSE 0 END AS attribution_public,
    (SELECT COUNT(*) FROM rpps_build_outcome_evidence evidence WHERE evidence.outcome_id = o.id) AS evidence_count
    FROM rpps_build_passports bp
    JOIN rpps_releases rr ON rr.id = bp.release_id
    JOIN builds b ON b.id = bp.build_id AND b.deleted_at IS NULL
    LEFT JOIN rpps_build_outcomes o ON o.release_id = bp.release_id AND o.build_id = bp.build_id
    LEFT JOIN "user" u ON u.id = COALESCE(o.submitted_by_user_id, bp.created_by_user_id)
    LEFT JOIN profiles p ON p.id = u.id
    WHERE rr.project_id = ?1
    ORDER BY COALESCE(o.submitted_at, bp.created_at) DESC`)
    .bind(project.row.id).all<Record<string, unknown>>();
  return c.json({
    items: rows.results,
    publicAttributionCount: rows.results.filter((row) => row.attribution_public === 1).length,
    privateAttributionCount: rows.results.filter((row) => row.attribution_public !== 1).length,
  });
});
knowledgeWorkflowRoutes.post("/reproductions/:id/review", loadAuthSession, requireAuth, async (c) => { const userId = authenticatedUserId(c); const record = await c.env.DB.prepare("SELECT * FROM reproductions WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>(); if (!record) throw new AppError(404, "REPRODUCTION_NOT_FOUND", "Reproduction not found."); await assertProjectReviewer(c.env.DB, userId, String(record.project_id)); const body = await parseJson(c, z.object({ approve: z.boolean(), notes: z.string().trim().max(4_000).optional() }).strict()); const now = new Date().toISOString(); await c.env.DB.prepare("UPDATE reproductions SET status = ?1, verification_state = ?2, reviewed_by_user_id = ?3, reviewed_at = ?4, updated_at = ?4 WHERE id = ?5").bind(body.approve ? "maintainer_reviewed" : record.status, body.approve ? "maintainer_reviewed" : "disputed", userId, now, record.id).run(); return c.json({ verificationState: body.approve ? "maintainer_reviewed" : "disputed" }); });

async function projectById(db: D1Database, id: string) { const project = await new ProjectsRepository(db).find(id); if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found."); return project; }
async function currentProjectVersionId(db: D1Database, projectId: string): Promise<string | null> { return (await db.prepare("SELECT current_version_id FROM projects WHERE id = ?1").bind(projectId).first<{ current_version_id: string | null }>())?.current_version_id ?? null; }
async function readableBuild(db: D1Database, id: string, userId: string | null) { const build = await new BuildsRepository(db).find(id); if (!build) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found."); await assertScopedRead(db, userId, build); return build; }
async function canReadPrivateProjectRecords(db: D1Database, userId: string | null, project: Record<string, unknown>): Promise<boolean> { if (!userId) return false; if (project.owner_user_id === userId) return true; if (project.organization_id && await organizationRole(db, userId, String(project.organization_id))) return true; const member = await db.prepare(`SELECT 1 AS allowed WHERE EXISTS (SELECT 1 FROM project_collaborators WHERE project_id = ?1 AND user_id = ?2 AND status = 'active') OR EXISTS (SELECT 1 FROM project_maintainers WHERE project_id = ?1 AND user_id = ?2)`).bind(project.id, userId).first(); return Boolean(member); }
async function canReadPrivateBuildRecords(db: D1Database, userId: string | null, build: Record<string, unknown>): Promise<boolean> { if (!userId) return false; if (build.owner_user_id === userId) return true; if (build.organization_id && await organizationRole(db, userId, String(build.organization_id))) return true; return Boolean(await db.prepare("SELECT 1 AS allowed FROM build_members WHERE build_id = ?1 AND user_id = ?2").bind(build.id, userId).first()); }
async function assertProjectReviewer(db: D1Database, userId: string, projectId: string) { const project = await projectById(db, projectId); if (project.row.owner_user_id === userId) return; const maintainer = await db.prepare("SELECT role FROM project_maintainers WHERE project_id = ?1 AND user_id = ?2 AND role IN ('owner','maintainer','reviewer')").bind(project.row.id, userId).first(); if (maintainer) return; const collaborator = await db.prepare("SELECT role FROM project_collaborators WHERE project_id = ?1 AND user_id = ?2 AND status = 'active' AND role IN ('owner','maintainer','reviewer')").bind(project.row.id, userId).first(); if (collaborator) return; if (project.row.organization_id && ["owner", "admin"].includes((await organizationRole(db, userId, project.row.organization_id)) ?? "")) return; if (await hasPlatformRole(db, userId, ["moderator", "administrator"])) return; throw new AppError(403, "PROJECT_REVIEW_DENIED", "A project maintainer or reviewer must perform this action."); }
async function projectMaintainerIds(db: D1Database, projectId: string): Promise<string[]> { const rows = await db.prepare(`SELECT user_id FROM project_maintainers WHERE project_id = ?1 UNION SELECT user_id FROM project_collaborators WHERE project_id = ?1 AND status = 'active' AND role IN ('owner','maintainer','reviewer')`).bind(projectId).all<{ user_id: string }>(); return Array.from(new Set(rows.results.map((row) => row.user_id))); }
async function assertVerificationAccess(db: D1Database, userId: string, verification: Record<string, unknown>, write = false) { if (verification.submitter_user_id === userId) return; if (verification.project_id) { if (write) await assertProjectReviewer(db, userId, String(verification.project_id)); else { const project = await projectById(db, String(verification.project_id)); await assertScopedRead(db, userId, project.row); } return; } if (!(await hasPlatformRole(db, userId, ["moderator", "administrator"]))) throw new AppError(403, "BOM_VERIFICATION_ACCESS_DENIED", "You cannot access this verification."); }
function bomLineStatements(db: D1Database, versionId: string, lines: z.infer<typeof bomLineSchema>[]): D1PreparedStatement[] { return lines.map((line) => db.prepare(`INSERT INTO bom_verification_lines
  (id, version_id, line_key, raw_text, component_id, identity_json, quantity, status, confidence, notes)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`).bind(crypto.randomUUID(), versionId, line.lineKey, line.rawText, line.componentId ?? null, JSON.stringify(line.identity), line.quantity ?? null, line.status, line.confidence, line.notes ?? null)); }
async function batch(db: D1Database, statements: D1PreparedStatement[]) { for (let offset = 0; offset < statements.length; offset += 80) await db.batch(statements.slice(offset, offset + 80)); }
function jsonColumns(row: Record<string, unknown>) { const output = { ...row }; for (const [key, value] of Object.entries(row)) if (key.endsWith("_json") && typeof value === "string") { try { output[key.replace(/_json$/u, "")] = JSON.parse(value); } catch { output[key.replace(/_json$/u, "")] = null; } delete output[key]; } return output; }
function analyticsStatement(db: D1Database, projectId: string, type: string, _userId: string, metadata: unknown, now: string) { return db.prepare(`INSERT INTO project_analytics_events
  (id, project_id, event_type, actor_user_hash, metadata_json, occurred_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5)`).bind(crypto.randomUUID(), projectId, type, JSON.stringify(metadata), now); }
async function assertOwnedReadyFiles(db: D1Database, userId: string, fileIds: string[]) { if (!fileIds.length) return; const uniqueIds = Array.from(new Set(fileIds)); const result = await db.prepare("SELECT COUNT(*) AS value FROM files WHERE owner_user_id = ?1 AND status = 'ready' AND deleted_at IS NULL AND id IN (SELECT value FROM json_each(?2))").bind(userId, JSON.stringify(uniqueIds)).first<{ value: number }>(); if (Number(result?.value ?? 0) !== uniqueIds.length) throw new AppError(422, "EVIDENCE_FILE_INVALID", "Every evidence file must be a ready upload owned by you."); }
