import { api } from "./client";

export type HealthCapabilities = {
  emailDelivery: boolean;
  ai: boolean;
  googleAuthentication: boolean;
  mcp: { publicReadOnly: boolean; privateOAuth: boolean };
  repositoryImport: { publicGitHub: boolean; authenticatedGitHub: boolean; directFiles: boolean; storedFileSets: boolean; privateArchives: boolean };
};

export type HealthResponse = {
  status: "ok" | "degraded";
  service: string;
  version: string;
  environment: string;
  database: string;
  files: string;
  capabilities: HealthCapabilities;
};

export const healthApi = {
  get: (signal?: AbortSignal) => api.get<HealthResponse>("/api/health", { signal }),
};
