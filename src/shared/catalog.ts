import type { OfferAvailability, OfferCondition, OfferFreshnessLabel, OfferRiskLabel, PriceBreak } from "./offer";

export type PartCategory = "actuator" | "hand" | "sensor" | "compute" | "driver" | "reducer";
export type Region = "US" | "EU" | "CN" | "JP" | "KR" | "Global";

export type PricePoint = { date: string; price: number };
export type CatalogOffer = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierRegion: string | null;
  price: number;
  stock: number;
  leadDays: number;
  moq: number;
  currency?: string;
  condition?: OfferCondition;
  availability?: OfferAvailability;
  priceBreaks?: PriceBreak[];
  reliabilityScore?: number | null;
  riskLabel?: OfferRiskLabel;
  freshnessLabel?: OfferFreshnessLabel;
  observedAt: string;
  isDemo: boolean;
};

export type CatalogPart = {
  id: string;
  slug: string;
  category: PartCategory;
  name: string;
  maker: string;
  makerCountry: string;
  region: Region;
  blurb: string;
  tags: string[];
  openSource: boolean;
  datasheetUrl?: string;
  cadAvailable: boolean;
  rosSupport: "native" | "community" | "none";
  warrantyMonths: number;
  priceHistory: PricePoint[];
  offers: CatalogOffer[];
  failures: number;
  compatibility: string[];
  provenanceLabel: string;
  freshnessAt: string | null;
  isDemo: boolean;
  [spec: string]: unknown;
};

export type Actuator = CatalogPart & {
  category: "actuator";
  peakNm: number;
  contNm: number;
  speedRpm: number;
  voltageV: number;
  weightKg: number;
  torqueDensity: number;
  backlashArcmin: number;
  encoderType: string;
  protocol: string;
  thermalLimitC: number;
  dutyCyclePct: number;
};

export type Hand = CatalogPart & {
  category: "hand";
  dof: number;
  actuatedDof: number;
  payloadKg: number;
  gripForceN: number;
  tactile: boolean;
  weightKg: number;
  interface: string;
  sdk: string;
  fingerReplaceCostUsd: number;
};

export type Sensor = CatalogPart & {
  category: "sensor";
  type: "depth" | "lidar" | "imu" | "tactile" | "rgb";
  rangeM: number;
  fovDeg: number;
  hz: number;
  resolution: string;
  weightKg: number;
  interface: string;
};

export type Compute = CatalogPart & {
  category: "compute";
  tops: number;
  ramGb: number;
  storageGb: number;
  ports: string;
  powerW: number;
  weightKg: number;
};

export type Driver = CatalogPart & {
  category: "driver";
  maxCurrentA: number;
  voltageV: number;
  protocols: string[];
  weightKg: number;
};

export type Reducer = CatalogPart & {
  category: "reducer";
  ratio: number;
  ratedTorqueNm: number;
  peakTorqueNm: number;
  backlashArcmin: number;
  weightKg: number;
  type: "harmonic" | "cycloidal" | "planetary";
};

export type Part = Actuator | Hand | Sensor | Compute | Driver | Reducer;

export const categoryLabel: Record<PartCategory, string> = {
  actuator: "Actuators",
  hand: "Hands & grippers",
  sensor: "Sensors",
  compute: "Compute",
  driver: "Motor drivers",
  reducer: "Reducers",
};

export function lowestPrice(part: Pick<CatalogPart, "offers">): number {
  if (part.offers.length === 0) return 0;
  return Math.min(...part.offers.map((offer) => offer.price));
}

export function priceDelta30(part: Pick<CatalogPart, "priceHistory">): number {
  const points = part.priceHistory;
  if (points.length < 2) return 0;
  const previous = points.at(-2)?.price ?? 0;
  const latest = points.at(-1)?.price ?? 0;
  return previous === 0 ? 0 : ((latest - previous) / previous) * 100;
}

export type SupplierSummary = {
  id: string;
  slug: string;
  name: string;
  website: string;
  region: string;
  categories: string[];
  moq: number;
  leadDays: number;
  verified: boolean;
  claimed: boolean;
  warranty: string;
  docScore: number;
  interfaces: string[];
  reviews: { rating: number; count: number };
  notes?: string;
  knownOfferCount: number;
  knownComponentCount: number;
  freshnessAt: string | null;
  isDemo: boolean;
};
