import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { captureWranglerJson, runWrangler } from "./wrangler-cli";

type D1Result<Row> = Array<{ results: Row[]; success: boolean; error?: string }>;

const argumentsList = process.argv.slice(2);
const environmentIndex = argumentsList.indexOf("--env");
const environment = environmentIndex >= 0 ? argumentsList[environmentIndex + 1] : undefined;
if (environment !== "preview" && environment !== "production") {
  throw new Error("Remote migration compatibility requires --env preview or --env production.");
}

function query<Row>(sql: string): Row[] {
  const response = captureWranglerJson<D1Result<Row>>([
    "d1", "execute", "DB", "--env", environment, "--remote", "--command", sql,
  ]);
  const failure = response.find((entry) => !entry.success);
  if (failure) throw new Error(failure.error ?? "Remote D1 compatibility query failed.");
  return response.flatMap((entry) => entry.results);
}

const migrationName = "0003_builds_community_and_marketplace.sql";
const applied = query<{ name: string }>("SELECT name FROM d1_migrations ORDER BY id").map((row) => row.name);
if (applied.includes(migrationName)) {
  console.log(`${migrationName} is already applied; no compatibility bootstrap is needed.`);
  process.exit(0);
}

const expectedPredecessors = ["0001_auth_identity_and_files.sql", "0002_catalog_projects_and_boms.sql"];
if (JSON.stringify(applied) !== JSON.stringify(expectedPredecessors)) {
  throw new Error(`Refusing compatibility bootstrap from unexpected migration state: ${JSON.stringify(applied)}`);
}
const buildTableCount = Number(query<{ count: number }>("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'builds'")[0]?.count ?? 0);
if (buildTableCount !== 0) throw new Error("Refusing compatibility bootstrap because the builds table already exists.");

const sourcePath = path.resolve("migrations", migrationName);
const original = (await readFile(sourcePath, "utf8")).replaceAll("\r\n", "\n");
const incompatibleTriggerBody = `  SELECT CASE WHEN NEW.thread_type <> 'question'
    THEN RAISE(ABORT, 'accepted answers are only valid for question threads') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM forum_posts p WHERE p.id = NEW.accepted_post_id AND p.thread_id = NEW.id AND p.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'accepted post must belong to the thread') END;`;
const compatibleTriggerBody = `  SELECT RAISE(ABORT, 'accepted answers are only valid for question threads')
  WHERE NEW.thread_type <> 'question';
  SELECT RAISE(ABORT, 'accepted post must belong to the thread')
  WHERE NOT EXISTS (
    SELECT 1 FROM forum_posts p WHERE p.id = NEW.accepted_post_id AND p.thread_id = NEW.id AND p.deleted_at IS NULL
  );`;
if (!original.includes(incompatibleTriggerBody)) {
  throw new Error(`The guarded compatibility block was not found in ${sourcePath}; refusing an unreviewed rewrite.`);
}
const compatibleSql = `${original.replace(incompatibleTriggerBody, compatibleTriggerBody).trim()}\n\nINSERT INTO "d1_migrations" (name) VALUES ('${migrationName}');\n`;
const outputDirectory = path.resolve(".wrangler", "remote-migrations");
const outputPath = path.join(outputDirectory, migrationName);
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, compatibleSql, "utf8");
runWrangler(["d1", "execute", "DB", "--env", environment, "--remote", "--file", outputPath]);

const confirmed = query<{ count: number }>(`SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '${migrationName}'`);
if (Number(confirmed[0]?.count ?? 0) !== 1) throw new Error(`${migrationName} was not recorded after execution.`);
console.log(`Applied the D1-compatible equivalent of ${migrationName} without modifying the immutable migration.`);
