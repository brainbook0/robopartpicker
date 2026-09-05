import { api } from "./client";
import type { CompletedQuoteSnapshot, QuoteEligibility } from "@/shared/completed-quote";

export type CompletedQuoteDraft = {
  id: string;
  bomId: string;
  bomVersionId: string;
  createdByUserId: string;
  draftVersion: number;
  currency: string;
  subtotalMinor: number;
  recipients: string[];
  introduction: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  pricingSnapshot: CompletedQuoteSnapshot;
  status: "draft" | "sending" | "sent" | "partial_failed" | "failed" | "invalidated";
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deliveries: Array<{
    id: string;
    recipient: string;
    status: "pending" | "sending" | "sent" | "failed";
    providerMessageId: string | null;
    attemptCount: number;
    lastError: string | null;
    sentAt: string | null;
  }>;
  emailDeliveryConfigured: boolean;
};

export const completedQuotesApi = {
  eligibility: (bomId: string, signal?: AbortSignal) => api.get<{ item: QuoteEligibility }>(`/api/v1/boms/${encodeURIComponent(bomId)}/quote-eligibility`, { signal }),
  create: (input: { bomId: string; recipients: string[]; introduction: string }) => api.post<{ item: CompletedQuoteDraft }>("/api/v1/completed-quotes", input),
  get: (id: string, signal?: AbortSignal) => api.get<{ item: CompletedQuoteDraft }>(`/api/v1/completed-quotes/${encodeURIComponent(id)}`, { signal }),
  send: (id: string, expectedDraftVersion: number) => api.post<{ item: CompletedQuoteDraft }>(`/api/v1/completed-quotes/${encodeURIComponent(id)}/send`, { expectedDraftVersion, confirm: true }),
};
