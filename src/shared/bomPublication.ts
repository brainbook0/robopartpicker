export const BOM_PUBLICATION_STATES = [
  "draft",
  "verified",
  "partial",
  "unavailable",
  "manufacturer_unavailable",
  "not_applicable",
  "classification_required",
  "rejected",
] as const;

export type BomPublicationState = (typeof BOM_PUBLICATION_STATES)[number];

export type SourceObjectOutcomeKind =
  | "published_purchased"
  | "published_optional"
  | "aggregated"
  | "non_procurement"
  | "metadata"
  | "rejected"
  | "unsupported";

export type SourceObjectOutcome = {
  sourceObjectId: string;
  outcome: SourceObjectOutcomeKind;
  aggregateTargetId?: string;
  reason?: string;
};

export function bomStateForProject(input: {
  projectKind: "physical_design" | "robotics_software" | "commercial_showcase" | "unknown";
  commercial: boolean;
  explicitBomFound: boolean;
  accountingValid?: boolean;
  sourceComplete?: boolean;
}): BomPublicationState {
  if (input.projectKind === "robotics_software") return "not_applicable";
  if (input.projectKind === "unknown") return "classification_required";
  if (!input.explicitBomFound) return input.commercial || input.projectKind === "commercial_showcase"
    ? "manufacturer_unavailable"
    : "unavailable";
  if (input.accountingValid === false) return "rejected";
  return input.sourceComplete === true ? "verified" : "partial";
}

export function publicBomLinesAllowed(state: BomPublicationState): boolean {
  return state === "verified" || state === "partial";
}

export function completedQuoteAllowed(state: BomPublicationState, quoteReady: boolean): boolean {
  return quoteReady && publicBomLinesAllowed(state);
}

export function quoteBlockerForBomState(state: BomPublicationState): string | null {
  switch (state) {
    case "verified": return null;
    case "partial": return "The published source BOM is partial; known omissions must be reviewed before quoting.";
    case "unavailable": return "This project does not publish an explicit source BOM.";
    case "manufacturer_unavailable": return "The manufacturer has not published a model-specific BOM.";
    case "not_applicable": return "This is a software project, so a hardware BOM does not apply.";
    case "classification_required": return "The project must be classified as a physical model or software project before BOM generation.";
    case "draft": return "The source BOM is still being validated.";
    case "rejected": return "The source BOM failed validation and is not published.";
  }
}

export function validateSourceAccounting(
  sourceObjectIds: readonly string[],
  outcomes: readonly SourceObjectOutcome[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const inventory = new Set(sourceObjectIds);
  const counts = new Map<string, number>();

  for (const outcome of outcomes) {
    counts.set(outcome.sourceObjectId, (counts.get(outcome.sourceObjectId) ?? 0) + 1);
    if (!inventory.has(outcome.sourceObjectId)) errors.push(`${outcome.sourceObjectId} is not in the source inventory`);
    if (outcome.outcome === "aggregated" && !outcome.aggregateTargetId) {
      errors.push(`${outcome.sourceObjectId} aggregation target is missing`);
    }
    if ((outcome.outcome === "rejected" || outcome.outcome === "unsupported") && !outcome.reason?.trim()) {
      errors.push(`${outcome.sourceObjectId} ${outcome.outcome} reason is missing`);
    }
  }

  for (const sourceObjectId of inventory) {
    const count = counts.get(sourceObjectId) ?? 0;
    if (count !== 1) errors.push(`${sourceObjectId} has ${count} outcomes`);
  }

  return { ok: errors.length === 0, errors };
}
