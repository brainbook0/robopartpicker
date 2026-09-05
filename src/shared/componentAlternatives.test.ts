import { describe, expect, it } from "vitest";
import { rankComponentAlternatives, type RankableComponent } from "./componentAlternatives";

function component(overrides: Partial<RankableComponent> & Pick<RankableComponent, "id" | "name">): RankableComponent {
  return {
    id: overrides.id,
    name: overrides.name,
    category: "sensor",
    maker: "Acme",
    mpn: `MPN-${overrides.id}`,
    lifecycleStatus: "active",
    compatibility: [],
    technicalSpecifications: [],
    managedImageCount: 0,
    hasSource: true,
    isDemo: false,
    ...overrides,
  };
}

describe("rankComponentAlternatives", () => {
  const target = component({
    id: "target",
    name: "Target sensor",
    compatibility: ["i2c", "3v3"],
    technicalSpecifications: [
      { key: "voltage", value: 3.3, unit: "V" },
      { key: "interface", value: "I2C", unit: null },
    ],
  });

  it("filters to live same-category candidates and excludes the target", () => {
    const result = rankComponentAlternatives(target, [
      target,
      component({ id: "same", name: "Same category" }),
      component({ id: "wrong", name: "Wrong category", category: "compute" }),
      component({ id: "demo", name: "Demo", isDemo: true }),
    ]);

    expect(result.map((item) => item.candidate.id)).toEqual(["same"]);
    expect(result[0]).toMatchObject({ compatibilityStatus: "unverified" });
    expect(result[0].reasons).toContain("Same component category");
  });

  it("ranks shared compatibility and exact specification evidence above coverage signals", () => {
    const result = rankComponentAlternatives(target, [
      component({ id: "covered", name: "Covered", managedImageCount: 2 }),
      component({
        id: "matched",
        name: "Matched",
        maker: "Other",
        compatibility: ["i2c", "3v3"],
        technicalSpecifications: [
          { key: "interface", value: "i2c", unit: null },
          { key: "voltage", value: 3.3, unit: "V" },
        ],
      }),
    ]);

    expect(result.map((item) => item.candidate.id)).toEqual(["matched", "covered"]);
    expect(result[0].reasons).toEqual(expect.arrayContaining([
      "2 shared compatibility tags",
      "2 matching technical specifications",
    ]));
  });

  it("prefers active, identity-complete, imaged candidates and breaks ties deterministically", () => {
    const result = rankComponentAlternatives(target, [
      component({ id: "z", name: "Zulu", lifecycleStatus: "obsolete", maker: "", mpn: null, hasSource: false }),
      component({ id: "b", name: "Beta", managedImageCount: 1 }),
      component({ id: "a", name: "Alpha", managedImageCount: 1 }),
    ]);

    expect(result.map((item) => item.candidate.id)).toEqual(["a", "b", "z"]);
    expect(result[0].reasons).toContain("Source-backed product image");
  });

  it("honors the bounded recommendation limit", () => {
    const candidates = Array.from({ length: 10 }, (_, index) => component({ id: String(index), name: `Part ${index}` }));
    expect(rankComponentAlternatives(target, candidates, 5)).toHaveLength(5);
    expect(rankComponentAlternatives(target, candidates, 100)).toHaveLength(10);
    expect(rankComponentAlternatives(target, candidates, 0)).toHaveLength(1);
  });
});
