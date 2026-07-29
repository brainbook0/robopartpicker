export const SCRAPE_QUEUE_MESSAGE_MAX_BYTES = 65_536;
export const SCRAPE_QUEUE_PLATFORM_MAX_BYTES = 128_000;

const pointerFields = new Set([
  "kind",
  "schemaVersion",
  "collectionJobId",
  "sourceId",
  "payloadHash",
  "generation",
  "traceId",
  "traceparent",
]);

export interface ScrapeIngestionQueueMessage {
  kind: "scrape-ingestion";
  schemaVersion: "1.0";
  collectionJobId: string;
  sourceId: string;
  payloadHash: string;
  generation: number;
  traceId: string;
  traceparent?: string;
}

interface CollectionJobRow {
  id: string;
  source_id: string;
  status: string;
  payload_hash: string | null;
  attempt_count: number;
  max_attempts: number;
  import_job_id: string | null;
  trace_id: string;
  backoff_until: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
}

interface QueueMessageLike {
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface QueueBatchLike {
  queue: string;
  messages: readonly QueueMessageLike[];
}

interface QueueLike {
  send(message: ScrapeIngestionQueueMessage): Promise<unknown>;
}

export class RetryableScrapeIngestionError extends Error {}
export class PermanentScrapeIngestionError extends Error {}

export function parseScrapeIngestionQueueMessage(value: unknown): ScrapeIngestionQueueMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PermanentScrapeIngestionError("Scrape Queue pointer must be an object.");
  }
  const object = value as Record<string, unknown>;
  const unknown = Object.keys(object).filter((key) => !pointerFields.has(key));
  if (unknown.length) {
    throw new PermanentScrapeIngestionError(`Scrape Queue pointer has unknown field: ${unknown[0]}.`);
  }
  if (object.kind !== "scrape-ingestion" || object.schemaVersion !== "1.0") {
    throw new PermanentScrapeIngestionError("Scrape Queue pointer kind or schemaVersion is invalid.");
  }
  for (const field of ["collectionJobId", "sourceId"] as const) {
    if (typeof object[field] !== "string" || object[field].length < 1 || object[field].length > 200) {
      throw new PermanentScrapeIngestionError(`Scrape Queue pointer ${field} is invalid.`);
    }
  }
  if (typeof object.payloadHash !== "string" || !/^[0-9a-f]{64}$/u.test(object.payloadHash)) {
    throw new PermanentScrapeIngestionError("Scrape Queue pointer payloadHash must be lowercase 64-hex.");
  }
  if (typeof object.traceId !== "string" || !/^[0-9a-f]{32}$/u.test(object.traceId)) {
    throw new PermanentScrapeIngestionError("Scrape Queue pointer traceId must be lowercase 32-hex.");
  }
  if (!Number.isSafeInteger(object.generation) || Number(object.generation) < 1) {
    throw new PermanentScrapeIngestionError("Scrape Queue pointer generation must be a positive integer.");
  }
  if (
    object.traceparent !== undefined
    && (typeof object.traceparent !== "string"
      || !/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u.test(object.traceparent))
  ) {
    throw new PermanentScrapeIngestionError("Scrape Queue pointer traceparent is invalid.");
  }
  const parsed: ScrapeIngestionQueueMessage = {
    kind: "scrape-ingestion",
    schemaVersion: "1.0",
    collectionJobId: object.collectionJobId as string,
    sourceId: object.sourceId as string,
    payloadHash: object.payloadHash,
    generation: Number(object.generation),
    traceId: object.traceId,
  };
  if (typeof object.traceparent === "string") parsed.traceparent = object.traceparent;
  assertQueueMessageSize(parsed);
  return parsed;
}

export function assertQueueMessageSize(value: unknown): number {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > SCRAPE_QUEUE_MESSAGE_MAX_BYTES) {
    throw new PermanentScrapeIngestionError(
      `Scrape Queue messages are limited to the internal 65,536-byte cap; received ${bytes}.`,
    );
  }
  return bytes;
}

export function assertQueueMessageMatchesQueue(queueName: string, body: unknown): void {
  const kind = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { kind?: unknown }).kind
    : undefined;
  const scrapeQueue = queueName.includes("scrape-ingestion");
  if ((scrapeQueue && kind !== "scrape-ingestion") || (!scrapeQueue && kind === "scrape-ingestion")) {
    throw new PermanentScrapeIngestionError("queue/message mismatch");
  }
}

export async function processScrapeIngestionBatch(
  batch: QueueBatchLike,
  env: { DB: D1Database },
  options: {
    now?: () => string;
    process?: (job: CollectionJobRow, pointer: ScrapeIngestionQueueMessage) => Promise<void>;
  } = {},
): Promise<void> {
  const now = options.now ?? (() => new Date().toISOString());
  for (const message of batch.messages) {
    let pointer: ScrapeIngestionQueueMessage | null = null;
    let claimed: CollectionJobRow | null = null;
    try {
      assertQueueMessageMatchesQueue(batch.queue, message.body);
      pointer = parseScrapeIngestionQueueMessage(message.body);
      claimed = await claimCollectionJob(env.DB, pointer, now());
      if (claimed === null) {
        message.ack();
        continue;
      }
      if (options.process) await options.process(claimed, pointer);
      else await prepareImportForReview(env.DB, claimed, now());
      await completeCollectionJob(env.DB, claimed, now());
      message.ack();
    } catch (error) {
      const terminal = error instanceof PermanentScrapeIngestionError
        || message.attempts >= (claimed?.max_attempts ?? 3);
      if (pointer && claimed) {
        await checkpointFailure(env.DB, pointer, error, terminal, message.attempts, now());
      }
      if (terminal) message.retry();
      else message.retry({ delaySeconds: retryDelay(message.attempts) });
    }
  }
}

export async function enqueueScrapeIngestionJob(input: {
  db: D1Database;
  queue: QueueLike;
  jobId: string;
  importJobId: string;
  now: string;
  traceparent?: string;
}): Promise<{ enqueued: boolean; generation: number }> {
  assertTimestamp(input.now, "now");
  const relationship = await input.db.prepare(`
    SELECT
      cj.id, cj.source_id, cj.status, cj.payload_hash, cj.attempt_count, cj.max_attempts,
      cj.import_job_id, cj.trace_id, cj.backoff_until, cj.lease_owner, cj.lease_expires_at,
      ij.source_id AS import_source_id, ij.payload_hash AS import_payload_hash, ij.trace_id AS import_trace_id
    FROM collection_jobs AS cj
    JOIN import_jobs AS ij ON ij.id = ?1
    WHERE cj.id = ?2
  `).bind(input.importJobId, input.jobId).first<CollectionJobRow & {
    import_source_id: string;
    import_payload_hash: string;
    import_trace_id: string | null;
  }>();
  if (!relationship) {
    throw new PermanentScrapeIngestionError("Collection job or import job was not found.");
  }
  if (
    relationship.source_id !== relationship.import_source_id
    || relationship.payload_hash !== relationship.import_payload_hash
    || relationship.trace_id !== relationship.import_trace_id
  ) {
    throw new PermanentScrapeIngestionError("Collection and import job lineage does not match.");
  }
  if (relationship.status !== "queued") {
    return { enqueued: false, generation: relationship.attempt_count };
  }
  if (!relationship.payload_hash) {
    throw new PermanentScrapeIngestionError("Collection job has no payload hash.");
  }

  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.parse(input.now) + 5 * 60_000).toISOString();
  const linked = await input.db.prepare(`
    UPDATE collection_jobs
    SET status = 'submitting',
        attempt_count = attempt_count + 1,
        import_job_id = ?1,
        lease_token = ?2,
        lease_owner = 'scrape-ingestion-producer',
        leased_at = ?3,
        lease_expires_at = ?4,
        started_at = COALESCE(started_at, ?3),
        updated_at = ?3
    WHERE id = ?5 AND status = 'queued' AND attempt_count = ?6 AND import_job_id IS NULL
    RETURNING id, source_id, status, payload_hash, attempt_count, max_attempts, import_job_id, trace_id,
              backoff_until, lease_owner, lease_expires_at
  `).bind(
    input.importJobId,
    leaseToken,
    input.now,
    leaseExpiresAt,
    input.jobId,
    relationship.attempt_count,
  ).first<CollectionJobRow>();
  if (!linked) {
    const current = await input.db.prepare(`
      SELECT attempt_count FROM collection_jobs WHERE id = ?1
    `).bind(input.jobId).first<{ attempt_count: number }>();
    return { enqueued: false, generation: current?.attempt_count ?? relationship.attempt_count };
  }

  const pointer = parseScrapeIngestionQueueMessage({
    kind: "scrape-ingestion",
    schemaVersion: "1.0",
    collectionJobId: linked.id,
    sourceId: linked.source_id,
    payloadHash: linked.payload_hash,
    generation: linked.attempt_count,
    traceId: linked.trace_id,
    ...(input.traceparent ? { traceparent: input.traceparent } : {}),
  });
  await appendLifecycle(input.db, linked, {
    eventType: "queue.enqueued",
    fromStatus: "queued",
    toStatus: "submitting",
    reason: "normalized import queued for review preparation",
    details: { generation: linked.attempt_count },
    occurredAt: input.now,
  });
  try {
    await input.queue.send(pointer);
  } catch (error) {
    await failEnqueue(input.db, linked, sanitizeError(error), input.now);
    throw error;
  }
  return { enqueued: true, generation: linked.attempt_count };
}

export async function queueImportForReview(input: {
  db: D1Database;
  queue: QueueLike;
  importJobId: string;
  now: string;
  sourcePolicyRevisionId?: string | null;
  traceparent?: string;
}): Promise<{ collectionJobId: string; enqueued: boolean; generation: number }> {
  assertTimestamp(input.now, "now");
  const imported = await input.db.prepare(`
    SELECT id, source_id, schema_version, status, payload_hash, trace_id
    FROM import_jobs WHERE id = ?1
  `).bind(input.importJobId).first<{
    id: string;
    source_id: string;
    schema_version: string;
    status: string;
    payload_hash: string;
    trace_id: string | null;
  }>();
  if (!imported) throw new PermanentScrapeIngestionError("Import job was not found.");
  if (imported.schema_version !== "2.0" || !["staged", "partial", "review"].includes(imported.status)) {
    throw new PermanentScrapeIngestionError("Only a staged v2 import can be queued for review.");
  }
  if (!imported.trace_id) throw new PermanentScrapeIngestionError("Import job has no trace ID.");
  if (input.sourcePolicyRevisionId) {
    const policy = await input.db.prepare(`
      SELECT id FROM source_policy_revisions WHERE id = ?1 AND source_id = ?2
    `).bind(input.sourcePolicyRevisionId, imported.source_id).first<{ id: string }>();
    if (!policy) throw new PermanentScrapeIngestionError("Source policy revision does not match the import source.");
  }

  const dedupKey = `submission:${imported.id}`;
  const candidateId = crypto.randomUUID();
  await input.db.prepare(`
    INSERT OR IGNORE INTO collection_jobs
      (id, source_id, source_policy_revision_id, job_type, status, payload_hash, dedup_key,
       priority, scheduled_for, attempt_count, max_attempts, trace_id, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'submission', 'queued', ?4, ?5, 10, ?6, 0, 3, ?7, ?6, ?6)
  `).bind(
    candidateId,
    imported.source_id,
    input.sourcePolicyRevisionId ?? null,
    imported.payload_hash,
    dedupKey,
    input.now,
    imported.trace_id,
  ).run();
  const collection = await input.db.prepare(`
    SELECT id FROM collection_jobs WHERE source_id = ?1 AND dedup_key = ?2
  `).bind(imported.source_id, dedupKey).first<{ id: string }>();
  if (!collection) throw new RetryableScrapeIngestionError("Collection job could not be claimed.");

  const outcome = await enqueueScrapeIngestionJob({
    db: input.db,
    queue: input.queue,
    jobId: collection.id,
    importJobId: imported.id,
    now: input.now,
    ...(input.traceparent ? { traceparent: input.traceparent } : {}),
  });
  return { collectionJobId: collection.id, ...outcome };
}

export async function resumeScrapeIngestionJob(input: {
  db: D1Database;
  queue: QueueLike;
  jobId: string;
  actorUserId: string;
  actorRole: string;
  now: string;
}): Promise<{ enqueued: boolean; generation: number }> {
  if (input.actorRole !== "administrator") {
    throw new PermanentScrapeIngestionError("Only an administrator can resume scrape ingestion.");
  }
  assertTimestamp(input.now, "now");
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.parse(input.now) + 5 * 60_000).toISOString();
  const resumed = await input.db.prepare(`
    UPDATE collection_jobs
    SET status = 'submitting',
        attempt_count = attempt_count + 1,
        lease_token = ?1,
        lease_owner = 'manual-resume',
        leased_at = ?2,
        lease_expires_at = ?3,
        backoff_until = NULL,
        last_error = NULL,
        updated_at = ?2
    WHERE id = ?4 AND status IN ('failed', 'deferred', 'denied')
    RETURNING id, source_id, status, payload_hash, attempt_count, max_attempts, import_job_id, trace_id,
              backoff_until, lease_owner, lease_expires_at
  `).bind(leaseToken, input.now, leaseExpiresAt, input.jobId).first<CollectionJobRow>();
  if (!resumed) {
    const existing = await input.db.prepare(`
      SELECT attempt_count FROM collection_jobs WHERE id = ?1
    `).bind(input.jobId).first<{ attempt_count: number }>();
    if (!existing) throw new PermanentScrapeIngestionError("Collection job was not found.");
    return { enqueued: false, generation: existing.attempt_count };
  }
  if (!resumed.payload_hash) {
    await failResume(input.db, resumed, "Collection job has no payload hash.", input.now);
    throw new PermanentScrapeIngestionError("Collection job has no payload hash.");
  }
  const pointer: ScrapeIngestionQueueMessage = {
    kind: "scrape-ingestion",
    schemaVersion: "1.0",
    collectionJobId: resumed.id,
    sourceId: resumed.source_id,
    payloadHash: resumed.payload_hash,
    generation: resumed.attempt_count,
    traceId: resumed.trace_id,
  };
  assertQueueMessageSize(pointer);
  await appendLifecycle(input.db, resumed, {
    eventType: "queue.resumed",
    fromStatus: "failed",
    toStatus: "submitting",
    reason: "administrator manual resume",
    details: { actorUserId: input.actorUserId, generation: resumed.attempt_count },
    occurredAt: input.now,
  });
  try {
    await input.queue.send(pointer);
  } catch (error) {
    await failResume(input.db, resumed, sanitizeError(error), input.now);
    throw error;
  }
  return { enqueued: true, generation: resumed.attempt_count };
}

async function claimCollectionJob(
  db: D1Database,
  pointer: ScrapeIngestionQueueMessage,
  now: string,
): Promise<CollectionJobRow | null> {
  assertTimestamp(now, "now");
  const existing = await db.prepare(`
    SELECT id, source_id, status, payload_hash, attempt_count, max_attempts, import_job_id, trace_id,
           backoff_until, lease_owner, lease_expires_at
    FROM collection_jobs WHERE id = ?1
  `).bind(pointer.collectionJobId).first<CollectionJobRow>();
  if (!existing) throw new PermanentScrapeIngestionError("Collection job was not found.");
  if (existing.status === "complete") return null;
  if (
    existing.source_id !== pointer.sourceId
    || existing.payload_hash !== pointer.payloadHash
    || existing.trace_id !== pointer.traceId
    || existing.attempt_count !== pointer.generation
  ) {
    throw new PermanentScrapeIngestionError("Queue pointer does not match the durable collection job.");
  }
  if (existing.backoff_until && existing.backoff_until > now) {
    throw new RetryableScrapeIngestionError("Collection job backoff has not elapsed.");
  }
  if (
    existing.status === "submitting"
    && existing.lease_owner === "scrape-ingestion-consumer"
    && existing.lease_expires_at
    && existing.lease_expires_at > now
  ) {
    throw new RetryableScrapeIngestionError("Collection job already has an active consumer lease.");
  }
  if (!["submitting", "failed"].includes(existing.status)) {
    throw new PermanentScrapeIngestionError(`Collection job cannot process from ${existing.status}.`);
  }
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.parse(now) + 5 * 60_000).toISOString();
  const claimed = await db.prepare(`
    UPDATE collection_jobs
    SET status = 'submitting',
        lease_token = ?1,
        lease_owner = 'scrape-ingestion-consumer',
        leased_at = ?2,
        lease_expires_at = ?3,
        updated_at = ?2
    WHERE id = ?4
      AND source_id = ?5
      AND payload_hash = ?6
      AND trace_id = ?7
      AND attempt_count = ?8
      AND status IN ('submitting', 'failed')
    RETURNING id, source_id, status, payload_hash, attempt_count, max_attempts, import_job_id, trace_id,
              backoff_until, lease_owner, lease_expires_at
  `).bind(
    leaseToken,
    now,
    leaseExpiresAt,
    pointer.collectionJobId,
    pointer.sourceId,
    pointer.payloadHash,
    pointer.traceId,
    pointer.generation,
  ).first<CollectionJobRow>();
  if (!claimed) throw new RetryableScrapeIngestionError("Collection job was claimed concurrently.");
  await appendLifecycle(db, claimed, {
    eventType: "queue.processing",
    fromStatus: existing.status,
    toStatus: "submitting",
    reason: "scrape-ingestion pointer claimed",
    details: { generation: pointer.generation },
    occurredAt: now,
  });
  return claimed;
}

async function prepareImportForReview(db: D1Database, job: CollectionJobRow, now: string): Promise<void> {
  if (!job.import_job_id) {
    throw new PermanentScrapeIngestionError("Submission collection job has no import job.");
  }
  const imported = await db.prepare(`
    SELECT id, status, trace_id FROM import_jobs WHERE id = ?1
  `).bind(job.import_job_id).first<{ id: string; status: string; trace_id: string | null }>();
  if (!imported) throw new PermanentScrapeIngestionError("Import job was not found.");
  if (imported.trace_id !== job.trace_id) {
    throw new PermanentScrapeIngestionError("Import and collection trace IDs do not match.");
  }
  await db.batch([
    db.prepare(`
      UPDATE import_records
      SET status = 'review', updated_at = ?1
      WHERE import_job_id = ?2 AND status = 'staged'
    `).bind(now, job.import_job_id),
    db.prepare(`
      UPDATE import_jobs
      SET status = 'review', updated_at = ?1
      WHERE id = ?2 AND status IN ('staged', 'partial')
    `).bind(now, job.import_job_id),
  ]);
}

async function completeCollectionJob(db: D1Database, job: CollectionJobRow, now: string): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE collection_jobs
      SET status = 'complete',
          lease_token = NULL,
          lease_owner = NULL,
          leased_at = NULL,
          lease_expires_at = NULL,
          backoff_until = NULL,
          last_error = NULL,
          completed_at = ?1,
          updated_at = ?1
      WHERE id = ?2 AND status = 'submitting'
    `).bind(now, job.id),
    lifecycleStatement(db, job, {
      eventType: "review.prepared",
      fromStatus: "submitting",
      toStatus: "complete",
      reason: "normalized import prepared for human review",
      details: { importJobId: job.import_job_id },
      occurredAt: now,
    }),
  ]);
}

async function checkpointFailure(
  db: D1Database,
  pointer: ScrapeIngestionQueueMessage,
  error: unknown,
  terminal: boolean,
  attempts: number,
  now: string,
): Promise<void> {
  const detail = sanitizeError(error);
  const delay = terminal ? 0 : retryDelay(attempts);
  const backoffUntil = terminal ? null : new Date(Date.parse(now) + delay * 1_000).toISOString();
  const job = await db.prepare(`
    SELECT id, source_id, status, payload_hash, attempt_count, max_attempts, import_job_id, trace_id,
           backoff_until, lease_owner, lease_expires_at
    FROM collection_jobs WHERE id = ?1 AND trace_id = ?2
  `).bind(pointer.collectionJobId, pointer.traceId).first<CollectionJobRow>();
  if (!job) return;
  await db.batch([
    db.prepare(`
      UPDATE collection_jobs
      SET status = 'failed',
          lease_token = NULL,
          lease_owner = NULL,
          leased_at = NULL,
          lease_expires_at = NULL,
          backoff_until = ?1,
          last_error = ?2,
          completed_at = CASE WHEN ?3 = 1 THEN ?4 ELSE NULL END,
          updated_at = ?4
      WHERE id = ?5
    `).bind(backoffUntil, detail, terminal ? 1 : 0, now, job.id),
    lifecycleStatement(db, job, {
      eventType: terminal ? "queue.terminal_failure" : "queue.retrying",
      fromStatus: job.status,
      toStatus: "failed",
      reason: detail,
      details: { attempts, terminal, backoffUntil },
      occurredAt: now,
    }),
  ]);
}

async function appendLifecycle(
  db: D1Database,
  job: CollectionJobRow,
  event: LifecycleInput,
): Promise<void> {
  await lifecycleStatement(db, job, event).run();
}

interface LifecycleInput {
  eventType: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  details: Record<string, unknown>;
  occurredAt: string;
}

function lifecycleStatement(
  db: D1Database,
  job: CollectionJobRow,
  event: LifecycleInput,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO collection_lifecycle_events
      (id, collection_job_id, source_id, import_job_id, event_type, from_status, to_status,
       reason, details_json, trace_id, occurred_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
  `).bind(
    crypto.randomUUID(),
    job.id,
    job.source_id,
    job.import_job_id,
    event.eventType,
    event.fromStatus,
    event.toStatus,
    event.reason,
    JSON.stringify(event.details),
    job.trace_id,
    event.occurredAt,
  );
}

async function failResume(
  db: D1Database,
  job: CollectionJobRow,
  reason: string,
  now: string,
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE collection_jobs
      SET status = 'failed', lease_token = NULL, lease_owner = NULL, leased_at = NULL,
          lease_expires_at = NULL, last_error = ?1, completed_at = ?2, updated_at = ?2
      WHERE id = ?3
    `).bind(reason, now, job.id),
    lifecycleStatement(db, job, {
      eventType: "queue.resume_failed",
      fromStatus: "submitting",
      toStatus: "failed",
      reason,
      details: {},
      occurredAt: now,
    }),
  ]);
}

async function failEnqueue(
  db: D1Database,
  job: CollectionJobRow,
  reason: string,
  now: string,
): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE collection_jobs
      SET status = 'failed', lease_token = NULL, lease_owner = NULL, leased_at = NULL,
          lease_expires_at = NULL, last_error = ?1, completed_at = ?2, updated_at = ?2
      WHERE id = ?3
    `).bind(reason, now, job.id),
    lifecycleStatement(db, job, {
      eventType: "queue.enqueue_failed",
      fromStatus: "submitting",
      toStatus: "failed",
      reason,
      details: {},
      occurredAt: now,
    }),
  ]);
}

function retryDelay(attempts: number): number {
  return Math.min(300, 15 * (2 ** Math.max(0, attempts - 1)));
}

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Scrape ingestion failed.")
    .replace(/[\r\n]+/gu, " ")
    .slice(0, 1_000);
}

function assertTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value)) || !value.endsWith("Z")) {
    throw new PermanentScrapeIngestionError(`${label} must be an ISO-8601 UTC timestamp.`);
  }
}
