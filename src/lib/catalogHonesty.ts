// Honest-surface helpers. Production-facing views must never render seeded demo
// fixture records as if they were real: demo records carry fake prices, stock,
// ratings, and imagery. These helpers partition API results so demo records can
// be withheld and an honest "unavailable / coming soon" state shown instead.

/** A record that carries the catalog-wide demo/real flag. */
export interface DemoFlagged {
  isDemo: boolean;
}

/** True when a record is real (not a seeded demo fixture). */
export function isLiveRecord(record: Pick<DemoFlagged, "isDemo"> | undefined | null): boolean {
  return Boolean(record && record.isDemo === false);
}

/** Keep only real (non-demo) records. */
export function liveRecords<T extends DemoFlagged>(records: readonly T[] | undefined | null): T[] {
  return (records ?? []).filter((record) => record.isDemo === false);
}

/** Whether any record is real (non-demo). */
export function hasLiveData<T extends DemoFlagged>(records: readonly T[] | undefined | null): boolean {
  return (records ?? []).some((record) => record.isDemo === false);
}