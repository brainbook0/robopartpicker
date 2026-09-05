import { describe, expect, it } from "vitest";
import reviewPageSource from "@/pages/ProjectClaimsReview.tsx?raw";
import appSource from "@/App.tsx?raw";

describe("project claim moderator UI contract", () => {
  it("mounts a dedicated moderator route", () => {
    expect(appSource).toContain('path="/admin/project-claims"');
    expect(appSource).toContain("ProjectClaimsReview");
  });

  it("keeps evidence on the protected streaming route and requires private notes", () => {
    expect(reviewPageSource).toContain("item.evidenceFile.contentUrl");
    expect(reviewPageSource).toContain("privateModeratorNotes");
    expect(reviewPageSource).toContain("minLength={10}");
    expect(reviewPageSource).toContain('review(item, "approve")');
    expect(reviewPageSource).toContain('review(item, "reject")');
  });
});
