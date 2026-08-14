import { describe, expect, it } from "vitest";
import pipelineJson from "../../data/supplier-relationships/2026-08-14-wave1.json";
import {
  validateSupplierRelationshipPipeline,
  type SupplierRelationshipPipeline,
} from "./supplier-relationship-pipeline";

const pipeline = pipelineJson as unknown as SupplierRelationshipPipeline;

describe("supplier relationship research pipeline", () => {
  it("validates the source-backed no-send queue", () => {
    expect(validateSupplierRelationshipPipeline(pipeline)).toEqual([]);
    expect(pipeline.leads).toHaveLength(7);
    expect(pipeline.policy).toEqual({
      outbound_messages_sent: false,
      explicit_approval_required: true,
      reversible_research_only: true,
    });
    expect(pipeline.leads.every((lead) => lead.do_not_send && lead.status === "research_ready" && lead.approval_state === "not_requested")).toBe(true);
    expect(pipeline.leads.filter((lead) => lead.priority === "high")).toHaveLength(5);
  });

  it("rejects a queue that implies outreach or lacks public evidence", () => {
    const unsafe = structuredClone(pipeline) as unknown as Record<string, unknown>;
    (unsafe.policy as Record<string, unknown>).outbound_messages_sent = true;
    const leads = unsafe.leads as Array<Record<string, unknown>>;
    leads[0].do_not_send = false;
    leads[0].approval_state = "approved";
    (leads[0].contact_channel as Record<string, unknown>).public_source_url = "private-note";

    const errors = validateSupplierRelationshipPipeline(unsafe as unknown as SupplierRelationshipPipeline);
    expect(errors).toContain("policy.outbound_messages_sent must be false");
    expect(errors).toContain("feetech: do_not_send must be true");
    expect(errors).toContain("feetech: approval_state must remain not_requested");
    expect(errors).toContain("feetech: contact public_source_url must be HTTP(S)");
  });
});
