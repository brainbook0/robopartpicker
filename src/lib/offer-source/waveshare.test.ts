import { describe, expect, it } from "vitest";
import { normalizePartToken } from "./types";
import { extractJsonLdProducts, parseWaveshareProductPage } from "./waveshare";

const WAVESHARE_URL = "https://www.waveshare.com/ots-2428-1.27-04.htm";

const PAGE = (sku: string, price: unknown, currency = "USD", availability = "https://schema.org/InStock") => `
<!DOCTYPE html><html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "sku": ${JSON.stringify(sku)},
  "mpn": "OTS-24(28)-1.27-04",
  "name": "OTS-24(28)-1.27-04, Test & Burn-in Socket",
  "brand": { "@type": "Brand", "name": "Enplas" },
  "description": "Enplas IC Test & Burn-in Socket",
  "offers": {
    "@type": "Offer",
    "priceCurrency": ${JSON.stringify(currency)},
    "price": ${JSON.stringify(price)},
    "availability": ${JSON.stringify(availability)}
  }
}
</script>
</head><body></body></html>
`;

describe("normalizePartToken", () => {
  it("preserves the underlying token while removing presentation noise", () => {
    expect(normalizePartToken("  10177 ")).toBe("10177");
    expect(normalizePartToken("REV-21-6801")).toBe("REV-21-6801");
    expect(normalizePartToken("rev-21-6801")).toBe("REV-21-6801");
  });

  it("does not collapse meaningful punctuation", () => {
    expect(normalizePartToken("am-4755a_V4CXCA")).toBe("am-4755a_V4CXCA".toUpperCase());
    expect(normalizePartToken("a-b") === normalizePartToken("ab")).toBe(false);
  });
});

describe("extractJsonLdProducts", () => {
  it("finds a top-level Product node", () => {
    expect(extractJsonLdProducts(PAGE("10177", 34.99))).toHaveLength(1);
  });

  it("follows a @graph container", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Product","sku":"10177"},{"@type":"WebSite","name":"x"}]}</script>`;
    expect(extractJsonLdProducts(html)).toHaveLength(1);
  });

  it("ignores malformed JSON-LD blocks", () => {
    const html = `<script type="application/ld+json">{not json}</script><script type="application/ld+json">{"@type":"Product","sku":"10177"}</script>`;
    expect(extractJsonLdProducts(html)).toHaveLength(1);
  });
});

describe("parseWaveshareProductPage", () => {
  it("returns a verified offer when SKU matches exactly and price is positive", () => {
    const result = parseWaveshareProductPage(PAGE("10177", 34.99), "10177", WAVESHARE_URL);
    expect(result).not.toBeNull();
    expect(result!.supplierSku).toBe("10177");
    expect(result!.manufacturerPartNumber).toBe("OTS-24(28)-1.27-04");
    expect(result!.brand).toBe("Enplas");
    expect(result!.currency).toBe("USD");
    expect(result!.unitPriceMinor).toBe(3499);
    expect(result!.availability).toBe("in_stock");
    expect(result!.condition).toBe("new");
    expect(result!.productUrl).toBe(WAVESHARE_URL);
  });

  it("rejects when the page SKU does not match the expected SKU", () => {
    expect(parseWaveshareProductPage(PAGE("99999", 34.99), "10177", WAVESHARE_URL)).toBeNull();
  });

  it("rejects a non-positive price", () => {
    expect(parseWaveshareProductPage(PAGE("10177", 0), "10177", WAVESHARE_URL)).toBeNull();
    expect(parseWaveshareProductPage(PAGE("10177", 0.0), "10177", WAVESHARE_URL)).toBeNull();
  });

  it("rejects a missing price field", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","sku":"10177","offers":{"@type":"Offer","priceCurrency":"USD"}}</script>`;
    expect(parseWaveshareProductPage(html, "10177", WAVESHARE_URL)).toBeNull();
  });

  it("rejects an invalid currency", () => {
    const html = `<script type="application/ld+json">{"@type":"Product","sku":"10177","offers":{"@type":"Offer","priceCurrency":"US","price":34.99}}</script>`;
    expect(parseWaveshareProductPage(html, "10177", WAVESHARE_URL)).toBeNull();
  });

  it("rejects a non-Waveshare URL even when content matches", () => {
    expect(parseWaveshareProductPage(PAGE("10177", 34.99), "10177", "https://evil.example/product.htm")).toBeNull();
  });

  it("rejects a page with no structured data", () => {
    expect(parseWaveshareProductPage("<html><body>nothing</body></html>", "10177", WAVESHARE_URL)).toBeNull();
  });

  it("records out-of-stock availability rather than inventing stock", () => {
    const page = PAGE("10177", 34.99, "USD", "https://schema.org/OutOfStock");
    expect(parseWaveshareProductPage(page, "10177", WAVESHARE_URL)!.availability).toBe("out_of_stock");
  });
});