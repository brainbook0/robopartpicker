import { app } from "./router";
import type { Env, ImportQueueMessage, ScrapeIngestionQueueMessage, WorkerQueueMessage } from "./env";
import { processQueueBatch } from "./services/import-jobs";
import { processScrapeIngestionBatch } from "./services/scrape-ingestion-jobs";

export { Sandbox } from "@cloudflare/sandbox";

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<WorkerQueueMessage>, env: Env) => {
    if (batch.queue.includes("scrape-ingestion")) {
      return processScrapeIngestionBatch(
        batch as MessageBatch<ScrapeIngestionQueueMessage>,
        env,
      );
    }
    return processQueueBatch(batch as MessageBatch<ImportQueueMessage>, env);
  },
} satisfies ExportedHandler<Env, WorkerQueueMessage>;
