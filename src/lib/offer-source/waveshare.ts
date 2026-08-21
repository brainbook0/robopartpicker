import type { OfferAvailability } from "../../shared/offer";
import {
  normalizePartToken,
  type ComponentIdentity,
  type OfferObservation,
  type OfferRejectionReason,
  type OfferSourceAdapter,
  type OfferSourceOutcome,
} from "./types";

const WAVESHARE_HOST = "www.waveshare.com";
const WAVESHARE_REGION = "US";

/** Waveshare publishes one required SKU per product; offer condition is new. */
export const WAVESHARE_SUPPLIER = {
  supplierSlug: "waveshare",
  supplierName: "Waveshare",
  websiteUrl: "https://www.waveshare.com",
} as const;

type JsonLdProduct = {
  "@type"?: string | string[];
  sku?: unknown;
  mpn?: unknown;
  name?: unknown;
  brand?: unknown;
  offers?: unknown;
};

function coerceType(typeValue: unknown): string | null {
  if (typeof typeValue === "string") return typeValue;
  if (Array.isArray(typeValue)) return typeValue.find((v): v is string => typeof v === "string") ?? null;
  return null;
}

function isProductNode(node: unknown): node is JsonLdProduct {
  if (!node || typeof node !== "object") return false;
  const candidate = node as JsonLdProduct;
  return coerceType(candidate["@type"]) === "Product";
}

/**
 * Collect schema.org Product nodes from a page's JSON-LD blocks, following the
 * common `@graph` container shape used by storefront CMSes.
 */
export function extractJsonLdProducts(html: string): JsonLdProduct[] {
  const products: JsonLdProduct[] = [];
  const scriptPattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const nodes: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (isProductNode(node)) {
        products.push(node);
        continue;
      }
      const graph = (node as { "@graph"?: unknown })["@graph"];
      if (node && typeof node === "object" && Array.isArray(graph)) {
        for (const graphNode of graph as unknown[]) {
          if (isProductNode(graphNode)) products.push(graphNode);
        }
      }
    }
  }
  return products;
}

function brandName(brand: unknown): string | null {
  if (!brand) return null;
  if (typeof brand === "string") return brand.trim() || null;
  if (typeof brand === "object") {
    return (brand as { name?: unknown }).name?.toString().trim() || null;
  }
  return null;
}

function mapAvailability(raw: unknown): OfferAvailability {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("outofstock")) return "out_of_stock";
  if (value.includes("preorder")) return "preorder";
  if (value.includes("backorder")) return "backorder";
  if (value.includes("limited")) return "limited";
  if (value.includes("instock")) return "in_stock";
  return "unknown";
}

type ExtractedOffer = {
  priceMinor: number;
  currency: string;
  availability: OfferAvailability;
};

function extractOffer(offers: unknown): { offer: ExtractedOffer } | { reason: OfferRejectionReason } {
  const candidates: unknown[] = [];
  if (Array.isArray(offers)) candidates.push(...offers);
  else candidates.push(offers);

  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const offer = raw as Record<string, unknown>;
    const currency = String(offer.priceCurrency ?? "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;

    const price = Number(offer.price);
    if (!Number.isFinite(price)) continue;
    if (price <= 0) continue;

    return {
      offer: {
        priceMinor: Math.round((price + Number.EPSILON) * 100),
        currency,
        availability: mapAvailability(offer.availability),
      },
    };
  }

  // Distinguish "no price at all" from "only non-positive prices" for reporting.
  if (
    Array.isArray(offers) ? offers.length === 0 : !offers
  ) {
    return { reason: "missing-price" };
  }
  return { reason: "non-positive-price" };
}

/**
 * Parse a Waveshare product page and verify it describes exactly the expected
 * SKU. Returns a single offer observation only when the page publishes a
 * matching SKU and a positive price; every other state is an explicit,
 * reason-bearing rejection so nothing is ever guessed.
 */
export function parseWaveshareProductPage(
  html: string,
  expectedSku: string,
  productUrl: string,
): Omit<OfferObservation, "observedAt" | "sourceSha256" | "supplierSlug" | "supplierName" | "regionCode"> | null {
  let url: URL;
  try {
    url = new URL(productUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== WAVESHARE_HOST) return null;

  const products = extractJsonLdProducts(html);
  if (products.length === 0) return null;

  const expected = normalizePartToken(expectedSku);
  if (!expected) return null;

  const product = products[0];
  const sku = normalizePartToken(product.sku);
  if (!sku) return null;
  if (sku !== expected) return null;

  const extracted = extractOffer(product.offers);
  if ("reason" in extracted) return null;

  return {
    supplierSku: String(product.sku).trim(),
    manufacturerPartNumber: product.mpn != null ? String(product.mpn).trim() || null : null,
    brand: brandName(product.brand),
    productName: product.name != null ? String(product.name).trim() : null,
    productUrl: url.toString(),
    currency: extracted.offer.currency,
    unitPriceMinor: extracted.offer.priceMinor,
    minimumQuantity: 1,
    availability: extracted.offer.availability,
    condition: "new",
  };
}

/** A source adapter that resolves a component to its Waveshare offer. */
export function createWaveshareSource(): OfferSourceAdapter {
  return {
    supplierSlug: WAVESHARE_SUPPLIER.supplierSlug,
    supplierName: WAVESHARE_SUPPLIER.supplierName,
    regionCode: WAVESHARE_REGION,
    async match(identity: ComponentIdentity): Promise<OfferSourceOutcome> {
      const productUrl = identity.sourceUrl;
      if (!productUrl) {
        return { status: "rejected", reason: "invalid-url" };
      }

      let html: string;
      try {
        const response = await fetch(productUrl, {
          headers: { "User-Agent": "RoboPartPicker/0.7 (+robopartpicker)" },
        });
        if (!response.ok) return { status: "rejected", reason: "unreachable", detail: `HTTP ${response.status}` };
        html = await response.text();
      } catch (error) {
        return { status: "rejected", reason: "unreachable", detail: String(error) };
      }

      const parsed = parseWaveshareProductPage(html, identity.manufacturerPartNumber, productUrl);
      if (!parsed) {
        const products = extractJsonLdProducts(html);
        if (products.length === 0) return { status: "rejected", reason: "no-structured-data" };
        const sku = normalizePartToken(products[0].sku);
        if (!sku) return { status: "rejected", reason: "missing-sku" };
        if (sku !== normalizePartToken(identity.manufacturerPartNumber)) {
          return { status: "rejected", reason: "sku-mismatch", detail: `page sku=${sku} expected=${normalizePartToken(identity.manufacturerPartNumber)}` };
        }
        return { status: "rejected", reason: extractOfferRejection(products[0].offers) };
      }

      return {
        status: "matched",
        observation: {
          ...WAVESHARE_SUPPLIER,
          ...parsed,
          regionCode: WAVESHARE_REGION,
          observedAt: new Date().toISOString(),
          sourceSha256: await sha256(html),
        },
      };
    },
  };
}

function extractOfferRejection(offers: unknown): OfferRejectionReason {
  const extracted = extractOffer(offers);
  return "reason" in extracted ? extracted.reason : "missing-price";
}

async function sha256(value: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}