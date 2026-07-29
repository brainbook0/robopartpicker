import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  PermanentScrapeIngestionError,
  RetryableScrapeIngestionError,
  assertQueueMessageMatchesQueue,
  assertQueueMessageSize,
  parseScrapeIngestionQueueMessage,
  processScrapeIngestionBatch,
  enqueueScrapeIngestionJob,
  queueImportForReview,
  resumeScrapeIngestionJob,
  type ScrapeIngestionQueueMessage,
} from "../../worker/services/scrape-ingestion-jobs";


const sourceId = "scrape-queue-source";
const traceId = "abcdef0123456789abcdef0123456789";
const now = "2026-07-29T12:00:00.000Z";
const payloadHash = "a".repeat(64);

function queueMessage(body: ScrapeIngestionQueueMessage, attempts = 1) {
  const disposition: Array<{ type: "ack" | "retry"; delaySeconds?: number }> = [];
  return {
    body,
    attempts,
    disposition,
    ack() {
      disposition.push({ type: "ack" });
    },
    retry(options?: { delaySeconds?: number }) {
      disposition.push({ type: "retry", delaySeconds: options?.delaySeconds });
    },
  };
}

function batch(message: ReturnType<typeof queueMessage>) {
  return {
    queue: "robopartpicker-scrape-ingestion-test",
    messages: [message],
  };
}

function pointer(collectionJobId: string, generation = 1, includeTraceparent = true): ScrapeIngestionQueueMessage {
  return {
    kind: "scrape-ingestion",
    schemaVersion: "1.0",
    collectionJobId,
    sourceId,
    payloadHash,
    generation,
    traceId,
    ...(includeTraceparent ? { traceparent: `00-${traceId}-0123456789abcdef-01` } : {}),
  };
}

async function seedImportReviewJob(collectionJobId: string, importJobId: string, importRecordId: string) {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO import_jobs
        (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash, trace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, '2.0', 'staged', ?, ?, ?, ?, ?)
    `).bind(importJobId, sourceId, `${importJobId}-batch`, `${importJobId}-idempotency`, now, payloadHash, traceId, now, now),
    env.DB.prepare(`
      INSERT INTO import_records
        (id, import_job_id, source_id, external_record_id, record_type, confidence, raw_payload_json, parsed_data_json, status, trace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'component', 1, '{}', '{}', 'staged', ?, ?, ?)
    `).bind(importRecordId, importJobId, sourceId, `${importRecordId}-external`, traceId, now, now),
    env.DB.prepare(`
      INSERT INTO collection_jobs
        (id, source_id, job_type, status, payload_hash, dedup_key, priority, scheduled_for,
         lease_token, lease_owner, leased_at, lease_expires_at, attempt_count, max_attempts,
         import_job_id, trace_id, created_at, updated_at)
      VALUES (?, ?, 'submission', 'submitting', ?, ?, 10, ?, ?, 'queue-producer', ?, ?, 1, 3, ?, ?, ?, ?)
    `).bind(
      collectionJobId,
      sourceId,
      payloadHash,
      `${collectionJobId}-dedup`,
      now,
      `${collectionJobId}-producer-token`,
      now,
      "2026-07-29T12:05:00.000Z",
      importJobId,
      traceId,
      now,
      now,
    ),
  ]);
}

async function seedQueuedSubmissionJob(collectionJobId: string, importJobId: string) {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO import_jobs
        (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash, trace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, '2.0', 'staged', ?, ?, ?, ?, ?)
    `).bind(importJobId, sourceId, `${importJobId}-batch`, `${importJobId}-idempotency`, now, payloadHash, traceId, now, now),
    env.DB.prepare(`
      INSERT INTO collection_jobs
        (id, source_id, job_type, status, payload_hash, dedup_key, priority, scheduled_for,
         attempt_count, max_attempts, trace_id, created_at, updated_at)
      VALUES (?, ?, 'submission', 'queued', ?, ?, 10, ?, 0, 3, ?, ?, ?)
    `).bind(collectionJobId, sourceId, payloadHash, `${collectionJobId}-dedup`, now, traceId, now, now),
  ]);
}

beforeAll(async () => {
  await env.DB.prepare(`
    INSERT INTO import_sources
      (id, slug, name, source_type, base_url, priority, trust_weight, status, created_at, updated_at)
    VALUES (?, ?, 'Scrape queue fixture', 'manufacturer', 'https://example.com', 10, 1, 'active', ?, ?)
  `).bind(sourceId, sourceId, now, now).run();
});

describe("scrape-ingestion pointer contract", () => {
  it("accepts only the bounded pointer schema and rejects evidence-bearing messages", () => {
    expect(parseScrapeIngestionQueueMessage(pointer("pointer-job"))).toEqual(pointer("pointer-job"));
    expect(() => parseScrapeIngestionQueueMessage({
      ...pointer("pointer-job"),
      rawEvidence: "must never enter Queue",
    })).toThrow("unknown field");
    expect(() => assertQueueMessageSize({
      ...pointer("pointer-job"),
      padding: "x".repeat(65_536),
    })).toThrow("65,536-byte");
  });

  it("isolates scrape messages from project-import and AI queues", () => {
    expect(() => assertQueueMessageMatchesQueue(
      "robopartpicker-scrape-ingestion-test",
      { kind: "project-import" },
    )).toThrow("queue/message mismatch");
    expect(() => assertQueueMessageMatchesQueue(
      "robopartpicker-imports-test",
      pointer("pointer-job"),
    )).toThrow("queue/message mismatch");
  });
});

describe("scrape-ingestion processing", () => {
  it("checkpoints review preparation before acknowledging the pointer", async () => {
    await seedImportReviewJob("scrape-success", "scrape-success-import", "scrape-success-record");
    const message = queueMessage(pointer("scrape-success"));

    await processScrapeIngestionBatch(batch(message), { DB: env.DB }, { now: () => now });

    expect(message.disposition).toEqual([{ type: "ack" }]);
    expect(await env.DB.prepare(`
      SELECT status, lease_token, import_job_id, trace_id
      FROM collection_jobs WHERE id = 'scrape-success'
    `).first()).toEqual({
      status: "complete",
      lease_token: null,
      import_job_id: "scrape-success-import",
      trace_id: traceId,
    });
    expect(await env.DB.prepare("SELECT status FROM import_jobs WHERE id = 'scrape-success-import'").first())
      .toEqual({ status: "review" });
    expect(await env.DB.prepare("SELECT status FROM import_records WHERE id = 'scrape-success-record'").first())
      .toEqual({ status: "review" });
    const events = await env.DB.prepare(`
      SELECT event_type, trace_id FROM collection_lifecycle_events
      WHERE collection_job_id = 'scrape-success' ORDER BY rowid
    `).all();
    expect(events.results).toEqual([
      { event_type: "queue.processing", trace_id: traceId },
      { event_type: "review.prepared", trace_id: traceId },
    ]);
  });

  it("checkpoints transient failure before requesting a delayed retry", async () => {
    await seedImportReviewJob("scrape-retry", "scrape-retry-import", "scrape-retry-record");
    const message = queueMessage(pointer("scrape-retry"), 1);

    await processScrapeIngestionBatch(batch(message), { DB: env.DB }, {
      now: () => now,
      process: async () => {
        throw new RetryableScrapeIngestionError("temporary fixture failure");
      },
    });

    expect(message.disposition).toEqual([{ type: "retry", delaySeconds: 15 }]);
    expect(await env.DB.prepare(`
      SELECT status, last_error, backoff_until FROM collection_jobs WHERE id = 'scrape-retry'
    `).first()).toEqual({
      status: "failed",
      last_error: "temporary fixture failure",
      backoff_until: "2026-07-29T12:00:15.000Z",
    });
  });

  it("does not let a duplicate delivery steal or fail an active consumer lease", async () => {
    await seedImportReviewJob("scrape-concurrent", "scrape-concurrent-import", "scrape-concurrent-record");
    const first = queueMessage(pointer("scrape-concurrent"));
    const duplicate = queueMessage(pointer("scrape-concurrent"));
    let releaseFirst!: () => void;
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markClaimed!: () => void;
    const claimed = new Promise<void>((resolve) => {
      markClaimed = resolve;
    });

    const firstRun = processScrapeIngestionBatch(batch(first), { DB: env.DB }, {
      now: () => now,
      process: async () => {
        markClaimed();
        await holdFirst;
      },
    });
    await claimed;
    await processScrapeIngestionBatch(batch(duplicate), { DB: env.DB }, { now: () => now });
    releaseFirst();
    await firstRun;

    expect(first.disposition).toEqual([{ type: "ack" }]);
    expect(duplicate.disposition).toEqual([{ type: "retry", delaySeconds: 15 }]);
    expect(await env.DB.prepare(`
      SELECT status, last_error FROM collection_jobs WHERE id = 'scrape-concurrent'
    `).first()).toEqual({ status: "complete", last_error: null });
  });

  it("checkpoints permanent failure and leaves final delivery for the configured DLQ", async () => {
    await seedImportReviewJob("scrape-dlq", "scrape-dlq-import", "scrape-dlq-record");
    const message = queueMessage(pointer("scrape-dlq"), 3);

    await processScrapeIngestionBatch(batch(message), { DB: env.DB }, {
      now: () => now,
      process: async () => {
        throw new PermanentScrapeIngestionError("invalid normalized record");
      },
    });

    expect(message.disposition).toEqual([{ type: "retry", delaySeconds: undefined }]);
    expect(await env.DB.prepare(`
      SELECT status, last_error FROM collection_jobs WHERE id = 'scrape-dlq'
    `).first()).toEqual({
      status: "failed",
      last_error: "invalid normalized record",
    });
  });
});

describe("initial scrape-ingestion enqueue", () => {
  it("creates one durable submission job and enqueues its pointer", async () => {
    const importJobId = "scrape-schedule-import";
    await env.DB.prepare(`
      INSERT INTO import_jobs
        (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash, trace_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, '2.0', 'staged', ?, ?, ?, ?, ?)
    `).bind(importJobId, sourceId, `${importJobId}-batch`, `${importJobId}-idempotency`, now, payloadHash, traceId, now, now).run();
    const sent: unknown[] = [];
    const queue = {
      async send(value: unknown) {
        sent.push(value);
      },
    };

    const first = await queueImportForReview({ db: env.DB, queue, importJobId, now });
    const second = await queueImportForReview({ db: env.DB, queue, importJobId, now });

    expect(first).toMatchObject({ enqueued: true, generation: 1 });
    expect(second).toEqual({
      collectionJobId: first.collectionJobId,
      enqueued: false,
      generation: 1,
    });
    expect(sent).toEqual([pointer(first.collectionJobId, 1, false)]);
    expect(await env.DB.prepare(`
      SELECT job_type, status, import_job_id, payload_hash, trace_id
      FROM collection_jobs WHERE id = ?
    `).bind(first.collectionJobId).first()).toEqual({
      job_type: "submission",
      status: "submitting",
      import_job_id: importJobId,
      payload_hash: payloadHash,
      trace_id: traceId,
    });
  });

  it("atomically links and enqueues one pointer for a queued submission job", async () => {
    await seedQueuedSubmissionJob("scrape-enqueue", "scrape-enqueue-import");
    const sent: unknown[] = [];
    const queue = {
      async send(value: unknown) {
        sent.push(value);
      },
    };

    expect(await enqueueScrapeIngestionJob({
      db: env.DB,
      queue,
      jobId: "scrape-enqueue",
      importJobId: "scrape-enqueue-import",
      now,
      traceparent: `00-${traceId}-0123456789abcdef-01`,
    })).toEqual({ enqueued: true, generation: 1 });
    expect(await enqueueScrapeIngestionJob({
      db: env.DB,
      queue,
      jobId: "scrape-enqueue",
      importJobId: "scrape-enqueue-import",
      now,
    })).toEqual({ enqueued: false, generation: 1 });

    expect(sent).toEqual([pointer("scrape-enqueue")]);
    expect(await env.DB.prepare(`
      SELECT status, attempt_count, import_job_id, trace_id
      FROM collection_jobs WHERE id = 'scrape-enqueue'
    `).first()).toEqual({
      status: "submitting",
      attempt_count: 1,
      import_job_id: "scrape-enqueue-import",
      trace_id: traceId,
    });
    expect(await env.DB.prepare(`
      SELECT event_type, from_status, to_status
      FROM collection_lifecycle_events
      WHERE collection_job_id = 'scrape-enqueue'
    `).first()).toEqual({
      event_type: "queue.enqueued",
      from_status: "queued",
      to_status: "submitting",
    });
  });

  it("checkpoints a producer failure for explicit recovery", async () => {
    await seedQueuedSubmissionJob("scrape-enqueue-failure", "scrape-enqueue-failure-import");
    await expect(enqueueScrapeIngestionJob({
      db: env.DB,
      queue: {
        async send() {
          throw new Error("fixture queue unavailable");
        },
      },
      jobId: "scrape-enqueue-failure",
      importJobId: "scrape-enqueue-failure-import",
      now,
    })).rejects.toThrow("fixture queue unavailable");

    expect(await env.DB.prepare(`
      SELECT status, last_error, import_job_id
      FROM collection_jobs WHERE id = 'scrape-enqueue-failure'
    `).first()).toEqual({
      status: "failed",
      last_error: "fixture queue unavailable",
      import_job_id: "scrape-enqueue-failure-import",
    });
    const events = await env.DB.prepare(`
      SELECT event_type FROM collection_lifecycle_events
      WHERE collection_job_id = 'scrape-enqueue-failure' ORDER BY rowid
    `).all<{ event_type: string }>();
    expect(events.results.map((event) => event.event_type)).toEqual([
      "queue.enqueued",
      "queue.enqueue_failed",
    ]);
  });
});

describe("manual scrape-ingestion resume", () => {
  it("requires an administrator and enqueues a terminal job only once", async () => {
    await env.DB.prepare(`
      INSERT INTO collection_jobs
        (id, source_id, job_type, status, payload_hash, dedup_key, priority, scheduled_for,
         attempt_count, max_attempts, trace_id, created_at, updated_at)
      VALUES ('scrape-resume', ?, 'submission', 'failed', ?, 'scrape-resume-dedup', 10, ?, 1, 3, ?, ?, ?)
    `).bind(sourceId, payloadHash, now, traceId, now, now).run();
    const sent: unknown[] = [];
    const queue = {
      async send(value: unknown) {
        sent.push(value);
      },
    };

    await expect(resumeScrapeIngestionJob({
      db: env.DB,
      queue,
      jobId: "scrape-resume",
      actorUserId: "moderator-user",
      actorRole: "moderator",
      now,
    })).rejects.toThrow("administrator");

    expect(await resumeScrapeIngestionJob({
      db: env.DB,
      queue,
      jobId: "scrape-resume",
      actorUserId: "admin-user",
      actorRole: "administrator",
      now,
    })).toEqual({ enqueued: true, generation: 2 });
    expect(await resumeScrapeIngestionJob({
      db: env.DB,
      queue,
      jobId: "scrape-resume",
      actorUserId: "admin-user",
      actorRole: "administrator",
      now,
    })).toEqual({ enqueued: false, generation: 2 });

    expect(sent).toEqual([pointer("scrape-resume", 2, false)]);
    expect(await env.DB.prepare(`
      SELECT status, attempt_count, trace_id FROM collection_jobs WHERE id = 'scrape-resume'
    `).first()).toEqual({
      status: "submitting",
      attempt_count: 2,
      trace_id: traceId,
    });
  });
});
