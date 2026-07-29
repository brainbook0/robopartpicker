import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedWrite, authenticatedUserId, organizationRole } from "../middleware/authorization";
import { recordAuditEvent } from "../services/audit";
import { classifyImportFormat, processProjectImportJob } from "../services/import-jobs";
import { parseJson } from "../validation";

const createSchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1).max(100),
  projectId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
}).strict();
const candidateSchema = z.object({
  decision: z.enum(["confirmed", "rejected", "merged", "split", "annotated"]),
  classification: z.enum(["purchasable", "fabricated", "assembly", "unresolved"]).optional(),
  notes: z.string().trim().max(4_000).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const projectImportJobRoutes = new Hono<AppBindings>();

projectImportJobRoutes.post("/imports/project-jobs", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, createSchema);
  const uniqueIds = Array.from(new Set(body.fileIds));
  if (body.projectId) {
    const project = await c.env.DB.prepare("SELECT * FROM projects WHERE id = ?1 AND deleted_at IS NULL").bind(body.projectId).first<Record<string, unknown> & { owner_user_id: string | null; organization_id: string | null }>();
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
    await assertScopedWrite(c.env.DB, userId, project, "engineer");
  }
  const files = (await c.env.DB.prepare(`SELECT id, original_name, media_type, size_bytes, checksum_sha256, owner_user_id, organization_id, status
    FROM files WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(uniqueIds)).all<{
      id: string; original_name: string; media_type: string; size_bytes: number; checksum_sha256: string | null;
      owner_user_id: string | null; organization_id: string | null; status: string;
    }>()).results;
  if (files.length !== uniqueIds.length || files.some((file) => file.status !== "ready")) throw new AppError(422, "IMPORT_FILES_NOT_READY", "Every selected file must exist and be ready.");
  for (const file of files) {
    if (file.owner_user_id === userId) continue;
    if (!file.organization_id || !(await organizationRole(c.env.DB, userId, file.organization_id))) throw new AppError(403, "IMPORT_FILE_ACCESS_DENIED", "You cannot import one or more selected files.");
  }
  const now = new Date().toISOString(); const sourceId = "source-user-project-files";
  const idempotencyKey = `${userId}:${body.idempotencyKey ?? crypto.randomUUID()}`;
  const existing = await c.env.DB.prepare("SELECT id, status FROM import_jobs WHERE source_id = ?1 AND idempotency_key = ?2 AND requested_by_user_id = ?3")
    .bind(sourceId, idempotencyKey, userId).first<{ id: string; status: string }>();
  if (existing) return c.json({ item: existing, duplicate: true });
  const jobId = crypto.randomUUID(); const batchId = crypto.randomUUID();
  const classified = files.map((file) => ({ file, ...classifyImportFormat(file.original_name, file.media_type) }));
  const processorKinds = new Set(classified.map((item) => item.processorKind));
  const processorKind = processorKinds.size > 1 ? "mixed" : processorKinds.has("sandbox") ? "sandbox" : "worker";
  const payloadHash = await sha256(JSON.stringify({ fileIds: uniqueIds.slice().sort(), projectId: body.projectId ?? null }));
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO import_sources
      (id, slug, name, source_type, priority, trust_weight, status, created_at, updated_at)
      VALUES (?1, 'user-project-files', 'User project file import', 'file-upload', 100, 1, 'active', ?2, ?2)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`).bind(sourceId, now),
    c.env.DB.prepare(`INSERT INTO import_jobs
      (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash, requested_by_user_id,
       progress_percent, current_stage, queued_at, source_context_json, processor_kind, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 'project-import-analysis/3', 'accepted', ?5, ?6, ?7, 0, 'queued', ?5, ?8, ?9, ?5, ?5)`)
      .bind(jobId, sourceId, batchId, idempotencyKey, now, payloadHash, userId, JSON.stringify({ projectId: body.projectId ?? null, fileIds: uniqueIds }), processorKind),
    eventStatement(c.env.DB, jobId, null, "job.queued", 0, "Import queued for processing.", { fileCount: files.length, processorKind }, now),
  ];
  const names = new Map<string, number>();
  for (const item of classified) {
    const duplicate = names.get(item.file.original_name) ?? 0; names.set(item.file.original_name, duplicate + 1);
    const sourcePath = duplicate ? `${duplicate + 1}-${item.file.original_name}` : item.file.original_name;
    statements.push(c.env.DB.prepare(`INSERT INTO import_job_files
      (id, import_job_id, file_id, source_path, media_type, format_key, size_bytes, checksum_sha256, processor_kind, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'queued', ?10, ?10)`)
      .bind(crypto.randomUUID(), jobId, item.file.id, sourcePath, item.file.media_type, item.formatKey, item.file.size_bytes,
        item.file.checksum_sha256, item.processorKind, now));
  }
  await c.env.DB.batch(statements);
  if (c.env.IMPORT_QUEUE) await c.env.IMPORT_QUEUE.send({ kind: "project-import", jobId });
  else if (c.env.APP_ENV !== "production") c.executionCtx.waitUntil(processProjectImportJob(c.env, jobId));
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "project.import.queue", entityType: "import_job", entityId: jobId,
    requestId: c.get("requestId"), after: { fileCount: files.length, projectId: body.projectId ?? null, processorKind } });
  return c.json({ item: { id: jobId, status: "accepted", progressPercent: 0, processorKind }, queued: Boolean(c.env.IMPORT_QUEUE) }, 202);
});

projectImportJobRoutes.get("/imports/project-jobs", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const rows = await c.env.DB.prepare(`SELECT id, status, progress_percent, current_stage, processor_kind, result_summary_json,
    last_error, created_at, updated_at, completed_at FROM import_jobs WHERE requested_by_user_id = ?1 AND source_id = 'source-user-project-files'
    ORDER BY created_at DESC LIMIT 100`).bind(userId).all<Record<string, unknown>>();
  return c.json({ items: rows.results.map(publicJob), total: rows.results.length });
});

projectImportJobRoutes.get("/imports/project-jobs/:id", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const job = await ownedJob(c.env.DB, c.req.param("id"), userId);
  const [files, events] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM import_job_files WHERE import_job_id = ?1 ORDER BY created_at").bind(job.id).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM import_job_events WHERE import_job_id = ?1 ORDER BY created_at DESC LIMIT 500").bind(job.id).all<Record<string, unknown>>(),
  ]);
  return c.json({ item: publicJob(job), files: files.results.map(publicJobFile), events: events.results.map(publicEvent) });
});

projectImportJobRoutes.post("/imports/project-jobs/:id/cancel", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const job = await ownedJob(c.env.DB, c.req.param("id"), userId);
  if (["complete", "partial", "failed", "cancelled"].includes(String(job.status))) throw new AppError(409, "IMPORT_NOT_CANCELLABLE", "This import is no longer running.");
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE import_jobs SET cancellation_requested = 1, current_stage = 'cancelling', updated_at = ?1 WHERE id = ?2").bind(now, job.id),
    eventStatement(c.env.DB, job.id, null, "job.cancellation_requested", Number(job.progress_percent ?? 0), "Cancellation requested.", {}, now),
  ]);
  return c.json({ cancelled: false, cancellationRequested: true }, 202);
});

projectImportJobRoutes.post("/imports/project-jobs/:id/retry", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const job = await ownedJob(c.env.DB, c.req.param("id"), userId);
  if (!["failed", "partial", "cancelled"].includes(String(job.status))) throw new AppError(409, "IMPORT_NOT_RETRYABLE", "Only failed, partial, or cancelled imports can be retried.");
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE import_jobs SET status = 'accepted', cancellation_requested = 0, progress_percent = 0, current_stage = 'queued',
      last_error = NULL, completed_at = NULL, queued_at = ?1, updated_at = ?1 WHERE id = ?2`).bind(now, job.id),
    c.env.DB.prepare(`UPDATE import_job_files SET status = 'queued', progress_percent = 0, retry_count = retry_count + 1,
      warnings_json = '[]', missing_dependencies_json = '[]', result_json = '{}', completed_at = NULL, updated_at = ?1
      WHERE import_job_id = ?2 AND status IN ('failed', 'unsupported', 'cancelled')`).bind(now, job.id),
    eventStatement(c.env.DB, job.id, null, "job.retried", 0, "Import queued for retry.", {}, now),
  ]);
  if (c.env.IMPORT_QUEUE) await c.env.IMPORT_QUEUE.send({ kind: "project-import", jobId: job.id });
  else if (c.env.APP_ENV !== "production") c.executionCtx.waitUntil(processProjectImportJob(c.env, job.id));
  return c.json({ id: job.id, status: "accepted" }, 202);
});

projectImportJobRoutes.get("/imports/project-jobs/:id/robot-structure", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const job = await ownedJob(c.env.DB, c.req.param("id"), userId);
  const snapshot = await c.env.DB.prepare("SELECT * FROM robot_structure_snapshots WHERE import_job_id = ?1 ORDER BY created_at DESC LIMIT 1").bind(job.id).first<Record<string, unknown>>();
  if (!snapshot) throw new AppError(404, "ROBOT_STRUCTURE_NOT_FOUND", "No robot structure was extracted from this import.");
  const [links, joints, candidates] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM robot_structure_links WHERE snapshot_id = ?1 ORDER BY sort_order").bind(snapshot.id).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM robot_structure_joints WHERE snapshot_id = ?1 ORDER BY sort_order").bind(snapshot.id).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM robot_component_candidates WHERE snapshot_id = ?1 ORDER BY created_at").bind(snapshot.id).all<Record<string, unknown>>(),
  ]);
  return c.json({ snapshot: parseJsonColumns(snapshot), links: links.results.map(parseJsonColumns), joints: joints.results.map(parseJsonColumns), candidates: candidates.results.map(parseJsonColumns) });
});

projectImportJobRoutes.patch("/imports/project-jobs/:id/robot-candidates/:candidateId", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const job = await ownedJob(c.env.DB, c.req.param("id"), userId); const body = await parseJson(c, candidateSchema);
  const candidate = await c.env.DB.prepare(`SELECT rc.* FROM robot_component_candidates rc JOIN robot_structure_snapshots rs ON rs.id = rc.snapshot_id
    WHERE rc.id = ?1 AND rs.import_job_id = ?2`).bind(c.req.param("candidateId"), job.id).first<Record<string, unknown>>();
  if (!candidate) throw new AppError(404, "ROBOT_CANDIDATE_NOT_FOUND", "Extracted component candidate not found.");
  const reviewStatus = body.decision === "annotated" ? String(candidate.review_status) : body.decision;
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE robot_component_candidates SET review_status = ?1, classification = COALESCE(?2, classification), notes = COALESCE(?3, notes),
      reviewed_by_user_id = ?4, reviewed_at = ?5 WHERE id = ?6`).bind(reviewStatus, body.classification ?? null, body.notes ?? null, userId, now, candidate.id),
    c.env.DB.prepare(`INSERT INTO robot_component_candidate_events (id, candidate_id, actor_user_id, event_type, payload_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(crypto.randomUUID(), candidate.id, userId, body.decision, JSON.stringify({ ...body.payload, classification: body.classification, notes: body.notes }), now),
  ]);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: `robot.candidate.${body.decision}`, entityType: "robot_component_candidate", entityId: String(candidate.id), requestId: c.get("requestId"), after: body });
  return c.json({ id: candidate.id, reviewStatus, classification: body.classification ?? candidate.classification, notes: body.notes ?? candidate.notes });
});

async function ownedJob(db: D1Database, id: string, userId: string): Promise<Record<string, unknown> & { id: string }> {
  const row = await db.prepare("SELECT * FROM import_jobs WHERE id = ?1 AND requested_by_user_id = ?2 AND source_id = 'source-user-project-files'").bind(id, userId).first<Record<string, unknown> & { id: string }>();
  if (!row) throw new AppError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found.");
  return row;
}
function publicJob(row: Record<string, unknown>) { const parsed = parseJsonColumns(row); return { ...parsed, source_context_json: undefined, payload_hash: undefined, idempotency_key: undefined }; }
function publicJobFile(row: Record<string, unknown>) { return parseJsonColumns(row); }
function publicEvent(row: Record<string, unknown>) { return parseJsonColumns(row); }
function parseJsonColumns(row: Record<string, unknown>): Record<string, unknown> {
  const output = { ...row };
  for (const [key, value] of Object.entries(row)) if (key.endsWith("_json") && typeof value === "string") {
    try { output[key.replace(/_json$/u, "")] = JSON.parse(value); } catch { output[key.replace(/_json$/u, "")] = null; }
    delete output[key];
  }
  return output;
}
function eventStatement(db: D1Database, jobId: string, fileId: string | null, type: string, progress: number | null, message: string, detail: unknown, now: string) {
  return db.prepare(`INSERT INTO import_job_events (id, import_job_id, import_job_file_id, event_type, progress_percent, message, detail_json, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(crypto.randomUUID(), jobId, fileId, type, progress, message, JSON.stringify(detail), now);
}
async function sha256(value: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
