export type SupplierRelationshipLead = {
  id: string;
  organization_name: string;
  relationship_type: "manufacturer" | "authorized-distributor" | "project-vendor" | "kit-vendor";
  priority: "high" | "medium" | "low";
  regions: string[];
  products: string[];
  project_slugs: string[];
  status: "research_ready";
  approval_state: "not_requested";
  do_not_send: true;
  contact_channel: {
    type: "business-email" | "website" | "product-page" | "booking-page";
    value: string;
    public_source_url: string;
  };
  evidence: Array<{
    claim: string;
    source_url: string;
    source_revision?: string;
  }>;
  proposed_value_exchange: string;
  first_contact_goal: string;
  notes?: string;
};

export type SupplierRelationshipPipeline = {
  schema_version: 1;
  wave: string;
  generated_at: string;
  policy: {
    outbound_messages_sent: false;
    explicit_approval_required: true;
    reversible_research_only: true;
  };
  leads: SupplierRelationshipLead[];
};

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateSupplierRelationshipPipeline(pipeline: SupplierRelationshipPipeline): string[] {
  const errors: string[] = [];
  if (pipeline.schema_version !== 1) errors.push("schema_version must be 1");
  if (!pipeline.wave?.trim()) errors.push("wave is required");
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(pipeline.generated_at) || Number.isNaN(Date.parse(pipeline.generated_at))) errors.push("generated_at must be an ISO timestamp");
  if (pipeline.policy?.outbound_messages_sent !== false) errors.push("policy.outbound_messages_sent must be false");
  if (pipeline.policy?.explicit_approval_required !== true) errors.push("policy.explicit_approval_required must be true");
  if (pipeline.policy?.reversible_research_only !== true) errors.push("policy.reversible_research_only must be true");
  if (!Array.isArray(pipeline.leads) || pipeline.leads.length === 0) errors.push("leads must not be empty");

  const ids = new Set<string>();
  for (const lead of pipeline.leads ?? []) {
    const prefix = lead.id || "(missing-id)";
    if (!ID_RE.test(lead.id)) errors.push(`${prefix}: id must use lowercase kebab-case`);
    if (ids.has(lead.id)) errors.push(`${prefix}: duplicate id`);
    ids.add(lead.id);
    if (!lead.organization_name?.trim()) errors.push(`${prefix}: organization_name is required`);
    if (lead.status !== "research_ready") errors.push(`${prefix}: status must remain research_ready`);
    if (lead.approval_state !== "not_requested") errors.push(`${prefix}: approval_state must remain not_requested`);
    if (lead.do_not_send !== true) errors.push(`${prefix}: do_not_send must be true`);
    if (!lead.project_slugs?.length) errors.push(`${prefix}: project_slugs must not be empty`);
    if (!lead.products?.length) errors.push(`${prefix}: products must not be empty`);
    if (!lead.regions?.length) errors.push(`${prefix}: regions must not be empty`);
    if (!lead.evidence?.length) errors.push(`${prefix}: evidence must not be empty`);
    for (const evidence of lead.evidence ?? []) {
      if (!evidence.claim?.trim()) errors.push(`${prefix}: evidence claim is required`);
      if (!isHttpUrl(evidence.source_url)) errors.push(`${prefix}: evidence source_url must be HTTP(S)`);
      if (evidence.source_revision && !/^[a-f0-9]{40}$/u.test(evidence.source_revision)) errors.push(`${prefix}: evidence source_revision must be a lowercase git hash`);
    }
    const channel = lead.contact_channel;
    if (!channel?.type) errors.push(`${prefix}: contact_channel is required`);
    else if (channel.type === "business-email") {
      if (!EMAIL_RE.test(channel.value)) errors.push(`${prefix}: business email is invalid`);
    } else if (!isHttpUrl(channel.value)) {
      errors.push(`${prefix}: contact channel must be HTTP(S)`);
    }
    if (!isHttpUrl(channel?.public_source_url ?? "")) errors.push(`${prefix}: contact public_source_url must be HTTP(S)`);
    if (!lead.proposed_value_exchange?.trim()) errors.push(`${prefix}: proposed_value_exchange is required`);
    if (!lead.first_contact_goal?.trim()) errors.push(`${prefix}: first_contact_goal is required`);
  }
  return errors;
}
