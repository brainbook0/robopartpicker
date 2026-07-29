export type MutableClass =
  | "specification"
  | "firmware"
  | "release"
  | "project_version"
  | "availability"
  | "source_policy_status"
  | "delisting";

export interface LifecycleEvent {
  id: string;
  mutableClass: MutableClass;
  eventType: "observe" | "supersede" | "withdraw";
  occurredAt: string;
  receivedAt: string;
  value: unknown;
  supersedesEventId: string | null;
}

export function appendLifecycleEvent(
  history: readonly LifecycleEvent[],
  event: LifecycleEvent,
): LifecycleEvent[] {
  if (history.some((existing) => existing.id === event.id)) {
    throw new Error("Lifecycle event IDs must be unique.");
  }
  assertTimestamp(event.occurredAt, "occurredAt");
  assertTimestamp(event.receivedAt, "receivedAt");
  if (event.eventType === "supersede" && !event.supersedesEventId) {
    throw new Error("Supersession requires supersedesEventId.");
  }
  if (event.supersedesEventId) {
    const prior = history.find((existing) => existing.id === event.supersedesEventId);
    if (!prior) throw new Error("Superseded lifecycle event was not found.");
    if (prior.mutableClass !== event.mutableClass) {
      throw new Error("Lifecycle events can supersede only the same mutable class.");
    }
  }
  return [...history, { ...event }];
}

export function currentLifecycleView(
  history: readonly LifecycleEvent[],
  mutableClass: MutableClass,
) {
  const current = history
    .filter((event) => event.mutableClass === mutableClass)
    .slice()
    .sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt)
      || right.receivedAt.localeCompare(left.receivedAt)
      || right.id.localeCompare(left.id),
    )[0];
  if (!current) {
    return {
      mutableClass,
      currentEventId: null,
      value: null,
      withdrawn: false,
    };
  }
  return {
    mutableClass,
    currentEventId: current.id,
    value: current.value,
    withdrawn: current.eventType === "withdraw",
  };
}

export type MissingInformationStatus = "open" | "deferred" | "resolved" | "promoted";

const missingTransitions: Record<MissingInformationStatus, readonly MissingInformationStatus[]> = {
  open: ["deferred", "resolved", "promoted"],
  deferred: ["open", "resolved", "promoted"],
  resolved: [],
  promoted: ["resolved"],
};

export function transitionMissingInformation(
  current: MissingInformationStatus,
  next: MissingInformationStatus,
): MissingInformationStatus {
  if (current === next) return current;
  if (!missingTransitions[current].includes(next)) {
    throw new Error(`Invalid missing-information transition: ${current} -> ${next}.`);
  }
  return next;
}

function assertTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value)) || !value.endsWith("Z")) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp.`);
  }
}
