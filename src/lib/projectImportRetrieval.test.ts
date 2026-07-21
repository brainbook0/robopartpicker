import { describe, expect, it } from "vitest";
import { describeProjectImportRetrieval, formatImportBytes } from "./projectImportRetrieval";
import type { ProjectImportAnalysis } from "./projects";

const referenceRetrieval = {
  mode: "reference",
  provider: "github",
  requestCount: 7,
  attemptedFiles: 5,
  fetchedFiles: 5,
  failedFiles: 0,
  fetchedBytes: 9879,
  inventoryOnlyFiles: 9,
  mirroredFiles: 0,
  limits: { maxFetchedFiles: 24, maxFetchedBytes: 2_097_152, maxFileBytes: 262_144 },
} satisfies ProjectImportAnalysis["retrieval"];

describe("project import retrieval summaries", () => {
  it("explains reference-only GitHub imports without implying uploads", () => {
    const summary = describeProjectImportRetrieval(referenceRetrieval);

    expect(summary.modeLabel).toBe("Reference only");
    expect(summary.providerLabel).toBe("GitHub API");
    expect(summary.storageLabel).toBe("0 files mirrored");
    expect(summary.fileReadLabel).toBe("5/24 file reads");
    expect(summary.attemptedLabel).toBe("5 attempted");
    expect(summary.failureLabel).toBe("No fetch failures");
  });

  it("reports partial uploaded imports and mirrored files accurately", () => {
    const summary = describeProjectImportRetrieval({
      ...referenceRetrieval,
      mode: "uploaded",
      provider: "r2",
      requestCount: 2,
      attemptedFiles: 24,
      fetchedFiles: 22,
      failedFiles: 2,
      mirroredFiles: 3,
    });

    expect(summary.modeLabel).toBe("Uploaded files");
    expect(summary.providerLabel).toBe("Private R2 storage");
    expect(summary.storageLabel).toBe("3 mirrored files");
    expect(summary.failureLabel).toBe("2 failed fetches");
    expect(summary.requestLabel).toBe("2 provider requests");
  });

  it("formats byte counts for compact UI labels", () => {
    expect(formatImportBytes(0)).toBe("0 B");
    expect(formatImportBytes(987)).toBe("987 B");
    expect(formatImportBytes(9879)).toBe("9.6 KiB");
    expect(formatImportBytes(2_097_152)).toBe("2.0 MiB");
  });
});
