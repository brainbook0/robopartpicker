import type { ProjectImportAnalysis } from "./projects";

type Retrieval = ProjectImportAnalysis["retrieval"];

const MODE_LABELS: Record<Retrieval["mode"], string> = {
  reference: "Reference only",
  uploaded: "Uploaded files",
  inline: "Inline request",
};

const PROVIDER_LABELS: Record<Retrieval["provider"], string> = {
  github: "GitHub API",
  r2: "Private R2 storage",
  request: "Request body",
};

export function formatImportBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function describeProjectImportRetrieval(retrieval: Retrieval) {
  const fileBudget = retrieval.limits.maxFetchedFiles;
  const storageLabel = retrieval.mirroredFiles === 0
    ? retrieval.mode === "reference" ? "0 files mirrored" : "No extra mirrors"
    : `${retrieval.mirroredFiles} mirrored file${retrieval.mirroredFiles === 1 ? "" : "s"}`;
  const failureLabel = retrieval.failedFiles === 0
    ? "No fetch failures"
    : `${retrieval.failedFiles} failed fetch${retrieval.failedFiles === 1 ? "" : "es"}`;
  return {
    modeLabel: MODE_LABELS[retrieval.mode],
    providerLabel: PROVIDER_LABELS[retrieval.provider],
    storageLabel,
    failureLabel,
    fileReadLabel: `${retrieval.fetchedFiles}/${fileBudget} file reads`,
    attemptedLabel: `${retrieval.attemptedFiles} attempted`,
    byteLabel: `${formatImportBytes(retrieval.fetchedBytes)} fetched`,
    inventoryLabel: `${retrieval.inventoryOnlyFiles} inventory-only file${retrieval.inventoryOnlyFiles === 1 ? "" : "s"}`,
    requestLabel: `${retrieval.requestCount} provider request${retrieval.requestCount === 1 ? "" : "s"}`,
  };
}
