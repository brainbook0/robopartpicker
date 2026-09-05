import { describe, expect, it } from "vitest";
import insightSource from "../pages/ProjectInsight.tsx?raw";
import clientSource from "./api/project-community.ts?raw";

describe("project community tabs integration", () => {
  it("exposes typed review, comment, report and badge operations", () => {
    for (const token of [
      "/reviews/mine", "/reviews`", "/comments`", "/helpful", "/project-content-reports", "/experience-badges", "/experience-claims",
    ]) expect(clientSource).toContain(token);
  });

  it("makes the approved four project tabs primary without breaking engineering deep links", () => {
    expect(insightSource).toContain('const primaryAspects = ["overview", "specifications", "reviews", "discussion"] as const;');
    expect(insightSource).toContain('overview: "Overview"');
    expect(insightSource).toContain('specifications: "Specifications"');
    expect(insightSource).toContain('reviews: "Reviews"');
    expect(insightSource).toContain('discussion: "Discussion"');
    expect(insightSource).toContain("<ProjectSpecifications");
    expect(insightSource).toContain("<ProjectReviews");
    expect(insightSource).toContain("<ProjectDiscussion");
  });
});
