import { describe, expect, it } from "vitest";
import { toDigiKeyCandidate, uniqueDigiKeyCandidates } from "../../scripts/bom-pricing-candidates";

describe("BOM pricing candidate classification", () => {
  it("strips a three-digit supplier prefix without treating it as proof", () => {
    expect(toDigiKeyCandidate("647-UPM1J121MHD6TO")).toEqual({
      originalMpn: "647-UPM1J121MHD6TO",
      queryMpn: "UPM1J121MHD6TO",
      kind: "digikey-prefixed",
      supplierPrefix: "647",
    });
  });

  it("keeps plausible manufacturer MPNs intact", () => {
    expect(toDigiKeyCandidate("ESP32-S3-WROOM-1-N16R8")).toEqual({
      originalMpn: "ESP32-S3-WROOM-1-N16R8",
      queryMpn: "ESP32-S3-WROOM-1-N16R8",
      kind: "manufacturer-mpn",
    });
    expect(toDigiKeyCandidate("B4B-XH-A(LF)(SN)")?.queryMpn).toBe("B4B-XH-A(LF)(SN)");
  });

  it("rejects catalog codes, standards, internal part numbers, numeric collisions, and prose", () => {
    expect(toDigiKeyCandidate("C91552")).toBeNull();
    expect(toDigiKeyCandidate("GB/T 70.1-2000")).toBeNull();
    expect(toDigiKeyCandidate("JB/T  8925-2008")).toBeNull();
    expect(toDigiKeyCandidate("ATOM-01-019")).toBeNull();
    expect(toDigiKeyCandidate("MMP.05.00.00.000")).toBeNull();
    expect(toDigiKeyCandidate("98")).toBeNull();
    expect(toDigiKeyCandidate("Header2.54mm 1*3P")).toBeNull();
    expect(toDigiKeyCandidate("紧固件")).toBeNull();
  });

  it("deduplicates case-insensitively and favors prefixed provenance", () => {
    expect(uniqueDigiKeyCandidates(["UPM1J121MHD6TO", "647-UPM1J121MHD6TO", "upm1j121mhd6to"]))
      .toEqual([{
        originalMpn: "647-UPM1J121MHD6TO",
        queryMpn: "UPM1J121MHD6TO",
        kind: "digikey-prefixed",
        supplierPrefix: "647",
      }]);
  });
});
