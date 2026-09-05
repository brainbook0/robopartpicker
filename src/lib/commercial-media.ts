import { stableId } from "./physical-design-wave-import";

export type CommercialMediaIdentity = {
  fileId: string;
  objectKey: string;
  contentUrl: string;
};

export function commercialMediaIdentity(slug: string, index = 0): CommercialMediaIdentity {
  return mediaIdentity("commercial-catalog:top-300", "commercial-catalog/top-300", slug, index);
}

export function commercialHumanoidMarketMediaIdentity(slug: string, index = 0): CommercialMediaIdentity {
  return mediaIdentity("commercial-catalog:humanoid-market-2026-08", "commercial-catalog/humanoid-market-2026-08", slug, index);
}

function mediaIdentity(seedNamespace: string, objectKeyNamespace: string, slug: string, index: number): CommercialMediaIdentity {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new Error(`Invalid commercial profile slug: ${slug}`);
  if (!Number.isInteger(index) || index < 0 || index > 99) throw new Error(`Invalid commercial media index: ${index}`);
  const identity = index === 0 ? "cover-v1" : `gallery-${index}-v1`;
  const digest = stableId("seed", `${seedNamespace}:${slug}:${identity}`).split("_")[1];
  if (!/^[0-9a-f]{32}$/u.test(digest)) throw new Error("Stable ID digest is not 128-bit hexadecimal.");
  const variant = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  const fileId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20)}`;
  return {
    fileId,
    objectKey: `${objectKeyNamespace}/${slug}/${index === 0 ? "cover" : `gallery-${String(index).padStart(2, "0")}`}.webp`,
    contentUrl: `/api/v1/files/content?id=${encodeURIComponent(fileId)}`,
  };
}

export function requiredOfficialGalleryScreenshots(sourceImageCount: number): number {
  if (!Number.isInteger(sourceImageCount) || sourceImageCount < 0) throw new Error(`Invalid source image count: ${sourceImageCount}`);
  return Math.max(0, 3 - sourceImageCount);
}
