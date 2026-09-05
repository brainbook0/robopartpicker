import { describe, expect, it } from "vitest";
import migration from "../../migrations/0032_bom_publication_and_generated_descriptions.sql?raw";

describe("BOM publication and generated description migration", () => {
  it("adds explicit BOM lifecycle and compiler provenance", () => {
    for (const token of [
      "ALTER TABLE bom_generation_runs ADD COLUMN compiler_version",
      "ALTER TABLE bom_generation_runs ADD COLUMN policy_version",
      "ALTER TABLE bom_generation_runs ADD COLUMN publication_state",
      "ALTER TABLE bom_versions ADD COLUMN publication_state",
      "ALTER TABLE bom_versions ADD COLUMN coverage_note",
      "ALTER TABLE bom_versions ADD COLUMN omission_report_json",
      "CHECK (publication_state IN ('draft', 'verified', 'partial', 'unavailable', 'manufacturer_unavailable', 'not_applicable', 'classification_required', 'rejected'))",
    ]) expect(migration).toContain(token);
  });

  it("stores artifact inventory and exactly one accounted outcome per source object", () => {
    for (const token of [
      "CREATE TABLE bom_source_artifacts",
      "retrieval_status",
      "adapter_id",
      "adapter_version",
      "CREATE TABLE bom_source_object_outcomes",
      "source_object_id",
      "CHECK (outcome IN ('published_purchased', 'published_optional', 'aggregated', 'non_procurement', 'metadata', 'rejected', 'unsupported'))",
      "UNIQUE (generation_run_id, source_object_id)",
    ]) expect(migration).toContain(token);
  });

  it("stores source-cited description generations without replacing canonical evidence", () => {
    for (const token of [
      "CREATE TABLE project_description_generations",
      "source_fingerprint",
      "model_id",
      "prompt_version",
      "voice_profile",
      "validation_report_json",
      "CREATE TABLE project_description_sentence_sources",
      "source_refs_json",
      "UNIQUE (generation_id, sentence_index)",
    ]) expect(migration).toContain(token);
  });
});
