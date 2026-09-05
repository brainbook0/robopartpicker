import { describe, expect, it } from "vitest";
import appSource from "../App.tsx?raw";
import bomItemsSource from "../components/boms/BomItemsDisplay.tsx?raw";
import bomItemDetailSource from "../pages/BomItemDetail.tsx?raw";

describe("stable BOM item detail integration", () => {
  it("registers a stable BOM item route", () => {
    expect(appSource).toContain('import BomItemDetail from "./pages/BomItemDetail.tsx";');
    expect(appSource).toContain('<Route path="/boms/:bomId/items/:itemId" element={<BomItemDetail />} />');
  });

  it("routes unresolved lines through bomItemDestination instead of search", () => {
    expect(bomItemsSource).toContain("bomItemDestination(bomId, item)");
    expect(bomItemsSource).not.toContain('`/search?q=');
  });

  it("explains source trace, identity state and correction path", () => {
    expect(bomItemDetailSource).toContain("Source trace");
    expect(bomItemDetailSource).toContain("Matching status");
    expect(bomItemDetailSource).toContain("Help identify or correct this line");
    expect(bomItemDetailSource).toContain("Raw imported fields");
  });

  it("does not render an em dash for unknown money", () => {
    expect(bomItemsSource).toContain('return minor == null ? "Estimate pending"');
  });
});
