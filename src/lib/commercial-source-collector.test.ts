import { describe, expect, it } from "vitest";
import { extractOfficialImageCandidates, officialActivityValue, parseOfficialPageMetadata, parseOfficialReaderMetadata } from "./commercial-source-metadata";

describe("commercial official source collector", () => {
  it("extracts model-specific prose and product media from the official reader fallback", () => {
    const metadata = parseOfficialReaderMetadata(`
# DR02

DEEP Robotics DR02 is an industrial humanoid built for all-weather inspection and logistics work.

![DR02 industrial humanoid](https://www.deeprobotics.cn/media/dr02-product.webp)
![DEEP Robotics logo](https://www.deeprobotics.cn/logo.svg)
`, "https://www.deeprobotics.cn/en/index/dr02.html");
    expect(metadata.description).toContain("DR02 is an industrial humanoid");
    expect(metadata.imageUrl).toBe("https://www.deeprobotics.cn/media/dr02-product.webp");
  });

  it("extracts description, product image and structured modification date", () => {
    const html = `<html><head><meta property="og:description" content="A complete humanoid robot for research and industrial evaluation."><meta property="og:image" content="https://manufacturer.example/robot.webp"><script type="application/ld+json">{"@type":"Product","dateModified":"2026-08-01T00:00:00Z"}</script></head></html>`;
    expect(parseOfficialPageMetadata(html, "https://manufacturer.example/model", null)).toEqual(expect.objectContaining({
      description: "A complete humanoid robot for research and industrial evaluation.",
      imageUrl: "https://manufacturer.example/robot.webp",
      activityDate: "2026-08-01T00:00:00.000Z",
    }));
  });

  it("uses a valid Last-Modified header only when structured activity dates are absent", () => {
    const result = parseOfficialPageMetadata("<html><head><title>Robot</title></head></html>", "https://manufacturer.example/model", "Wed, 20 Aug 2026 12:00:00 GMT");
    expect(result.activityDate).toBe("2026-08-20T12:00:00.000Z");
    expect(result.description).toBeNull();
    expect(result.imageUrl).toBeNull();
  });

  it("falls back to a large product-like page image while rejecting logos and tracking pixels", () => {
    const html = `<html><body><img src="/logo.svg" width="200"><img src="https://px.example/collect.gif" width="1" height="1"><img src="/images/g1-product_800x800.png"></body></html>`;
    expect(parseOfficialPageMetadata(html, "https://manufacturer.example/g1", null).imageUrl).toBe("https://manufacturer.example/images/g1-product_800x800.png");
  });

  it("prefers an exact Product JSON-LD image and accepts a large model-specific srcset image", () => {
    const jsonLd = `<script type="application/ld+json">{"@type":"Product","name":"JAKA A12L","image":"/profile/upload/JAKA-A12L.jpg"}</script>`;
    expect(parseOfficialPageMetadata(jsonLd, "https://www.jaka.com/en/productDetails/JAKA%20A12L", null).imageUrl).toBe("https://www.jaka.com/profile/upload/JAKA-A12L.jpg");
    const srcset = `<picture><source srcset="https://cdn.example/ur30.png/m/704x528 704w, https://cdn.example/ur30.png/m/1408x1056 1408w"></picture>`;
    expect(parseOfficialPageMetadata(srcset, "https://manufacturer.example/products/ur30/", null).imageUrl).toBe("https://cdn.example/ur30.png/m/1408x1056");
  });

  it("extracts a ranked, deduplicated official product gallery", () => {
    const html = `<html><head>
      <meta property="og:image" content="/media/g1-hero.jpg">
      <script type="application/ld+json">{"@type":"Product","image":["/media/g1-hero.jpg","/media/g1-side.jpg","/media/g1-rear.jpg"]}</script>
      </head><body>
      <img src="/logo.svg" width="300" height="120">
      <img src="/media/g1-detail.jpg" width="1200" height="800" alt="G1 robot detail">
      <img src="/media/team.jpg" width="1200" height="800" alt="Team">
      </body></html>`;
    expect(extractOfficialImageCandidates(html, "https://manufacturer.example/products/g1", 4)).toEqual([
      "https://manufacturer.example/media/g1-hero.jpg",
      "https://manufacturer.example/media/g1-side.jpg",
      "https://manufacturer.example/media/g1-rear.jpg",
      "https://manufacturer.example/media/g1-detail.jpg",
    ]);
  });

  it("maps official recency without inventing category prices", () => {
    expect(officialActivityValue("2026-08-20T00:00:00.000Z", "2026-08-25T00:00:00.000Z")).toBe(360);
    expect(officialActivityValue(null, "2026-08-25T00:00:00.000Z")).toBeNull();
    expect(officialActivityValue(null, "2026-08-25T00:00:00.000Z", true)).toBe(1);
  });
});
