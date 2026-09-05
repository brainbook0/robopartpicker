import type { OfferAvailability, OfferCondition, OfferFreshnessLabel, OfferRiskLabel, PriceBreak } from "./offer";

export type RoboticsPartCategory = "actuator" | "hand" | "sensor" | "compute" | "driver" | "reducer";
export type PartCategory = string;
export type Region = "US" | "EU" | "CN" | "JP" | "KR" | "Global";

export type PricePoint = { date: string; price: number };
export type CatalogPartFile = {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  purpose: "image" | "datasheet" | "cad" | "drawing" | "firmware" | "document" | "other";
  contentUrl: string;
};
export type CatalogPartUsage = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  bomId: string;
  bomSlug: string | null;
  bomItemId: string;
  quantity: number;
  unit: string;
  evidenceLocator: string | null;
  notes: string | null;
};
export type CatalogPartEvidence = {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  confidence: number;
  retrievedAt: string;
};
export type CatalogPartProfile = {
  identity: "exact" | "partial" | "unresolved";
  technicalSpecCount: number;
  imageCount: number;
  engineeringFileCount: number;
  projectUsageCount: number;
  evidenceCount: number;
  missing: string[];
};
export type CatalogTechnicalSpecification = {
  key: string;
  label: string;
  value: unknown;
  unit: string | null;
};
export type CatalogOffer = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierRegion: string | null;
  price: number;
  stock: number;
  stockKnown?: boolean;
  leadDays: number;
  leadKnown?: boolean;
  moq: number;
  currency?: string;
  /** Supplier SKU for this offer, when the source feed records one. */
  supplierSku?: string;
  /** Authentic product page URL for this offer, when one was observed. */
  productUrl?: string;
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
  /** Component category. Live catalogs span many more categories than the six
   *  robotics fixture categories, so this is a data-driven string rather than a
   *  closed union. The robotics-specific spec types below still narrow it. */
  category: string;
  name: string;
  /** Manufacturer part number, when the source record provides one. */
  mpn?: string;
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
  lifecycleStatus?: "active" | "limited" | "obsolete" | "prototype" | "unknown";
  sourceUrl?: string;
  manufacturerUrl?: string;
  freshnessAt: string | null;
  isDemo: boolean;
  files?: CatalogPartFile[];
  projectUsage?: CatalogPartUsage[];
  evidence?: CatalogPartEvidence[];
  profile?: CatalogPartProfile;
  technicalSpecifications?: CatalogTechnicalSpecification[];
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

export const categoryLabel: Record<string, string> = {
  actuator: "Actuators",
  hand: "Hands & grippers",
  sensor: "Sensors",
  compute: "Compute",
  driver: "Motor drivers",
  reducer: "Reducers",
};

export function lowestObservedPrice(part: Pick<CatalogPart, "offers">): number | null {
  const prices = part.offers
    .filter((offer) => !offer.isDemo && offer.price > 0)
    .map((offer) => offer.price);
  return prices.length ? Math.min(...prices) : null;
}

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
