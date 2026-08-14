import pipelineJson from "../../data/supplier-relationships/2026-08-14-wave1.json";
import {
  buildSupplierRelationshipPublicSummary,
  validateSupplierRelationshipPipeline,
  type SupplierRelationshipPipeline,
} from "../../src/lib/supplier-relationship-pipeline";

const pipeline = pipelineJson as SupplierRelationshipPipeline;
const errors = validateSupplierRelationshipPipeline(pipeline);
if (errors.length) throw new Error(`Invalid bundled supplier relationship pipeline: ${errors.join("; ")}`);

export function supplierRelationshipPipeline(): SupplierRelationshipPipeline {
  return structuredClone(pipeline);
}

export function supplierRelationshipPublicSummary() {
  return buildSupplierRelationshipPublicSummary(pipeline);
}
