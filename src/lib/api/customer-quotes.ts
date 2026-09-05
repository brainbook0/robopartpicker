import { api } from "@/lib/api/client";

export type CustomerQuoteRequestInput = {
  projectId?: string;
  bomId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  deliveryNotes?: string;
  consent: true;
};

export type CustomerQuoteReceipt = {
  id: string;
  status: "submitted";
  currency: "USD";
  materialsEstimateMinor: number;
  shippingEstimateMinor: number;
  totalEstimateMinor: number;
  shippingConfidence: "high" | "medium" | "low";
  humanReviewRequired: true;
  createdAt: string;
  retentionExpiresAt: string;
};

export const customerQuotesApi = {
  create: async (input: CustomerQuoteRequestInput): Promise<CustomerQuoteReceipt> => (
    await api.post<{ item: CustomerQuoteReceipt }>("/api/v1/customer-quote-requests", input)
  ).item,
};
