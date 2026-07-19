// Local-only marketplace drafts. Nothing here is transmitted or published.
// Stored in browser localStorage under a stable key per draft type.

import type { ConditionGrade } from "@/data/listings";

const LISTING_KEY = "rpp:mkt:listing-drafts:v1";
const WANTED_KEY = "rpp:mkt:wanted-drafts:v1";
const SAVED_LISTINGS_KEY = "rpp:mkt:saved-listings:v1";

export type ListingDraft = {
  id: string;
  createdAt: string;
  partId: string;
  title: string;
  grade: ConditionGrade;
  runtimeHours: number | null;
  price: number;
  region: "US" | "EU" | "CN" | "JP" | "KR";
  hasTestReport: boolean;
  hasVideo: boolean;
  returnsAccepted: boolean;
  escrowEligible: boolean;
  serialVerified: boolean;
  identityVerified: boolean;
  notes: string;
};

export type WantedDraft = {
  id: string;
  createdAt: string;
  partCategory: "actuator" | "hand" | "sensor" | "compute" | "driver" | "reducer";
  partName: string;
  qty: number;
  maxBudget: number;
  region: "US" | "EU" | "CN" | "JP" | "KR" | "Any";
  notes: string;
};

const read = <T,>(key: string): T[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch { return []; }
};

const write = <T,>(key: string, rows: T[]) => {
  try { window.localStorage.setItem(key, JSON.stringify(rows)); } catch {}
};

export const listingDrafts = () => read<ListingDraft>(LISTING_KEY);
export const wantedDrafts = () => read<WantedDraft>(WANTED_KEY);

export const saveListingDraft = (d: Omit<ListingDraft, "id" | "createdAt">) => {
  const rows = listingDrafts();
  const row: ListingDraft = { ...d, id: `ld-${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
  rows.unshift(row);
  write(LISTING_KEY, rows);
  return row;
};
export const saveWantedDraft = (d: Omit<WantedDraft, "id" | "createdAt">) => {
  const rows = wantedDrafts();
  const row: WantedDraft = { ...d, id: `wd-${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
  rows.unshift(row);
  write(WANTED_KEY, rows);
  return row;
};
export const deleteListingDraft = (id: string) => write(LISTING_KEY, listingDrafts().filter(d => d.id !== id));
export const deleteWantedDraft = (id: string) => write(WANTED_KEY, wantedDrafts().filter(d => d.id !== id));

export const getListingDraft = (id: string): ListingDraft | undefined =>
  listingDrafts().find(d => d.id === id);
export const getWantedDraft = (id: string): WantedDraft | undefined =>
  wantedDrafts().find(d => d.id === id);

export const updateListingDraft = (
  id: string,
  patch: Omit<ListingDraft, "id" | "createdAt">,
): ListingDraft | undefined => {
  const rows = listingDrafts();
  const idx = rows.findIndex(d => d.id === id);
  if (idx === -1) return undefined;
  const next: ListingDraft = { ...rows[idx], ...patch, id: rows[idx].id, createdAt: rows[idx].createdAt };
  rows[idx] = next;
  write(LISTING_KEY, rows);
  return next;
};
export const updateWantedDraft = (
  id: string,
  patch: Omit<WantedDraft, "id" | "createdAt">,
): WantedDraft | undefined => {
  const rows = wantedDrafts();
  const idx = rows.findIndex(d => d.id === id);
  if (idx === -1) return undefined;
  const next: WantedDraft = { ...rows[idx], ...patch, id: rows[idx].id, createdAt: rows[idx].createdAt };
  rows[idx] = next;
  write(WANTED_KEY, rows);
  return next;
};

// Saved (watched) listings — array of listing ids.
export const savedListingIds = (): string[] => read<string>(SAVED_LISTINGS_KEY);
export const isListingSaved = (id: string) => savedListingIds().includes(id);
export const toggleSavedListing = (id: string): boolean => {
  const ids = savedListingIds();
  const has = ids.includes(id);
  const next = has ? ids.filter(x => x !== id) : [id, ...ids];
  write(SAVED_LISTINGS_KEY, next);
  return !has;
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};