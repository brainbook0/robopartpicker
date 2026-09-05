export type ProjectDescriptionFact = {
  id: string;
  text: string;
  sourceUrl?: string | null;
};

export type GeneratedSentence = {
  text: string;
  sourceRefs: string[];
};

export type GeneratedProjectDescriptionDraft = {
  summary: string;
  summarySourceRefs: string[];
  paragraphs: Array<{ sentences: GeneratedSentence[] }>;
  omittedFacts?: string[];
};

export type GeneratedDescriptionValidation = {
  ok: boolean;
  errors: string[];
  summary: string;
  description: string;
  sentences: GeneratedSentence[];
};

const AI_STYLE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:delve|leverag(?:e|ing)|crucial|seamless|testament|groundbreaking|game[- ]changer)\b/iu, "AI-style phrase"],
  [/\bin today'?s (?:world|landscape)\b/iu, "AI-style phrase"],
  [/\bplays? a (?:vital|crucial|key) role\b/iu, "AI-style phrase"],
  [/\bit is worth noting\b/iu, "AI-style phrase"],
];

export function validateGeneratedProjectDescription(
  draft: GeneratedProjectDescriptionDraft,
  facts: readonly ProjectDescriptionFact[],
): GeneratedDescriptionValidation {
  const errors: string[] = [];
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const summary = String(draft.summary ?? "").trim();
  const paragraphs = Array.isArray(draft.paragraphs) ? draft.paragraphs : [];
  const sentences = paragraphs.flatMap((paragraph) => Array.isArray(paragraph.sentences) ? paragraph.sentences : []);
  const description = paragraphs
    .map((paragraph) => (paragraph.sentences ?? []).map((sentence) => String(sentence.text ?? "").trim()).filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n\n");

  if (summary.length < 50 || summary.length > 400) errors.push("summary length must be between 50 and 400 characters");
  if (description.length < 100 || description.length > 4_000) errors.push("description length must be between 100 and 4000 characters");
  validateText("summary", summary, draft.summarySourceRefs ?? [], factById, errors);
  sentences.forEach((sentence, index) => validateText(`sentence ${index + 1}`, String(sentence.text ?? "").trim(), sentence.sourceRefs ?? [], factById, errors));
  if (sentences.length < 2 || sentences.length > 16) errors.push("description must contain between 2 and 16 cited sentences");

  return { ok: errors.length === 0, errors: [...new Set(errors)], summary, description, sentences };
}

function validateText(
  label: string,
  text: string,
  sourceRefs: readonly string[],
  factById: Map<string, ProjectDescriptionFact>,
  errors: string[],
): void {
  if (!text) errors.push(`${label} is empty`);
  if (/[—–]/u.test(text)) errors.push(`${label} contains an em dash or en dash`);
  if (/;/u.test(text)) errors.push(`${label} contains a semicolon`);
  if (/\b(?:sha[- ]?256|checksum)\b/iu.test(text)) errors.push(`${label} contains checksum jargon`);
  if (/\b[a-f0-9]{32,}\b/iu.test(text)) errors.push(`${label} contains a cryptographic hash`);
  if (/\b(?:the\s+)?source record is catalog-[a-z0-9.-]+/iu.test(text)) errors.push(`${label} contains an internal catalog revision`);
  if (/\b(?:I|I'm|I've|I'd|my|mine|we|we're|we've|our|ours)\b/iu.test(text)) errors.push(`${label} contains a first-person claim`);
  for (const [pattern, name] of AI_STYLE_PATTERNS) if (pattern.test(text)) errors.push(`${label} contains an ${name}`);
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) {
    errors.push(`${label} has no source reference`);
    return;
  }
  const referenced: ProjectDescriptionFact[] = [];
  for (const sourceRef of sourceRefs) {
    const fact = factById.get(sourceRef);
    if (!fact) errors.push(`${label} references unknown fact ${sourceRef}`);
    else referenced.push(fact);
  }
  const evidenceText = referenced.map((fact) => fact.text).join(" ");
  for (const number of numbersIn(text)) {
    if (!numbersIn(evidenceText).includes(number)) errors.push(`${label} contains unsupported number ${number}`);
  }
}

function numbersIn(value: string): string[] {
  return value.match(/\d+(?:[.,]\d+)?%?/gu)?.map((token) => {
    const percent = token.endsWith("%");
    const numeric = Number(token.replace(/[% ,]/gu, ""));
    return `${Number.isFinite(numeric) ? numeric : token}${percent ? "%" : ""}`;
  }) ?? [];
}
