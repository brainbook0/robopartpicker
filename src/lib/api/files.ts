import { ApiError, api, type ApiErrorBody } from "./client";

export type FileKind = "image" | "cad" | "urdf" | "mjcf" | "bom" | "document" | "firmware" | "configuration" | "test_evidence" | "attachment" | "other";

export type ProjectFile = {
  id: string;
  projectVersionId: string | null;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  visibility: "private" | "organization" | "public";
  status: "pending" | "quarantined" | "ready" | "rejected";
  kind: FileKind;
  purpose: string;
  relativePath: string | null;
  caption: string | null;
  altText: string | null;
  createdAt: string;
  updatedAt: string;
  contentUrl: string;
};

export async function uploadFile(
  file: File,
  kind: FileKind,
  visibility: "private" | "organization" | "public" = "private",
  organizationId?: string | null,
) {
  const mediaType = file.type || inferredMediaType(file.name);
  const initialized = await api.post<{ file: { id: string }; upload: { url: string; token: string } }>("/api/v1/files/uploads", { originalName: file.name, mediaType, sizeBytes: file.size, kind, visibility, organizationId: organizationId ?? null });
  const response = await fetch(initialized.upload.url, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": mediaType, "X-Upload-Token": initialized.upload.token }, body: file });
  if (!response.ok) { let body: ApiErrorBody = {}; try { body = await response.json() as ApiErrorBody; } catch { body = {}; } throw new ApiError(response.status, body); }
  return response.json() as Promise<{ fileId: string; status: string; scanStatus: string; accessUrl: string }>;
}

function inferredMediaType(name: string): string {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return ({ step: "model/step", stp: "model/step", iges: "model/iges", igs: "model/iges", stl: "model/stl", urdf: "application/xml", mjcf: "application/xml", yaml: "text/yaml", yml: "text/yaml", toml: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", xml: "application/xml", txt: "text/plain", pdf: "application/pdf", zip: "application/zip" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

export async function attachFile(fileId: string, input: { entityType: "build" | "project" | "marketplace_listing"; entityId: string; purpose: string; buildStepId?: string | null; relativePath?: string | null; altText?: string | null }) {
  return api.post<{ attached: true }>(`/api/v1/files/${encodeURIComponent(fileId)}/attachments`, input);
}

export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
  return (await api.get<{ items: ProjectFile[] }>(`/api/v1/projects/${encodeURIComponent(projectId)}/files`)).items;
}

export async function detachProjectFile(projectId: string, fileId: string): Promise<void> {
  await api.delete(`/api/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`);
}
