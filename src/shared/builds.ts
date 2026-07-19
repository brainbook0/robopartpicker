export type ResourceVisibility = "private" | "organization" | "unlisted" | "public";

export type BuildSummary = {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string | null;
  organization_id: string | null;
  source_project_id: string | null;
  visibility: ResourceVisibility;
  status: "planning" | "sourcing" | "building" | "testing" | "complete" | "paused" | "archived";
  progress_percent: number;
  currency: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type BuildOffer = {
  id: string;
  supplierId: string;
  supplierName: string;
  unitPriceMinor: number;
  currency: string;
  stockQuantity: number;
  leadTimeDays: number;
  minimumOrderQuantity: number;
  observedAt: string;
  isDemo: number;
};

export type BuildItem = {
  id: string;
  componentId: string | null;
  componentSlug: string | null;
  componentName: string | null;
  componentCategory: string | null;
  selectedSupplierOfferId: string | null;
  selectedSupplierName: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitCostMinor: number | null;
  status: string;
  substitutedForItemId: string | null;
  notes: string | null;
  availableOffers: BuildOffer[];
};

export type BuildStep = { id: string; title: string; body: string | null; status: string; sortOrder: number };

export type BuildConfiguration = {
  id: string; name: string; format: string; contentText: string | null; fileId: string | null;
  version: number; createdAt: string; updatedAt: string;
};

export type BuildFirmware = {
  id: string; name: string; repositoryUrl: string | null; revision: string | null; fileId: string | null;
  licenseSpdx: string | null; notes: string | null; createdAt: string; updatedAt: string;
};

export type BuildCalibration = {
  id: string; name: string; procedureText: string | null; resultData: Record<string, unknown>;
  status: "pending" | "passed" | "failed" | "superseded"; performedByUserId: string | null;
  performedAt: string | null; createdAt: string;
};

export type BuildTest = {
  id: string; name: string; methodText: string; expectedText: string | null; observedText: string | null;
  result: "pending" | "passed" | "failed" | "inconclusive"; evidenceFileId: string | null;
  performedByUserId: string | null; performedAt: string | null; createdAt: string;
};

export type BuildDetail = BuildSummary & {
  items: BuildItem[];
  steps: BuildStep[];
  dependencies: Array<{ buildStepId: string; dependsOnStepId: string }>;
  configurations: BuildConfiguration[];
  firmware: BuildFirmware[];
  calibrations: BuildCalibration[];
  tests: BuildTest[];
  problems: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown>>;
  files: Array<{ id: string; originalName: string; mediaType: string; sizeBytes: number; visibility: string; status: string; kind: string; purpose: string; buildStepId: string | null; createdAt: string }>;
};

export type BomSummary = {
  id: string;
  slug: string | null;
  name: string;
  owner_user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  current_version_id: string | null;
  visibility: ResourceVisibility;
  is_demo: number;
  updated_at: string;
  line_count: number;
  known_cost_minor: number;
  unpriced_lines: number;
};

export type BomItem = {
  id: string;
  componentId: string | null;
  componentSlug: string | null;
  componentName: string | null;
  componentCategory: string | null;
  manufacturerName: string | null;
  slotKey: string;
  description: string;
  quantity: number;
  unit: string;
  selectedSupplierOfferId: string | null;
  selectedSupplierName: string | null;
  selectedUnitPriceMinor: number | null;
  targetUnitPriceMinor: number | null;
  lowestUnitPriceMinor: number | null;
  knownOfferCount: number;
  notes: string | null;
};

export type BomDetail = BomSummary & {
  version: { id: string; label: string; notes: string | null; currency: string; createdAt: string } | null;
  items: BomItem[];
  totals: { lines: number; units: number; knownCostMinor: number; unpricedLines: number };
};
