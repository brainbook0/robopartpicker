import { describe, expect, it } from "vitest";
import { commercialHumanoidMarketMediaIdentity, commercialMediaIdentity, requiredOfficialGalleryScreenshots } from "./commercial-media";

describe("commercial managed media identity", () => {
  it("creates deterministic safe file IDs and R2 keys", () => {
    const first = commercialMediaIdentity("unitree-robotics-g1");
    const second = commercialMediaIdentity("unitree-robotics-g1");
    expect(first).toEqual(second);
    expect(first.fileId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(first.objectKey).toBe("commercial-catalog/top-300/unitree-robotics-g1/cover.webp");
    expect(first.contentUrl).toBe(`/api/v1/files/content?id=${encodeURIComponent(first.fileId)}`);
  });

  it("creates distinct stable gallery identities while retaining the canonical cover", () => {
    expect(commercialMediaIdentity("unitree-robotics-g1", 0).objectKey).toBe("commercial-catalog/top-300/unitree-robotics-g1/cover.webp");
    const second = commercialMediaIdentity("unitree-robotics-g1", 1);
    const third = commercialMediaIdentity("unitree-robotics-g1", 2);
    expect(second.objectKey).toBe("commercial-catalog/top-300/unitree-robotics-g1/gallery-01.webp");
    expect(third.objectKey).toBe("commercial-catalog/top-300/unitree-robotics-g1/gallery-02.webp");
    expect(new Set([commercialMediaIdentity("unitree-robotics-g1", 0).fileId, second.fileId, third.fileId]).size).toBe(3);
  });

  it("keeps humanoid market media in a collision-free namespace", () => {
    const market = commercialHumanoidMarketMediaIdentity("unitree-r1");
    const ranked = commercialMediaIdentity("unitree-r1");
    expect(market.objectKey).toBe("commercial-catalog/humanoid-market-2026-08/unitree-r1/cover.webp");
    expect(market.fileId).not.toBe(ranked.fileId);
  });

  it("requires enough official-page screenshots to reach three gallery images", () => {
    expect(requiredOfficialGalleryScreenshots(1)).toBe(2);
    expect(requiredOfficialGalleryScreenshots(2)).toBe(1);
    expect(requiredOfficialGalleryScreenshots(3)).toBe(0);
    expect(requiredOfficialGalleryScreenshots(8)).toBe(0);
  });
});
