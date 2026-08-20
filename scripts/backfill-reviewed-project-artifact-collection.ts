import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expandReviewedProjectArtifactCollection } from "../src/lib/reviewed-project-artifact-collection";
import type { ReviewedProjectArtifactWave } from "../src/lib/reviewed-project-artifacts";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] : undefined;
const collectionIndex = args.indexOf("--collection");
const collectionPath = collectionIndex >= 0 ? args[collectionIndex + 1] : undefined;
const apply = args.includes("--apply");
const scratch = process.env.JCODE_SCRATCH_DIR;

if ((env !== "production" && env !== "preview") || !collectionPath || !scratch) {
  console.error("Usage: tsx scripts/backfill-reviewed-project-artifact-collection.ts --env production|preview --collection <path> [--apply]. JCODE_SCRATCH_DIR is required.");
  process.exit(2);
}

const collection = JSON.parse(readFileSync(resolve(collectionPath), "utf8")) as ReviewedProjectArtifactWave;
const expanded = expandReviewedProjectArtifactCollection(collection);
if (expanded.errors.length) throw new Error(`Invalid reviewed project artifact collection:\n${expanded.errors.join("\n")}`);

const collectionRoot = join(scratch, `artifact-collection-${collection.wave}`);
mkdirSync(collectionRoot, { recursive: true });
const reports: Array<{ wave: string; status: "completed" }> = [];

try {
  for (const [index, wave] of expanded.waves.entries()) {
    const wavePath = join(collectionRoot, `${wave.wave}.json`);
    writeFileSync(wavePath, `${JSON.stringify(wave, null, 2)}\n`);
    console.log(`JCODE_PROGRESS ${JSON.stringify({ current: index + 1, total: expanded.waves.length, unit: "artifact waves", message: `${wave.artifacts[0].slug}/${wave.artifacts[0].path}` })}`);
    execFileSync("node_modules/.bin/tsx", [
      "scripts/backfill-reviewed-project-artifacts.ts",
      "--env", env,
      "--wave", wavePath,
      ...(apply ? ["--apply"] : []),
    ], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      maxBuffer: 64 * 1024 * 1024,
    });
    reports.push({ wave: wave.wave, status: "completed" });
  }
} finally {
  rmSync(collectionRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  env,
  collection: collection.wave,
  artifacts: expanded.waves.length,
  completed: reports.length,
}, null, 2));
