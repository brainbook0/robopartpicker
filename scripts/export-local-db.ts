import { mkdirSync } from "node:fs";
import path from "node:path";
import { captureWranglerJson, runWrangler } from "./wrangler-cli";

type TableListResult = Array<{
  results: Array<{ schema: string; name: string; type: "table" | "view" | "shadow" | "virtual" }>;
  success: boolean;
}>;

const exportDirectory = path.resolve("exports");
mkdirSync(exportDirectory, { recursive: true });

const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputPath = path.join(exportDirectory, `robopartpicker-local-data-${timestamp}.sql`);

// Wrangler/Miniflare cannot export a local database wholesale when it contains
// FTS5 virtual tables. Export ordinary application-table data only; migrations
// remain the source of truth for schema, triggers, indexes, and the FTS index.
const tableList = captureWranglerJson<TableListResult>([
  "d1",
  "execute",
  "robopartpicker",
  "--local",
  "--command",
  "PRAGMA table_list",
]);
const tables = tableList
  .flatMap((entry) => entry.results)
  .filter((entry) => entry.schema === "main" && entry.type === "table")
  .map((entry) => entry.name)
  .filter((name) => !name.startsWith("sqlite_") && name !== "_cf_METADATA" && name !== "d1_migrations")
  .sort();

if (tables.length === 0) throw new Error("No local D1 application tables were found to export.");

runWrangler([
  "d1",
  "export",
  "robopartpicker",
  "--local",
  "--output",
  outputPath,
  "--skip-confirmation",
  "--no-schema",
  ...tables.flatMap((table) => ["--table", table]),
]);

console.log(`Local D1 data export written to ${outputPath} (${tables.length} tables). Apply migrations before importing this file; FTS is rebuilt by migration triggers.`);
