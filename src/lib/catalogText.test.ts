import { describe, expect, it } from "vitest";
import { normalizeCatalogText } from "./catalogText";

describe("normalizeCatalogText", () => {
  it("decodes named and numeric HTML entities", () => {
    expect(normalizeCatalogText("A 2.4&quot; display &amp; touch &#x2014; it&#39;s compact.")).toBe(
      "A 2.4\" display & touch — it's compact.",
    );
  });

  it("turns imported block markup into readable paragraphs without returning HTML", () => {
    expect(normalizeCatalogText("<p>First paragraph.</p><p>Second<br>line.</p>")).toBe(
      "First paragraph.\n\nSecond\nline.",
    );
    expect(normalizeCatalogText("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("<script>alert(1)</script>");
  });

  it("removes markdown image noise and retains link labels", () => {
    expect(normalizeCatalogText("Intro ![product](https://example.com/a.png) [datasheet](https://example.com/a.pdf) end.")).toBe(
      "Intro datasheet end.",
    );
  });

  it("normalizes escaped line breaks, whitespace, and repeated blank lines", () => {
    expect(normalizeCatalogText("  First   line\\nnext.\n\n\n  Final   paragraph.  ")).toBe(
      "First line\nnext.\n\nFinal paragraph.",
    );
  });

  it("returns an empty string for missing or markup-only values", () => {
    expect(normalizeCatalogText(null)).toBe("");
    expect(normalizeCatalogText(undefined)).toBe("");
    expect(normalizeCatalogText("<!-- imported --> <div> </div>")).toBe("");
  });
});
