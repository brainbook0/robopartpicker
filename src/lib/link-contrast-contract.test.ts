import { describe, expect, it } from "vitest";
import priceHistory from "../components/pricing/PriceHistoryPlaceholder.tsx?raw";
import sources from "../components/projects/SourcesVerification.tsx?raw";
import proposals from "../components/projects/ProjectProposalPanel.tsx?raw";
import discussion from "../components/community/RelatedDiscussionList.tsx?raw";
import detail from "../pages/ProjectDetail.tsx?raw";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(left: string, right: string): number {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("contrast-safe textual links", () => {
  it("maintains AA contrast in light and dark themes", () => {
    expect(contrast("#996b00", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffd84d", "#09090b")).toBeGreaterThanOrEqual(4.5);
  });
  it("uses the contrast-safe token on the previously failing project surfaces", () => {
    for (const source of [priceHistory, sources, proposals, discussion, detail]) expect(source).toContain("text-link");
  });
});
