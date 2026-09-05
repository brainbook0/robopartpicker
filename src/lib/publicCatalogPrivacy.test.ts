import { describe, expect, it } from "vitest";
import partDetailSource from "@/pages/PartDetail.tsx?raw";
import partsCatalogSource from "@/pages/PartsCatalog.tsx?raw";
import partsTableSource from "@/components/parts/PartsTable.tsx?raw";
import catalogNoticeSource from "@/components/parts/CatalogDataNotice.tsx?raw";
import homeSource from "@/pages/Index.tsx?raw";
import compareSource from "@/pages/PartCompare.tsx?raw";
import headerSource from "@/components/layout/SiteHeader.tsx?raw";

describe("public catalog privacy surface", () => {
  it("does not expose supplier identities or commercial observations in public component pages", () => {
    const publicSurface = [partDetailSource, partsCatalogSource, partsTableSource, catalogNoticeSource, homeSource, compareSource, headerSource].join("\n");

    for (const forbidden of [
      "supplierName",
      "supplierSku",
      "supplierRegion",
      "lowestObservedPrice",
      "priceDelta30",
      "SOURCE_OBSERVATION_TOOLTIP",
      "Observed offers",
      "Observed price",
      "stocked offers",
      "lead time",
      "liveOffers",
      "lowestLivePrice",
    ]) {
      expect(publicSurface, `public catalog contains ${forbidden}`).not.toContain(forbidden);
    }
  });
});
