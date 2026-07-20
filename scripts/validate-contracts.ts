import { readFileSync } from "node:fs";
import path from "node:path";
import { batchSchema } from "../worker/routes/imports";
import { emptyRpps, RppsPackage, RPPS_VERSION } from "../src/lib/rpps/schema";
import { parsePortableRpps, parsePortableRppsLock, validatePortableRpps } from "../src/lib/rpps/portable";

const root = process.cwd();
function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

const ingestionSchema = readJson("contracts/import-batch.v1.schema.json") as Record<string, unknown>;
const ingestionExample = readJson("contracts/examples/import-batch.v1.json");
const rppsSchema = readJson("contracts/rpps-1.0.0.schema.json") as Record<string, unknown>;
const portableSchema = readJson("contracts/rpps-0.1.schema.json") as Record<string, unknown>;
const lockSchema = readJson("contracts/rpps-lock-0.1.schema.json") as Record<string, unknown>;

const parsedBatch = batchSchema.safeParse(ingestionExample);
if (!parsedBatch.success) {
  throw new Error(`The checked-in ingestion example is rejected by the Worker: ${parsedBatch.error.message}`);
}

const parsedRpps = RppsPackage.safeParse(emptyRpps());
if (!parsedRpps.success) {
  throw new Error(`The RPPS default is rejected by the runtime schema: ${parsedRpps.error.message}`);
}

if (ingestionSchema.$id !== "https://robopartpicker.com/contracts/import-batch.v1.schema.json") {
  throw new Error("Unexpected ingestion schema identifier.");
}
if (rppsSchema.$id !== `https://robopartpicker.com/contracts/rpps-${RPPS_VERSION}.schema.json`) {
  throw new Error("The RPPS JSON Schema identifier does not match the runtime RPPS version.");
}

const portable = parsePortableRpps(readFileSync(path.join(root, "standards/rpps/examples/minimal/rpps.yaml"), "utf8"));
if (portable.ok === false) throw new Error(`Portable RPPS example is invalid: ${portable.errors.join("; ")}`);
const lock = parsePortableRppsLock(readFileSync(path.join(root, "standards/rpps/examples/minimal/rpps.lock.yaml"), "utf8"));
if (lock.ok === false) throw new Error(`Portable RPPS lockfile example is invalid: ${lock.errors.join("; ")}`);
if (!validatePortableRpps(portable.data, lock.data).profiles.core.conformant) throw new Error("Portable RPPS example must satisfy Core.");
if (portableSchema.$id !== "urn:rpps:schema:manifest:0.1" || lockSchema.$id !== "urn:rpps:schema:lock:0.1") {
  throw new Error("Unexpected portable RPPS schema identifier.");
}

console.log(JSON.stringify({ ok: true, ingestionVersion: parsedBatch.data.schemaVersion, ingestionRecords: parsedBatch.data.records.length, legacyRppsVersion: parsedRpps.data.rpps_version, portableRppsVersion: portable.data.rpps }, null, 2));
