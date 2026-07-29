import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

import { validateCoverage } from "../../scripts/validate-source-coverage.mjs";

const root = resolve(import.meta.dirname, "..", "..");

describe("data collection source coverage", () => {
  it("maps the hash-pinned canonical inventory completely", () => {
    expect(validateCoverage()).toEqual({
      sections: 38,
      source_families: 227,
      source_occurrences: 309,
      fields: 962,
      inventory_terms: 103,
      source_tier_entries: 28,
      canonical_object_types: 27,
      pilots: 5,
    });
  });

  it("keeps exactly five pilot candidates disabled behind policy review", () => {
    const config = YAML.parse(
      readFileSync(resolve(root, "config", "data-collection", "pilot-sources.yaml"), "utf8"),
    ) as {
      pilots: Record<string, { enabled: boolean; policy_state: string }>;
    };

    expect(Object.keys(config.pilots).sort()).toEqual([
      "distributor_pilot",
      "github_repository_pilot",
      "manufacturer_pilot",
      "ros_bom_pilot",
      "volatile_offer_pilot",
    ]);
    expect(
      Object.values(config.pilots).every(
        (pilot) => pilot.enabled === false && pilot.policy_state === "unreviewed",
      ),
    ).toBe(true);
  });
});
