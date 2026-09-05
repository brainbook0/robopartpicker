import type { GeneratedSentence, ProjectDescriptionFact } from "../../src/shared/generatedProjectDescription";

export function buildDescriptionPublicationSql(input: {
  generationId: string;
  projectId: string;
  sourceFingerprint: string;
  modelId: string;
  promptVersion: string;
  voiceProfile: string;
  facts: ProjectDescriptionFact[];
  summary: string;
  description: string;
  omittedFacts: string[];
  sentences: GeneratedSentence[];
  validationReport: Record<string, unknown>;
  inputTokens?: number;
  outputTokens?: number;
  now: string;
}): string[] {
  const statements: string[] = [];
  statements.push(`UPDATE project_description_generations SET status = 'superseded' WHERE project_id = ${q(input.projectId)} AND status = 'published' AND id <> ${q(input.generationId)};`);
  statements.push(`INSERT INTO project_description_generations (id, project_id, source_project_version_id, published_project_version_id, source_fingerprint, model_id, prompt_version, voice_profile, status, source_packet_json, summary_text, description_text, omitted_facts_json, validation_report_json, input_tokens, output_tokens, created_at, validated_at, published_at, rejected_at) VALUES (${q(input.generationId)}, ${q(input.projectId)}, NULL, NULL, ${q(input.sourceFingerprint)}, ${q(input.modelId)}, ${q(input.promptVersion)}, ${q(input.voiceProfile)}, 'published', ${q(JSON.stringify({ facts: input.facts }))}, ${q(input.summary)}, ${q(input.description)}, ${q(JSON.stringify(input.omittedFacts))}, ${q(JSON.stringify(input.validationReport))}, ${numberOrNull(input.inputTokens)}, ${numberOrNull(input.outputTokens)}, ${q(input.now)}, ${q(input.now)}, ${q(input.now)}, NULL);`);
  input.sentences.forEach((sentence, index) => statements.push(`INSERT INTO project_description_sentence_sources (generation_id, sentence_index, sentence_text, source_refs_json) VALUES (${q(input.generationId)}, ${index}, ${q(sentence.text)}, ${q(JSON.stringify(sentence.sourceRefs))});`));
  statements.push(`UPDATE projects SET summary = ${q(input.summary)}, description = ${q(input.description)}, current_description_generation_id = ${q(input.generationId)}, updated_at = ${q(input.now)} WHERE id = ${q(input.projectId)};`);
  return statements;
}

export function buildDescriptionReactivationSql(input: {
  generationId: string;
  projectId: string;
  now: string;
}): string[] {
  return [
    `UPDATE project_description_generations SET status = 'superseded' WHERE project_id = ${q(input.projectId)} AND status = 'published' AND id <> ${q(input.generationId)};`,
    `UPDATE project_description_generations SET status = 'published', published_at = COALESCE(published_at, ${q(input.now)}) WHERE id = ${q(input.generationId)} AND project_id = ${q(input.projectId)} AND status = 'superseded';`,
    `UPDATE projects SET summary = (SELECT summary_text FROM project_description_generations WHERE id = ${q(input.generationId)}), description = (SELECT description_text FROM project_description_generations WHERE id = ${q(input.generationId)}), current_description_generation_id = ${q(input.generationId)}, updated_at = ${q(input.now)} WHERE id = ${q(input.projectId)} AND EXISTS (SELECT 1 FROM project_description_generations WHERE id = ${q(input.generationId)} AND project_id = ${q(input.projectId)} AND status = 'published');`,
  ];
}

function q(value: string): string { return `'${value.replace(/'/gu, "''")}'`; }
function numberOrNull(value: number | undefined): string { return Number.isInteger(value) && Number(value) >= 0 ? String(value) : "NULL"; }
