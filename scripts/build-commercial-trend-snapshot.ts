#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCommercialTrendSnapshot,
  type CommercialTrendCandidate,
  type CommercialTrendSnapshotOptions,
  type CommercialTrendSourceRecord,
} from "../src/lib/commercial-trend-score";

type CandidateEnvelope = CommercialTrendCandidate[] | { candidates: CommercialTrendCandidate[] };
type SignalEnvelope = {
  options: CommercialTrendSnapshotOptions;
  records: CommercialTrendSourceRecord[];
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`Missing required ${name} argument.`);
  return resolve(value);
}

function parseJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot parse ${path}: ${detail}`);
  }
}

const candidatePath = requiredArgument("--candidates");
const signalPath = requiredArgument("--signals");
const outputPath = argument("--output");
const candidatePayload = parseJson<CandidateEnvelope>(candidatePath);
const candidates = Array.isArray(candidatePayload) ? candidatePayload : candidatePayload.candidates;
const signalPayload = parseJson<SignalEnvelope>(signalPath);

if (!Array.isArray(candidates)) throw new Error("Candidate JSON must be an array or an object with a candidates array.");
if (!signalPayload || !Array.isArray(signalPayload.records) || !signalPayload.options) {
  throw new Error("Signal JSON must contain options and a records array.");
}

const snapshot = buildCommercialTrendSnapshot(candidates, signalPayload.records, signalPayload.options);
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
if (outputPath) {
  writeFileSync(resolve(outputPath), serialized);
  console.log(JSON.stringify({
    output: resolve(outputPath),
    methodologyVersion: snapshot.methodologyVersion,
    ranked: snapshot.records.length,
    excluded: snapshot.excluded.length,
  }));
} else {
  process.stdout.write(serialized);
}
