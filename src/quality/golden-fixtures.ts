// Golden project fixtures for the semantic regression suite.
// A = clean (near-complete), B = messy (partial), C = user derivative.

import type { SourcingOffer } from "@/shared/offer";
import type { SourcingLineInput } from "@/shared/sourcing";

export type GoldenBomRow = {
  name: string;
  quantity?: number;
  manufacturer?: string;
  mpn?: string;
  fabricated?: boolean;
  optional?: boolean;
};

export const goldenA = {
  id: "project:golden-a",
  slug: "golden-a",
  name: "Golden A",
  version: "1.0.0",
  license: "Apache-2.0",
  maintainer: "A Maintainer",
  repoUrl: "https://github.com/example/golden-a",
  revision: "abc123",
  bom: [
    { name: "NEMA 17 stepper motor", quantity: 4, manufacturer: "StepperOnline", mpn: "17HS19-2004S1" },
    { name: "Lead screw TR8x8", quantity: 2, manufacturer: "Generic", mpn: "TR8X8-500" },
    { name: "Controller board", quantity: 1, manufacturer: "Duet", mpn: "Duet3-6HC" },
  ] satisfies GoldenBomRow[],
};

export const goldenB = {
  id: "project:golden-b",
  slug: "golden-b",
  name: "Golden B",
  version: "0.3.0",
  license: "MIT",
  maintainer: "B Maintainer",
  bom: [
    { name: "Motor mentioned in README" },
    { name: "Mystery bracket", quantity: 2 },
    { name: "Servo", quantity: 2, manufacturer: "TowerPro" },
  ] satisfies GoldenBomRow[],
};

export const goldenC = {
  id: "project:golden-c",
  slug: "golden-c",
  name: "Golden C",
  version: "0.1.0",
  upstreamProjectId: "project:golden-a",
  upstreamRevision: "1.0.0",
  changeSummary: "Swapped motors, added a fabricated wrist",
  bom: [
    { name: "3D printed wrist link", quantity: 1, fabricated: true },
    { name: "NEMA 23 stepper motor", quantity: 2, manufacturer: "StepperOnline", mpn: "23HS30-2804S" },
  ] satisfies GoldenBomRow[],
};

export const goldenAOffers: SourcingOffer[] = [
  { id: "o1", supplierId: "s1", supplierName: "Supplier One", componentId: "component:motor", region: "US", currency: "USD", unitPriceMinor: 1250, minimumQuantity: 1, stockQuantity: 20, leadTimeDays: 5, availability: "in_stock", condition: "new", priceBreaks: [], reliabilityScore: 0.9, riskLabel: "exact", freshnessLabel: "fresh", observedAt: "2026-08-13T00:00:00.000Z", isDemo: false },
  { id: "o2", supplierId: "s1", supplierName: "Supplier One", componentId: "component:screw", region: "US", currency: "USD", unitPriceMinor: 800, minimumQuantity: 1, stockQuantity: 50, leadTimeDays: 3, availability: "in_stock", condition: "new", priceBreaks: [], reliabilityScore: 0.9, riskLabel: "exact", freshnessLabel: "recent", observedAt: "2026-08-10T00:00:00.000Z", isDemo: false },
  { id: "o3", supplierId: "s2", supplierName: "Supplier Two", componentId: "component:board", region: "EU", currency: "USD", unitPriceMinor: 21000, minimumQuantity: 1, stockQuantity: 8, leadTimeDays: 10, availability: "in_stock", condition: "new", priceBreaks: [], reliabilityScore: 0.85, riskLabel: "exact", freshnessLabel: "fresh", observedAt: "2026-08-12T00:00:00.000Z", isDemo: false },
];

export const goldenALines: SourcingLineInput[] = [
  { id: "line-1", componentId: "component:motor", name: "NEMA 17 stepper motor", quantity: 4, fabricated: false, optional: false, mpn: "17HS19-2004S1" },
  { id: "line-2", componentId: "component:screw", name: "Lead screw TR8x8", quantity: 2, fabricated: false, optional: false, mpn: "TR8X8-500" },
  { id: "line-3", componentId: "component:board", name: "Controller board", quantity: 1, fabricated: false, optional: false, mpn: "Duet3-6HC" },
];
