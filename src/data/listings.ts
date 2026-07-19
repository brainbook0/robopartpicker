import { partById } from "./parts";

export type ConditionGrade = "A" | "B" | "C" | "Untested" | "ForParts";

export type Listing = {
  id: string;
  partId: string;
  title: string;
  grade: ConditionGrade;
  runtimeHours: number | null;
  price: number;
  priceVsNewPct: number; // negative = cheaper
  sellerId: string;
  region: "US" | "EU" | "CN" | "JP" | "KR";
  postedDaysAgo: number;
  hasTestReport: boolean;
  hasVideo: boolean;
  returnsAccepted: boolean;
  escrowEligible: boolean;
  serialVerified: boolean;
  identityVerified: boolean;
  priorSales: number;
  testReport?: Record<string, string | number | boolean>;
  notes?: string;
};

export type Wanted = {
  id: string;
  partCategory: "actuator" | "hand" | "sensor" | "compute" | "driver" | "reducer";
  partName: string;
  qty: number;
  maxBudget: number;
  region: "US" | "EU" | "CN" | "JP" | "KR" | "Any";
  postedDaysAgo: number;
  buyer: string;
  notes?: string;
};

export const sellers: Record<string, { name: string; rating: number; sales: number; responseHr: number; disputePct: number }> = {
  "u-lab-cmu": { name: "cmu-manip-lab", rating: 4.8, sales: 23, responseHr: 4, disputePct: 0 },
  "u-anon-7741": { name: "anon-7741", rating: 4.1, sales: 5, responseHr: 18, disputePct: 0 },
  "u-shenzhen-resell": { name: "shenzhen-resell", rating: 4.4, sales: 142, responseHr: 6, disputePct: 1.2 },
  "u-tum-team": { name: "tum-bipedal", rating: 4.9, sales: 11, responseHr: 12, disputePct: 0 },
  "u-startup-clear": { name: "clearpath-surplus", rating: 4.7, sales: 88, responseHr: 5, disputePct: 0.4 },
  "u-anon-9920": { name: "anon-9920", rating: 3.6, sales: 2, responseHr: 36, disputePct: 12 },
};

export const listings: Listing[] = [
  {
    id: "l-1", partId: "a-cm-rmd-x8", title: "RMD-X8 Pro — 110hr lab use", grade: "A",
    runtimeHours: 110, price: 520, priceVsNewPct: -35, sellerId: "u-lab-cmu",
    region: "US", postedDaysAgo: 2, hasTestReport: true, hasVideo: true,
    returnsAccepted: true, escrowEligible: true, serialVerified: true, identityVerified: true, priorSales: 23,
    testReport: { noLoadSpin: "OK", peakCurrentA: 38, backlashArcmin: 4, thermalCAt60s: 71, encoderDrift: "OK" },
  },
  {
    id: "l-2", partId: "a-unitree-a1", title: "Unitree A1 motor — pulled from H1 demo unit", grade: "B",
    runtimeHours: 480, price: 199, priceVsNewPct: -43, sellerId: "u-shenzhen-resell",
    region: "CN", postedDaysAgo: 5, hasTestReport: true, hasVideo: true,
    returnsAccepted: false, escrowEligible: true, serialVerified: true, identityVerified: true, priorSales: 142,
    testReport: { noLoadSpin: "OK", peakCurrentA: 22, backlashArcmin: 8, thermalCAt60s: 84 },
  },
  {
    id: "l-3", partId: "h-inspire-rh56", title: "Inspire RH56DFX hand — left, fingers OK", grade: "B",
    runtimeHours: 220, price: 2100, priceVsNewPct: -34, sellerId: "u-tum-team",
    region: "EU", postedDaysAgo: 1, hasTestReport: true, hasVideo: true,
    returnsAccepted: true, escrowEligible: true, serialVerified: true, identityVerified: true, priorSales: 11,
    testReport: { openCloseCycles: 6500, gripForceN: 76, tactileCheck: false, sdkConnects: true },
  },
  {
    id: "l-4", partId: "c-jetson-orin-64", title: "Jetson AGX Orin 64GB — 30hr", grade: "A",
    runtimeHours: 30, price: 1650, priceVsNewPct: -17, sellerId: "u-startup-clear",
    region: "US", postedDaysAgo: 3, hasTestReport: true, hasVideo: false,
    returnsAccepted: true, escrowEligible: true, serialVerified: true, identityVerified: true, priorSales: 88,
    testReport: { bootProof: "OK", stressTest5min: "OK", portsOK: "USB3 x4 / GbE / PCIe", thermalThrottle: false },
  },
  {
    id: "l-5", partId: "a-anyrotor-knee48", title: "AnyRotor K48 — untested, as-is", grade: "Untested",
    runtimeHours: null, price: 99, priceVsNewPct: -59, sellerId: "u-anon-9920",
    region: "CN", postedDaysAgo: 14, hasTestReport: false, hasVideo: false,
    returnsAccepted: false, escrowEligible: false, serialVerified: false, identityVerified: false, priorSales: 2,
    notes: "Seller flagged for dispute history. Buyer protection not available.",
  },
  {
    id: "l-6", partId: "a-mjbots-moteus-n1", title: "moteus n1 — 5 units, near-new", grade: "A",
    runtimeHours: 14, price: 440, priceVsNewPct: -26, sellerId: "u-lab-cmu",
    region: "US", postedDaysAgo: 7, hasTestReport: true, hasVideo: true,
    returnsAccepted: true, escrowEligible: true, serialVerified: true, identityVerified: true, priorSales: 23,
    testReport: { noLoadSpin: "OK", peakCurrentA: 19, backlashArcmin: 6, thermalCAt60s: 62 },
  },
  {
    id: "l-7", partId: "se-rs-d455", title: "RealSense D455 — 4 units bulk", grade: "B",
    runtimeHours: 200, price: 240, priceVsNewPct: -43, sellerId: "u-startup-clear",
    region: "US", postedDaysAgo: 4, hasTestReport: true, hasVideo: false,
    returnsAccepted: true, escrowEligible: true, serialVerified: true, identityVerified: true, priorSales: 88,
    testReport: { rgbOK: true, depthOK: true, imuOK: true, usbStable: true },
  },
  {
    id: "l-8", partId: "r-leader-lhd-25", title: "LHD-25 reducer — for parts (cracked flexspline)", grade: "ForParts",
    runtimeHours: null, price: 60, priceVsNewPct: -85, sellerId: "u-anon-7741",
    region: "EU", postedDaysAgo: 21, hasTestReport: false, hasVideo: true,
    returnsAccepted: false, escrowEligible: false, serialVerified: false, identityVerified: true, priorSales: 5,
    notes: "Flexspline visibly cracked. Housing and wave generator OK.",
  },
];

export const wanted: Wanted[] = [
  { id: "w-1", partCategory: "actuator", partName: "RMD-X8 Pro or equivalent", qty: 12, maxBudget: 6000, region: "US", postedDaysAgo: 2, buyer: "biped-lab-mit", notes: "For knee + hip set. Need test reports." },
  { id: "w-2", partCategory: "hand", partName: "Allegro Hand v4 (used)", qty: 1, maxBudget: 9000, region: "Any", postedDaysAgo: 6, buyer: "thesis-grad-2026" },
  { id: "w-3", partCategory: "reducer", partName: "Harmonic CSD-25 100:1", qty: 6, maxBudget: 5400, region: "EU", postedDaysAgo: 9, buyer: "munich-humanoid" },
  { id: "w-4", partCategory: "compute", partName: "Jetson AGX Orin 64GB", qty: 2, maxBudget: 3000, region: "US", postedDaysAgo: 1, buyer: "startup-stealth" },
  { id: "w-5", partCategory: "sensor", partName: "Livox Mid-360", qty: 1, maxBudget: 700, region: "EU", postedDaysAgo: 11, buyer: "anon-buyer-2199" },
  { id: "w-6", partCategory: "actuator", partName: "Maxon EC 90 Flat", qty: 4, maxBudget: 3000, region: "EU", postedDaysAgo: 4, buyer: "exo-team-zurich" },
];

export const listingsByPart = (partId: string) => listings.filter(l => l.partId === partId);
export const listingById = (id: string) => listings.find(l => l.id === id);
export const enrichedListing = (l: Listing) => ({ ...l, part: partById(l.partId)!, seller: sellers[l.sellerId] });
