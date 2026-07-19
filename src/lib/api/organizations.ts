import { api } from "@/lib/api/client";

export type OrganizationRole = "owner" | "admin" | "engineer" | "builder" | "procurement" | "viewer";

export type Organization = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by_user_id: string | null;
  version: number;
  member_role: OrganizationRole;
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: "active" | "suspended";
  joined_at: string;
  updated_at: string;
  display_name: string | null;
  username: string | null;
  email: string;
};

export const organizationsApi = {
  list: (signal?: AbortSignal) => api.get<{ items: Organization[] }>("/api/v1/organizations", { signal, retry: false }),
  get: (id: string, signal?: AbortSignal) => api.get<{ item: Organization }>(`/api/v1/organizations/${encodeURIComponent(id)}`, { signal, retry: false }),
  create: (input: { name: string; slug: string; description?: string | null }) =>
    api.post<{ item: Omit<Organization, "member_role"> }>("/api/v1/organizations", input),
  update: (id: string, input: { name: string; slug: string; description: string | null; version: number }) =>
    api.patch<{ item: Omit<Organization, "member_role"> }>(`/api/v1/organizations/${encodeURIComponent(id)}`, input),
  members: (id: string, signal?: AbortSignal) =>
    api.get<{ items: OrganizationMember[] }>(`/api/v1/organizations/${encodeURIComponent(id)}/members`, { signal, retry: false }),
  addMember: (id: string, input: { email: string; role: Exclude<OrganizationRole, "owner"> }) =>
    api.post<{ item: OrganizationMember }>(`/api/v1/organizations/${encodeURIComponent(id)}/members`, input),
  updateMember: (id: string, userId: string, input: { role: OrganizationRole; status: "active" | "suspended" }) =>
    api.patch<{ item: OrganizationMember }>(`/api/v1/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, input),
  removeMember: (id: string, userId: string) =>
    api.delete<void>(`/api/v1/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`),
};
