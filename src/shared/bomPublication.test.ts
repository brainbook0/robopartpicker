import { describe, expect, it } from "vitest";
import {
  bomStateForProject,
  completedQuoteAllowed,
  publicBomLinesAllowed,
  quoteBlockerForBomState,
  validateSourceAccounting,
  type SourceObjectOutcome,
} from "./bomPublication";

describe("BOM publication policy", () => {
  it("maps every project class to an honest no-source state", () => {
    expect(bomStateForProject({ projectKind: "robotics_software", commercial: false, explicitBomFound: false })).toBe("not_applicable");
    expect(bomStateForProject({ projectKind: "commercial_showcase", commercial: true, explicitBomFound: false })).toBe("manufacturer_unavailable");
    expect(bomStateForProject({ projectKind: "physical_design", commercial: false, explicitBomFound: false })).toBe("unavailable");
    expect(bomStateForProject({ projectKind: "unknown", commercial: false, explicitBomFound: false })).toBe("classification_required");
  });

  it("publishes lines only for validated explicit-source states", () => {
    expect(publicBomLinesAllowed("verified")).toBe(true);
    expect(publicBomLinesAllowed("partial")).toBe(true);
    for (const state of ["draft", "rejected", "unavailable", "manufacturer_unavailable", "not_applicable", "classification_required"] as const) {
      expect(publicBomLinesAllowed(state)).toBe(false);
    }
  });

  it("uses plain-language quote blockers instead of internal fail-closed copy", () => {
    expect(quoteBlockerForBomState("manufacturer_unavailable")).toBe("The manufacturer has not published a model-specific BOM.");
    expect(quoteBlockerForBomState("not_applicable")).toBe("This is a software project, so a hardware BOM does not apply.");
    expect(quoteBlockerForBomState("partial")).toMatch(/partial/iu);
    expect(Object.values({
      unavailable: quoteBlockerForBomState("unavailable"),
      classification: quoteBlockerForBomState("classification_required"),
    }).join(" ")).not.toMatch(/fail closed/iu);
  });

  it("requires both a publishable state and a quote-ready flag", () => {
    expect(completedQuoteAllowed("verified", true)).toBe(true);
    expect(completedQuoteAllowed("partial", true)).toBe(true);
    expect(completedQuoteAllowed("verified", false)).toBe(false);
    expect(completedQuoteAllowed("draft", true)).toBe(false);
    expect(completedQuoteAllowed("rejected", true)).toBe(false);
  });
});

describe("source object accounting", () => {
  const outcomes: SourceObjectOutcome[] = [
    { sourceObjectId: "row-1", outcome: "published_purchased" },
    { sourceObjectId: "row-2", outcome: "aggregated", aggregateTargetId: "row-1" },
    { sourceObjectId: "row-3", outcome: "metadata" },
    { sourceObjectId: "row-4", outcome: "rejected", reason: "quantity_missing" },
  ];

  it("accepts exactly one named outcome for every source object", () => {
    expect(validateSourceAccounting(["row-1", "row-2", "row-3", "row-4"], outcomes)).toEqual({ ok: true, errors: [] });
  });

  it("rejects silent drops, duplicate outcomes, and incomplete aggregation", () => {
    const report = validateSourceAccounting(["row-1", "row-2", "row-3", "row-4"], [
      ...outcomes,
      { sourceObjectId: "row-1", outcome: "metadata" },
      { sourceObjectId: "row-5", outcome: "aggregated" },
    ]);
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      "row-1 has 2 outcomes",
      "row-5 is not in the source inventory",
      "row-5 aggregation target is missing",
    ]));
  });
});
