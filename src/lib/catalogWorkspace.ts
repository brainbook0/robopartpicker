// Local-only catalog / sourcing workspace state.
// Nothing here is sent, monitored, published, or synchronized with any server.
// All data lives in this browser's localStorage.

import type { Part, PartCategory } from "@/shared/catalog";

const SAVED_PARTS_KEY = "rpp:cat:saved-parts:v1";
const COMPARE_KEY = "rpp:cat:compare:v1";
const PRICE_ALERTS_KEY = "rpp:cat:price-alerts:v1";
const RFQ_KEY = "rpp:cat:rfq-drafts:v1";

export const COMPARE_CAP = 4;

/** Fired on `window` after any mutation to the local workspace so React
 *  surfaces (CompareTray, PartsTable rows, etc.) can resynchronize without
 *  waiting for a StorageEvent (StorageEvent does NOT fire in the tab that wrote
 *  the value, so a bare `storage` listener misses same-tab mutations). */
export const WORKSPACE_EVENT = "rpp:catalog-workspace-change";
const dispatchChange = () => {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT)); } catch { /* ignore */ }
};

export type CompareState = { category: PartCategory | null; ids: string[] };

export type PriceAlertDraft = {
  id: string;
  partId: string;
  targetPrice: number | null;
  createdAt: string;
  updatedAt: string;
};

/** RFQ draft. Local only — never sent, monitored, or synced. */
export type RfqDraft = {
  id: string;
  /** Catalog part id, when the draft targets a fixture entry. */
  partId: string | null;
  /** Optional free-form part name/MPN when there is no catalog entry. */
  manualPartName: string | null;
  supplierId: string | null;
  quantity: number;
  targetLeadDays: number | null;
  requirements: string;
  createdAt: string;
  updatedAt: string;
};

const canUse = () => typeof window !== "undefined" && !!window.localStorage;

const readJson = <T>(key: string, fallback: T): T => {
  if (!canUse()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (!canUse()) return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  dispatchChange();
};

// ---------------- Saved parts ----------------

export const savedPartIds = (): string[] => {
  const raw = readJson<unknown>(SAVED_PARTS_KEY, []);
  const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  return Array.from(new Set(list));
};
export const isPartSaved = (id: string) => savedPartIds().includes(id);
export const toggleSavedPart = (id: string): boolean => {
  const ids = savedPartIds();
  const has = ids.includes(id);
  const next = has ? ids.filter(x => x !== id) : [id, ...ids];
  writeJson(SAVED_PARTS_KEY, next);
  return !has;
};

// ---------------- Compare ----------------

/** Pure parse: given anything read from storage, produce a valid CompareState.
 *  Exposed for tests and for callers that hydrate from external sources. */
export const parseCompareState = (raw: unknown): CompareState => {
  if (!raw || typeof raw !== "object") return { category: null, ids: [] };
  const r = raw as { category?: unknown; ids?: unknown };
  const ids = Array.isArray(r.ids)
    ? Array.from(new Set(r.ids.filter((x): x is string => typeof x === "string" && x.length > 0))).slice(0, COMPARE_CAP)
    : [];
  const category = typeof r.category === "string" ? (r.category as PartCategory) : null;
  return { category: ids.length ? category : null, ids };
};

export const readCompare = (): CompareState => {
  return parseCompareState(readJson<unknown>(COMPARE_KEY, null));
};

export const writeCompare = (s: CompareState) => {
  const next = parseCompareState(s);
  writeJson(COMPARE_KEY, next);
  return next;
};

/** Result of a comparison mutation. `kind` is the canonical outcome; the
 *  boolean flags are preserved for legacy callers. */
export type CompareToggleResult = {
  kind: "added" | "removed" | "replaced-category" | "limit-reached" | "invalid-part" | "category-mismatch";
  state: CompareState;
  replacedCategory: boolean;
  atCap: boolean;
};

/** Toggle a part in the comparison set.
 *  Category mismatch replaces the set ONLY when `allowReplace` is `true`;
 *  otherwise the mutation is refused and `kind === "category-mismatch"`. */
export const toggleCompare = (
  partId: string,
  category: PartCategory,
  opts: { allowReplace?: boolean } = {},
): CompareToggleResult => {
  if (!partId || typeof partId !== "string") {
    return { kind: "invalid-part", state: readCompare(), replacedCategory: false, atCap: false };
  }
  const cur = readCompare();
  if (cur.ids.includes(partId)) {
    const next = writeCompare({ category: cur.category, ids: cur.ids.filter(x => x !== partId) });
    return { kind: "removed", state: next, replacedCategory: false, atCap: false };
  }
  if (cur.category && cur.category !== category) {
    if (!opts.allowReplace) {
      return { kind: "category-mismatch", state: cur, replacedCategory: false, atCap: false };
    }
    const next = writeCompare({ category, ids: [partId] });
    return { kind: "replaced-category", state: next, replacedCategory: true, atCap: false };
  }
  if (cur.ids.length >= COMPARE_CAP) {
    return { kind: "limit-reached", state: cur, replacedCategory: false, atCap: true };
  }
  const next = writeCompare({ category, ids: [...cur.ids, partId] });
  return { kind: "added", state: next, replacedCategory: false, atCap: false };
};

export const clearCompare = () => writeCompare({ category: null, ids: [] });
export const removeFromCompare = (id: string) => {
  const cur = readCompare();
  return writeCompare({ category: cur.category, ids: cur.ids.filter(x => x !== id) });
};

// ---------------- Price alerts (local drafts, not monitored) ----------------

/** Pure normalization of a single price-alert record from unknown input. */
export const parsePriceAlertDraft = (raw: unknown): PriceAlertDraft | null => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<PriceAlertDraft> & { targetPrice?: unknown };
  if (typeof o.id !== "string" || !o.id) return null;
  if (typeof o.partId !== "string" || !o.partId) return null;
  const tp = o.targetPrice;
  const target = tp == null ? null : (Number.isFinite(Number(tp)) && Number(tp) > 0 ? Number(tp) : null);
  const createdAt = typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString();
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : createdAt;
  return { id: o.id, partId: o.partId, targetPrice: target, createdAt, updatedAt };
};

export const priceAlertDrafts = (): PriceAlertDraft[] => {
  const raw = readJson<unknown>(PRICE_ALERTS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePriceAlertDraft).filter((x): x is PriceAlertDraft => !!x);
};
export const priceAlertForPart = (partId: string) => priceAlertDrafts().find(a => a.partId === partId);
export const upsertPriceAlert = (partId: string, targetPrice: number | null): PriceAlertDraft => {
  const rows = priceAlertDrafts();
  const existing = rows.find(a => a.partId === partId);
  const target = targetPrice != null && Number.isFinite(targetPrice) && targetPrice > 0 ? targetPrice : null;
  const now = new Date().toISOString();
  let out: PriceAlertDraft;
  if (existing) {
    out = { ...existing, targetPrice: target, updatedAt: now };
    writeJson(PRICE_ALERTS_KEY, rows.map(r => r.id === existing.id ? out : r));
  } else {
    out = { id: `pa-${Date.now().toString(36)}`, partId, targetPrice: target, createdAt: now, updatedAt: now };
    writeJson(PRICE_ALERTS_KEY, [out, ...rows]);
  }
  return out;
};
export const removePriceAlert = (partId: string) => {
  writeJson(PRICE_ALERTS_KEY, priceAlertDrafts().filter(a => a.partId !== partId));
};

// ---------------- RFQ drafts (local, not sent) ----------------

export type RfqInput = {
  partId: string | null;
  manualPartName: string | null;
  supplierId: string | null;
  quantity: number;
  targetLeadDays: number | null;
  requirements: string;
};

export type RfqValidation = { ok: true; value: RfqInput } | { ok: false; errors: string[] };

/** Pure normalization: trim strings, coerce numeric fields, drop empties. */
export const normalizeRfqInput = (raw: Partial<RfqInput> | Record<string, unknown>): RfqInput => {
  const r = raw as Record<string, unknown>;
  const manualRaw = typeof r.manualPartName === "string" ? r.manualPartName : "";
  const manualPartName = manualRaw.trim() ? manualRaw.trim() : null;
  const supplierId = typeof r.supplierId === "string" && r.supplierId.trim() ? r.supplierId.trim() : null;
  const partId = typeof r.partId === "string" && r.partId.trim() ? r.partId.trim() : null;
  const qtyNum = Number(r.quantity);
  const quantity = Number.isFinite(qtyNum) && qtyNum >= 1 ? Math.floor(qtyNum) : NaN;
  const leadRaw = r.targetLeadDays;
  let targetLeadDays: number | null = null;
  if (leadRaw == null || leadRaw === "") targetLeadDays = null;
  else {
    const n = Number(leadRaw);
    targetLeadDays = Number.isFinite(n) && n >= 0 ? Math.floor(n) : NaN;
  }
  const requirements = typeof r.requirements === "string" ? r.requirements.trim() : "";
  return { partId, manualPartName, supplierId, quantity, targetLeadDays, requirements };
};

export const validateRfqInput = (raw: Partial<RfqInput>): RfqValidation => {
  const value = normalizeRfqInput(raw);
  const errors: string[] = [];
  if (!value.partId && !value.manualPartName) errors.push("A part name or catalog part is required.");
  if (!Number.isFinite(value.quantity) || value.quantity < 1) errors.push("Quantity must be at least 1.");
  if (Number.isNaN(value.targetLeadDays as number)) errors.push("Target lead must be a nonnegative number of days or blank.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value };
};

/** Pure parse of a stored RFQ record. Returns null if the record is unusable. */
export const parseRfqDraft = (raw: unknown): RfqDraft | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  const qty = Number(r.quantity);
  if (!Number.isFinite(qty) || qty < 1) return null;
  const norm = normalizeRfqInput(r);
  if (!norm.partId && !norm.manualPartName) return null;
  const createdAt = typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString();
  const updatedAt = typeof r.updatedAt === "string" ? r.updatedAt : createdAt;
  return {
    id: r.id,
    partId: norm.partId,
    manualPartName: norm.manualPartName,
    supplierId: norm.supplierId,
    quantity: norm.quantity,
    targetLeadDays: Number.isNaN(norm.targetLeadDays as number) ? null : norm.targetLeadDays,
    requirements: norm.requirements,
    createdAt,
    updatedAt,
  };
};

export const rfqDrafts = (): RfqDraft[] => {
  const raw = readJson<unknown>(RFQ_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(parseRfqDraft).filter((x): x is RfqDraft => !!x);
};

export const rfqDraftById = (id: string) => rfqDrafts().find(r => r.id === id);

export const rfqDraftsForPart = (partId: string) => rfqDrafts().filter(r => r.partId === partId);
export const rfqDraftsForSupplier = (supplierId: string) => rfqDrafts().filter(r => r.supplierId === supplierId);

export const saveRfqDraft = (input: RfqInput, existingId?: string): RfqDraft => {
  const rows = rfqDrafts();
  const now = new Date().toISOString();
  if (existingId) {
    const idx = rows.findIndex(r => r.id === existingId);
    if (idx >= 0) {
      const next: RfqDraft = { ...rows[idx], ...input, id: rows[idx].id, createdAt: rows[idx].createdAt, updatedAt: now };
      rows[idx] = next;
      writeJson(RFQ_KEY, rows);
      return next;
    }
  }
  const created: RfqDraft = {
    id: `rfq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  writeJson(RFQ_KEY, [created, ...rows]);
  return created;
};

export const deleteRfqDraft = (id: string) => {
  writeJson(RFQ_KEY, rfqDrafts().filter(r => r.id !== id));
};

export const rfqDraftToText = (r: RfqDraft, supplierName?: string): string => {
  const partLine = r.partId
    ? `Part: ${r.manualPartName ?? r.partId} (${r.partId})`
    : `Part: ${r.manualPartName ?? "(unspecified)"}`;
  const lines = [
    "REQUEST FOR QUOTATION (local draft — not sent)",
    `Draft ID: ${r.id}`,
    `Created: ${new Date(r.createdAt).toISOString()}`,
    supplierName ? `Supplier: ${supplierName}${r.supplierId ? ` (${r.supplierId})` : ""}` : "",
    partLine,
    `Quantity: ${r.quantity}`,
    r.targetLeadDays != null ? `Target lead: ${r.targetLeadDays} days` : "Target lead: unspecified",
    "",
    "Requirements:",
    r.requirements || "(none provided)",
  ];
  return lines.filter(Boolean).join("\n");
};

export const copyText = async (text: string): Promise<boolean> => {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};

// ---------------- Field floors (catalog data completeness) ----------------

/** Required fields per component category. Missing values must be surfaced, not
 *  silently defaulted, so a part never looks more complete than it is. */
export const CATEGORY_REQUIRED_FIELDS: Record<PartCategory, string[]> = {
  actuator: ["peakNm", "contNm", "speedRpm", "voltageV"],
  hand: ["dof", "payloadKg"],
  sensor: ["type", "rangeM"],
  compute: ["tops", "ramGb"],
  driver: ["maxCurrentA", "voltageV"],
  reducer: ["ratio", "ratedTorqueNm"],
};

export const missingRequiredFields = (part: Part): string[] => {
  const required = CATEGORY_REQUIRED_FIELDS[part.category] ?? [];
  return required.filter((field) => {
    const value = (part as Record<string, unknown>)[field];
    return value == null || (typeof value === "number" && !Number.isFinite(value));
  });
};

export const fieldFloorOk = (part: Part): boolean => missingRequiredFields(part).length === 0;

export type FieldFloorReport = { category: PartCategory; required: string[]; missing: string[]; complete: boolean };

export const fieldFloorReport = (part: Part): FieldFloorReport => {
  const missing = missingRequiredFields(part);
  return { category: part.category, required: CATEGORY_REQUIRED_FIELDS[part.category] ?? [], missing, complete: missing.length === 0 };
};

/** Synthetic/demo fixtures must never be presented as live supplier data. */
export const isSyntheticPart = (part: Pick<Part, "isDemo" | "provenanceLabel">): boolean =>
  part.isDemo === true || part.provenanceLabel === "demo" || part.provenanceLabel === "inferred";

// ---------------- Testing hooks (exported for unit tests) ----------------
export const __testing = { SAVED_PARTS_KEY, COMPARE_KEY, PRICE_ALERTS_KEY, RFQ_KEY };
