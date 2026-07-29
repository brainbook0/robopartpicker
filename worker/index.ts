import { app } from "./router";
import type { Env, ImportQueueMessage } from "./env";
import { processQueueBatch } from "./services/import-jobs";

export { Sandbox } from "@cloudflare/sandbox";

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<ImportQueueMessage>, env: Env) => processQueueBatch(batch, env),
} satisfies ExportedHandler<Env, ImportQueueMessage>;
