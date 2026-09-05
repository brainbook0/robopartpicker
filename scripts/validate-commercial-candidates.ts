#!/usr/bin/env tsx

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCommercialCandidateBatches,
  type CommercialCandidateBatchInput,
} from "../src/lib/commercial-candidate-registry";

export function validateCommercialCandidateDirectory(
  directoryPath: string,
  minimumCandidates = 400,
): ReturnType<typeof validateCommercialCandidateBatches> & { directory: string } {
  const directory = resolve(directoryPath);
  const batches: CommercialCandidateBatchInput[] = [];
  let files: string[] = [];

  try {
    files = readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const result = validateCommercialCandidateBatches([], minimumCandidates);
    return {
      directory,
      ...result,
      errors: [`candidate directory cannot be read: ${detail}`, ...result.errors],
    };
  }

  for (const file of files) {
    try {
      batches.push({
        name: file,
        value: JSON.parse(readFileSync(resolve(directory, file), "utf8")) as unknown,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      batches.push({ name: file, error: detail });
    }
  }

  const result = validateCommercialCandidateBatches(batches, minimumCandidates);
  return {
    directory,
    ...result,
  };
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const directory = argument("--dir") ?? "data/commercial-catalog/candidates";
  const minimumText = argument("--min") ?? "400";
  const minimum = Number(minimumText);
  const result = validateCommercialCandidateDirectory(directory, minimum);
  const report = {
    directory: result.directory,
    files: result.files,
    candidateCount: result.candidateCount,
    manufacturerCount: result.manufacturerCount,
    categoryCounts: result.categoryCounts,
    errors: result.errors,
  };
  const serialized = JSON.stringify(report, null, 2);
  if (result.errors.length > 0) {
    console.error(serialized);
    process.exitCode = 1;
    return;
  }
  console.log(serialized);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) main();
