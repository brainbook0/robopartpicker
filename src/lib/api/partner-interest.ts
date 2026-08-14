import { api } from "./client";

export type PartnerInterestKind = "advertiser" | "supplier" | "partner" | "project_owner" | "service_provider";

export type PartnerInterestInput = {
  inquiryType: PartnerInterestKind;
  organizationName: string;
  contactName: string;
  email: string;
  websiteUrl?: string;
  message: string;
  company?: string;
};

export type PartnerInterestResponse = {
  item: {
    id: string;
    inquiryType: PartnerInterestKind;
    organizationName: string;
    contactName: string;
    email: string;
    status: "received";
    createdAt: string;
  };
  message: string;
};

export const partnerInterestApi = {
  create: (input: PartnerInterestInput) => api.post<PartnerInterestResponse>("/api/v1/partner-interest", input),
};
