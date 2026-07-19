import { api } from "./client";

export type NotificationItem = {
  id: string;
  notificationType: string;
  title: string;
  body: string | null;
  internalPath: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreference = {
  notificationType: string;
  inAppEnabled: number;
  emailEnabled: number;
  updatedAt: string;
};

export const notificationsApi = {
  list: (unreadOnly = false, signal?: AbortSignal) => api.get<{ items: NotificationItem[]; unreadCount: number }>(`/api/v1/notifications?unread=${unreadOnly}`, { signal }),
  markRead: (id: string) => api.patch<{ updated: boolean }>(`/api/v1/notifications/${encodeURIComponent(id)}/read`),
  markAllRead: () => api.post<{ updated: number }>("/api/v1/notifications/read-all"),
  preferences: (signal?: AbortSignal) => api.get<{ items: NotificationPreference[] }>("/api/v1/notifications/preferences", { signal }),
  updatePreference: (input: { notificationType: string; inAppEnabled: boolean; emailEnabled: boolean }) =>
    api.put<{ updated: boolean }>("/api/v1/notifications/preferences", input),
};
