import { describe, expect, it } from "vitest";
import {
  findExactDigiKeyProductLinks,
  normalizeDigiKeyMpn,
  parseDigiKeyProductMarkdown,
} from "../../scripts/digikey-product-parser";

// Minimal extraction from /root/.jcode/scratch/digikey-upm.md. The test is
// intentionally self-contained so it does not depend on scratch files at runtime.
const DIGIKEY_UPM_FIXTURE = `Title: UPM1J121MHD6TO | DigiKey Electronics

URL Source: http://www.digikey.com/en/products/result?keywords=UPM1J121MHD6TO

Markdown Content:

7.   [Nichicon UPM1J121MHD6TO](http://www.digikey.com/en/products/detail/nichicon/UPM1J121MHD6TO/3130263)

| # UPM1J121MHD6TO |
| --- |
| DigiKey Part Number | 493-5258-1-ND - Cut Tape (CT) 493-5258-3-ND - Tape & Box (TB) |
| Manufacturer | [Nichicon](http://www.digikey.com/en/supplier-centers/nichicon) |
| Manufacturer Product Number | UPM1J121MHD6TO |
| Description | CAP ALUM 120UF 20% 63V RADIAL TH |
| Customer Reference |  |
| Detailed Description | 120 µF 63 V Aluminum Electrolytic Capacitors Radial, Can 5000 Hrs @ 105°C |
| Datasheet | [Datasheet](https://www.nichicon.co.jp/english/series_items/catalog_pdf/e-upm.pdf) |
| EDA/CAD Models | [UPM1J121MHD6TO Models](http://www.digikey.com/en/models/3130263) |

Substitutes (1)

Part Number

[UPJ1J121MHD6TO](http://www.digikey.com/en/products/detail/nichicon/UPJ1J121MHD6TO/3129400)

Manufacturer

Nichicon

Quantity Available

1,181

DigiKey Part Number

493-5063-1-ND

Unit Price

$1.14000

Substitute Type

Direct

In-Stock: 440

All prices are in USD

Cut Tape (CT)

| Quantity | Unit Price | Ext Price |
| --- | --- | --- |
| 1 | $1.39000 | $1.39 |
| 10 | $0.89400 | $8.94 |
| 50 | $0.68540 | $34.27 |
| 100 | $0.61960 | $61.96 |
|  |

Tape & Box (TB)

| Quantity | Unit Price | Ext Price |
| --- | --- | --- |
| 500 | $0.50622 | $253.11 |
| 1,000 | $0.47048 | $470.48 |
| 1,500 | $0.45245 | $678.68 |
| 2,500 | $0.43236 | $1,080.90 |
| 3,500 | $0.42054 | $1,471.89 |
| 5,000 | $0.40913 | $2,045.65 |
|  |`;

describe("parseDigiKeyProductMarkdown", () => {
  it("discovers only exact unique detail links for a required second fetch", () => {
    const searchPage = `
[Exact](https://www.digikey.com/en/products/detail/nichicon/UPM1J121MHD6TO/3130263?utm_source=test)
[Duplicate](http://www.digikey.com/en/products/detail/nichicon/UPM1J121MHD6TO/3130263#stock)
[Longer mismatch](https://www.digikey.com/en/products/detail/nichicon/UPM1J121MHD6TO-A/999)
[Substitute mismatch](https://www.digikey.com/en/products/detail/nichicon/UPJ1J121MHD6TO/3129400)
[Untrusted](https://example.com/en/products/detail/nichicon/UPM1J121MHD6TO/3130263)`;

    expect(findExactDigiKeyProductLinks(searchPage, "UPM1J121MHD6TO")).toEqual([
      "https://www.digikey.com/en/products/detail/nichicon/UPM1J121MHD6TO/3130263",
    ]);
    expect(findExactDigiKeyProductLinks(searchPage, "UPJ1J121MHD6TO")).toEqual([
      "https://www.digikey.com/en/products/detail/nichicon/UPJ1J121MHD6TO/3129400",
    ]);
  });

  it("parses the exact product, stock, quantity-one price, and all price breaks", () => {
    const product = parseDigiKeyProductMarkdown(
      DIGIKEY_UPM_FIXTURE,
      "UPM1J121MHD6TO",
    );

    expect(product).toEqual({
      manufacturerProductNumber: "UPM1J121MHD6TO",
      manufacturer: "Nichicon",
      description: "CAP ALUM 120UF 20% 63V RADIAL TH",
      productUrl: "https://www.digikey.com/en/products/detail/nichicon/UPM1J121MHD6TO/3130263",
      digiKeyPartNumber: "493-5258-1-ND",
      inStockQuantity: 440,
      lowestQuantityOnePriceUsd: 1.39,
      priceBreaks: [
        { packaging: "Cut Tape (CT)", quantity: 1, unitPriceUsd: 1.39, extendedPriceUsd: 1.39 },
        { packaging: "Cut Tape (CT)", quantity: 10, unitPriceUsd: 0.894, extendedPriceUsd: 8.94 },
        { packaging: "Cut Tape (CT)", quantity: 50, unitPriceUsd: 0.6854, extendedPriceUsd: 34.27 },
        { packaging: "Cut Tape (CT)", quantity: 100, unitPriceUsd: 0.6196, extendedPriceUsd: 61.96 },
        { packaging: "Tape & Box (TB)", quantity: 500, unitPriceUsd: 0.50622, extendedPriceUsd: 253.11 },
        { packaging: "Tape & Box (TB)", quantity: 1000, unitPriceUsd: 0.47048, extendedPriceUsd: 470.48 },
        { packaging: "Tape & Box (TB)", quantity: 1500, unitPriceUsd: 0.45245, extendedPriceUsd: 678.68 },
        { packaging: "Tape & Box (TB)", quantity: 2500, unitPriceUsd: 0.43236, extendedPriceUsd: 1080.9 },
        { packaging: "Tape & Box (TB)", quantity: 3500, unitPriceUsd: 0.42054, extendedPriceUsd: 1471.89 },
        { packaging: "Tape & Box (TB)", quantity: 5000, unitPriceUsd: 0.40913, extendedPriceUsd: 2045.65 },
      ],
    });
  });

  it("uses conservative normalization but preserves punctuation distinctions", () => {
    expect(normalizeDigiKeyMpn("  upm1j121mhd6to\u200b ")).toBe("UPM1J121MHD6TO");
    expect(parseDigiKeyProductMarkdown(DIGIKEY_UPM_FIXTURE, "  upm1j121mhd6to ")).not.toBeNull();
    expect(parseDigiKeyProductMarkdown(DIGIKEY_UPM_FIXTURE, "UPM-1J121MHD6TO")).toBeNull();
  });

  it("selects the lowest USD unit price among quantity-one breaks", () => {
    const withAnotherQuantityOneBreak = DIGIKEY_UPM_FIXTURE.replace(
      "\nTape & Box (TB)\n\n| Quantity | Unit Price | Ext Price |",
      `\nTray\n\n| Quantity | Unit Price | Ext Price |\n| --- | --- | --- |\n| 1 | $1.25000 | $1.25 |\n|  |\n\nTape & Box (TB)\n\n| Quantity | Unit Price | Ext Price |`,
    );

    expect(
      parseDigiKeyProductMarkdown(withAnotherQuantityOneBreak, "UPM1J121MHD6TO")
        ?.lowestQuantityOnePriceUsd,
    ).toBe(1.25);
  });

  it("rejects no-result and mismatched pages", () => {
    expect(parseDigiKeyProductMarkdown("No results found for that keyword.", "ABC-123")).toBeNull();
    expect(parseDigiKeyProductMarkdown(DIGIKEY_UPM_FIXTURE, "UPJ1J121MHD6TO")).toBeNull();
  });

  it("rejects pages containing multiple canonical product tables", () => {
    const secondProduct = DIGIKEY_UPM_FIXTURE.replaceAll(
      "UPM1J121MHD6TO",
      "UPM1J101MHD6TO",
    ).replaceAll("3130263", "3130262");

    expect(
      parseDigiKeyProductMarkdown(
        `${DIGIKEY_UPM_FIXTURE}\n\n${secondProduct}`,
        "UPM1J121MHD6TO",
      ),
    ).toBeNull();
  });

  it("rejects substitute-only pages even when the substitute MPN matches", () => {
    const substituteOnly = `Substitutes (1)

Part Number

[UPJ1J121MHD6TO](http://www.digikey.com/en/products/detail/nichicon/UPJ1J121MHD6TO/3129400)

Manufacturer

Nichicon

Quantity Available

1,181

DigiKey Part Number

493-5063-1-ND

Unit Price

$1.14000

In-Stock: 1,181`;

    expect(parseDigiKeyProductMarkdown(substituteOnly, "UPJ1J121MHD6TO")).toBeNull();
  });

  it("rejects numeric-only candidate MPNs", () => {
    const numericProduct = DIGIKEY_UPM_FIXTURE.replaceAll("UPM1J121MHD6TO", "123456");
    expect(parseDigiKeyProductMarkdown(numericProduct, "123456")).toBeNull();
  });
});
