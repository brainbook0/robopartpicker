import { describe, expect, it } from "vitest";
import { buildDescriptionPublicationSql, buildDescriptionReactivationSql } from "../../scripts/lib/description-campaign";
import publisherRaw from "../../scripts/publish-project-descriptions.ts?raw";

it("publishes a validated description with sentence sources and supersedes history without deletion", () => {
  const sql = buildDescriptionPublicationSql({
    generationId: "generation-new",
    projectId: "project-1",
    sourceFingerprint: "a".repeat(64),
    modelId: "deepseek/deepseek-v4-flash-0731",
    promptVersion: "project-description/1",
    voiceProfile: "luca-direct-third-person/1",
    facts: [{ id: "fact-1", text: "Robot One is a mobile robot.", sourceUrl: "https://example.com" }],
    summary: "Robot One is a source-linked mobile robot with a direct, evidence-bound catalog profile.",
    description: "Robot One is a mobile robot. Its catalog profile stays tied to the published source.",
    omittedFacts: [],
    sentences: [
      { text: "Robot One is a mobile robot.", sourceRefs: ["fact-1"] },
      { text: "Its catalog profile stays tied to the published source.", sourceRefs: ["fact-1"] },
    ],
    validationReport: { ok: true, errors: [] },
    inputTokens: 100,
    outputTokens: 80,
    now: "2026-08-26T00:00:00.000Z",
  }).join("\n");
  expect(sql).toContain("UPDATE project_description_generations SET status = 'superseded'");
  expect(sql).toContain("INSERT INTO project_description_generations");
  expect(sql).toContain("INSERT INTO project_description_sentence_sources");
  expect(sql).toContain("UPDATE projects SET summary =");
  expect(sql).toContain("current_description_generation_id = 'generation-new'");
  expect(sql).not.toMatch(/DELETE\s+FROM/iu);
});

it("reactivates an immutable superseded generation without inserting or rewriting it", () => {
  const sql = buildDescriptionReactivationSql({
    generationId: "generation-existing",
    projectId: "project-1",
    now: "2026-08-26T00:00:00.000Z",
  }).join("\n");
  expect(sql).toContain("id <> 'generation-existing'");
  expect(sql).toContain("SET status = 'published'");
  expect(sql).toContain("summary = (SELECT summary_text");
  expect(sql).toContain("current_description_generation_id = 'generation-existing'");
  expect(sql).not.toContain("INSERT INTO project_description_generations");
  expect(sql).not.toContain("summary_text =");
  expect(sql).not.toMatch(/DELETE\s+FROM/iu);
});

it("relinks an existing published generation when the project pointer was cleared", () => {
  expect(publisherRaw).toContain("current_description_generation_id === generationId");
  expect(publisherRaw).toContain("buildDescriptionReactivationSql");
});
