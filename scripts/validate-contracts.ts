import { readFileSync } from "node:fs";
import path from "node:path";
import { batchSchema, batchV2Schema } from "../worker/routes/imports";
import { EVIDENCE_MIME_BY_CLASS, evidenceRegistrationSchema } from "../worker/services/source-evidence";
import { emptyRpps, RppsPackage, RPPS_VERSION } from "../src/lib/rpps/schema";
import { parsePortableRpps, parsePortableRppsLock, validatePortableRpps } from "../src/lib/rpps/portable";

const root = process.cwd();
function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

const ingestionSchema = readJson("contracts/import-batch.v1.schema.json") as Record<string, unknown>;
const ingestionExample = readJson("contracts/examples/import-batch.v1.json");
const ingestionV2Schema = readJson("contracts/import-batch.v2.schema.json") as Record<string, unknown>;
const ingestionV2Example = readJson("contracts/examples/import-batch.v2.json");
const evidenceRegistrationJsonSchema = readJson("contracts/evidence-registration.v1.schema.json") as Record<string, unknown>;
const evidenceRegistrationExample = readJson("contracts/examples/evidence-registration.v1.json");
const rppsSchema = readJson("contracts/rpps-1.0.0.schema.json") as Record<string, unknown>;
const portableSchema = readJson("contracts/rpps-0.1.schema.json") as Record<string, unknown>;
const lockSchema = readJson("contracts/rpps-lock-0.1.schema.json") as Record<string, unknown>;

const parsedBatch = batchSchema.safeParse(ingestionExample);
if (!parsedBatch.success) {
  throw new Error(`The checked-in ingestion example is rejected by the Worker: ${parsedBatch.error.message}`);
}
const parsedV2Batch = batchV2Schema.safeParse(ingestionV2Example);
if (!parsedV2Batch.success) {
  throw new Error(`The checked-in v2 ingestion example is rejected by the Worker: ${parsedV2Batch.error.message}`);
}
const parsedEvidenceRegistration = evidenceRegistrationSchema.safeParse(evidenceRegistrationExample);
if (!parsedEvidenceRegistration.success) {
  throw new Error(`The checked-in evidence registration example is rejected by the Worker: ${parsedEvidenceRegistration.error.message}`);
}

const parsedRpps = RppsPackage.safeParse(emptyRpps());
if (!parsedRpps.success) {
  throw new Error(`The RPPS default is rejected by the runtime schema: ${parsedRpps.error.message}`);
}

if (ingestionSchema.$id !== "https://robopartpicker.com/contracts/import-batch.v1.schema.json") {
  throw new Error("Unexpected ingestion schema identifier.");
}
if (ingestionV2Schema.$id !== "https://robopartpicker.com/contracts/import-batch.v2.schema.json") {
  throw new Error("Unexpected v2 ingestion schema identifier.");
}
if (evidenceRegistrationJsonSchema.$id !== "https://robopartpicker.com/contracts/evidence-registration.v1.schema.json") {
  throw new Error("Unexpected evidence registration schema identifier.");
}
const evidenceDefinitions = evidenceRegistrationJsonSchema.$defs as Record<string, Record<string, unknown>>;
const expectedEvidenceMimes = Object.values(EVIDENCE_MIME_BY_CLASS).flatMap((values) => [...values]).sort();
const schemaEvidenceMimes = Object.entries(evidenceDefinitions)
  .filter(([key]) => key.startsWith("pair-"))
  .map(([key, value]) => {
    const mediaType = key.slice("pair-".length);
    const properties = value.properties as Record<string, { const?: unknown }>;
    if (properties.declaredMediaType?.const !== mediaType || properties.detectedMediaType?.const !== mediaType) {
      throw new Error(`Evidence MIME pair ${key} does not enforce an exact declared/detected match.`);
    }
    return mediaType;
  })
  .sort();
if (JSON.stringify(schemaEvidenceMimes) !== JSON.stringify(expectedEvidenceMimes)) {
  throw new Error("Evidence MIME allowlists drifted between JSON Schema and Worker runtime.");
}
const evidenceUrlPattern = String(evidenceDefinitions.httpsUrl?.pattern ?? "");
if (!evidenceUrlPattern || new RegExp(evidenceUrlPattern).test("https://user:password@example.com/document.pdf")) {
  throw new Error("Evidence JSON Schema permits embedded URL credentials.");
}
if (batchV2Schema.safeParse({ ...(ingestionV2Example as object), traceId: "invalid" }).success) {
  throw new Error("The v2 runtime contract accepted an invalid trace ID.");
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

console.log(JSON.stringify({
  ok: true,
  ingestionVersions: [parsedBatch.data.schemaVersion, parsedV2Batch.data.schemaVersion],
  ingestionRecords: {
    v1: parsedBatch.data.records.length,
    v2: parsedV2Batch.data.records.length,
  },
  evidenceRegistrationVersion: parsedEvidenceRegistration.data.schemaVersion,
  legacyRppsVersion: parsedRpps.data.rpps_version,
  portableRppsVersion: portable.data.rpps,
}, null, 2));
