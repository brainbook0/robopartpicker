export type ShippingEstimateInput = {
  countryCode: string;
  region: string;
  shipmentCount: number;
  items: Array<{ quantity: number; weightGrams: number | null; category: string }>;
};

export type PreliminaryShippingEstimate = {
  amountMinor: number;
  currency: "USD";
  confidence: "high" | "medium" | "low";
  methodVersion: "preliminary-shipping-v1";
  estimatedWeightGrams: number;
  shipmentCount: number;
  deliveryDays: [number, number];
  dutiesTaxIncluded: false;
  disclaimer: string;
};

const DEFAULT_WEIGHT_GRAMS: Record<string, number> = {
  actuator: 1200,
  hand: 900,
  sensor: 300,
  compute: 450,
  driver: 350,
  reducer: 1100,
  fabricated: 500,
  other: 750,
};

const ZONES = {
  CA: { baseMinor: 1595, perKgMinor: 180, deliveryDays: [3, 8] as [number, number] },
  US: { baseMinor: 2195, perKgMinor: 300, deliveryDays: [4, 10] as [number, number] },
  INTERNATIONAL: { baseMinor: 4995, perKgMinor: 650, deliveryDays: [8, 21] as [number, number] },
};

export function estimatePreliminaryShipping(input: ShippingEstimateInput): PreliminaryShippingEstimate {
  if (!Number.isInteger(input.shipmentCount) || input.shipmentCount < 1) throw new Error("Shipping estimate requires a positive shipment count.");
  if (!input.items.length) throw new Error("Shipping estimate requires at least one item.");

  let estimatedWeightGrams = 0;
  let knownWeightUnits = 0;
  let totalUnits = 0;
  for (const item of input.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Every shipping item requires a positive quantity.");
    if (item.weightGrams != null && (!Number.isFinite(item.weightGrams) || item.weightGrams < 0)) throw new Error("Shipping item weights must be non-negative weight values.");
    const quantity = item.quantity;
    const weight = item.weightGrams ?? DEFAULT_WEIGHT_GRAMS[item.category.toLowerCase()] ?? DEFAULT_WEIGHT_GRAMS.other;
    estimatedWeightGrams += Math.ceil(weight * quantity);
    totalUnits += quantity;
    if (item.weightGrams != null) knownWeightUnits += quantity;
  }

  const country = input.countryCode.trim().toUpperCase();
  const zone = country === "CA" ? ZONES.CA : country === "US" ? ZONES.US : ZONES.INTERNATIONAL;
  const billedKilograms = Math.max(1, Math.ceil(estimatedWeightGrams / 1000));
  const additionalShipmentHandling = (input.shipmentCount - 1) * 250;
  const coverage = totalUnits > 0 ? knownWeightUnits / totalUnits : 0;
  const confidence = coverage === 1 ? "high" : coverage >= 0.75 ? "medium" : "low";

  return {
    amountMinor: zone.baseMinor + billedKilograms * zone.perKgMinor + additionalShipmentHandling,
    currency: "USD",
    confidence,
    methodVersion: "preliminary-shipping-v1",
    estimatedWeightGrams,
    shipmentCount: input.shipmentCount,
    deliveryDays: zone.deliveryDays,
    dutiesTaxIncluded: false,
    disclaimer: "Preliminary shipping estimate for human review. Carrier charges may change; duties and taxes are excluded.",
  };
}
