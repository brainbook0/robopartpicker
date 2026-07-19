import { captureWranglerJson } from "./wrangler-cli";

type D1Result<Row> = Array<{
  results: Row[];
  success: boolean;
  error?: string;
}>;

const cliArguments = process.argv.slice(2);
const remote = cliArguments.includes("--remote");
const environmentIndex = cliArguments.indexOf("--env");
const environment = environmentIndex >= 0 ? cliArguments[environmentIndex + 1] : undefined;
if (remote && !environment) throw new Error("Remote schema validation requires an explicit --env value.");

const requiredTables = [
  "account",
  "ai_conversations",
  "audit_events",
  "boms",
  "builds",
  "components",
  "evidence",
  "files",
  "forum_threads",
  "import_jobs",
  "import_records",
  "manufacturers",
  "marketplace_listings",
  "notifications",
  "organization_members",
  "organizations",
  "profiles",
  "projects",
  "session",
  "supplier_offers",
  "suppliers",
  "user",
  "verification",
];

function query<Row>(sql: string): Row[] {
  const response = captureWranglerJson<D1Result<Row>>([
    "d1",
    "execute",
    remote ? "DB" : "robopartpicker",
    remote ? "--remote" : "--local",
    ...(environment ? ["--env", environment] : []),
    "--command",
    sql,
  ]);
  const failed = response.find((entry) => !entry.success);
  if (failed) throw new Error(failed.error ?? "D1 validation query failed");
  return response.flatMap((entry) => entry.results);
}

const tables = query<{ name: string }>(
  "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).map((row) => row.name);

const missing = requiredTables.filter((table) => !tables.includes(table));
if (missing.length > 0) {
  throw new Error(`Missing required D1 tables: ${missing.join(", ")}`);
}

const foreignKeyFailures = query<Record<string, unknown>>("PRAGMA foreign_key_check");
if (foreignKeyFailures.length > 0) {
  throw new Error(`Foreign-key validation failed: ${JSON.stringify(foreignKeyFailures, null, 2)}`);
}

const migrationRows = query<{ count: number }>(
  "SELECT COUNT(*) AS count FROM d1_migrations",
);
const fixtureCounts = query<{ components: number; suppliers: number; boms: number }>(
  "SELECT (SELECT COUNT(*) FROM components WHERE is_demo = 1) AS components, (SELECT COUNT(*) FROM suppliers WHERE is_demo = 1) AS suppliers, (SELECT COUNT(*) FROM boms WHERE is_demo = 1) AS boms",
);

const migrationCount = Number(migrationRows[0]?.count ?? 0);
if (migrationCount !== 9) {
  throw new Error(`Expected exactly nine applied migrations; found ${migrationCount}`);
}

const counts = fixtureCounts[0];
if (!counts || Number(counts.components) === 0 || Number(counts.suppliers) === 0 || Number(counts.boms) === 0) {
  throw new Error(`Development fixture seed is incomplete: ${JSON.stringify(counts)}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      environment: remote ? environment : "local",
      tables: tables.length,
      migrations: migrationCount,
      demoRecords: {
        components: Number(counts.components),
        suppliers: Number(counts.suppliers),
        boms: Number(counts.boms),
      },
      foreignKeyFailures: 0,
    },
    null,
    2,
  ),
);
