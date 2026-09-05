import { describe, expect, it } from "vitest";
import { applyCommercialIdentityOverride } from "./commercial-identity";

describe("commercial identity overrides", () => {
  it("removes URL suffixes and fixes X-Trainer classification", () => {
    const xTrainer = applyCommercialIdentityOverride({ slug: "dobot-x-trainer-html", name: "x-trainer.html", model: "x-trainer.html", category: "humanoid" });
    expect(xTrainer).toMatchObject({ name: "DOBOT X-Trainer", model: "X-Trainer", category: "manipulator" });
  });

  it("normalizes DOBOT model branding without changing unrelated records", () => {
    expect(applyCommercialIdentityOverride({ slug: "dobot-mg400-html", name: "mg400.html", model: "mg400.html", category: "manipulator" })).toMatchObject({ name: "DOBOT MG400", model: "MG400" });
    const atlas = { slug: "boston-dynamics-atlas", name: "Atlas", model: "Atlas", category: "humanoid" };
    expect(applyCommercialIdentityOverride(atlas)).toBe(atlas);
  });
});
