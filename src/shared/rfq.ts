// Pure firm-quote (RFQ) state machine. Deterministic and side-effect free so
// it can be unit-tested and reused in the Worker. Handoff to a supplier can
// only ever happen after an explicit user approval (option_selected).

export const RFQ_STATES = [
  "estimate_ready",
  "quote_requested",
  "supplier_requests_prepared",
  "requests_sent",
  "partial_quotes_received",
  "quotes_reconciled",
  "user_review_required",
  "option_selected",
  "expired",
  "cancelled",
] as const;
export type RfqState = (typeof RFQ_STATES)[number];

export const RFQ_ACTIONS = ["request", "prepare", "send", "receive_partial", "reconcile", "review", "approve", "expire", "cancel"] as const;
export type RfqAction = (typeof RFQ_ACTIONS)[number];

export const RFQ_TERMINAL_STATES: readonly RfqState[] = ["option_selected", "expired", "cancelled"];

const TRANSITIONS: Record<RfqState, Partial<Record<RfqAction, RfqState>>> = {
  estimate_ready: { request: "quote_requested", expire: "expired", cancel: "cancelled" },
  quote_requested: { prepare: "supplier_requests_prepared", expire: "expired", cancel: "cancelled" },
  supplier_requests_prepared: { send: "requests_sent", expire: "expired", cancel: "cancelled" },
  requests_sent: { receive_partial: "partial_quotes_received", expire: "expired", cancel: "cancelled" },
  partial_quotes_received: { reconcile: "quotes_reconciled", receive_partial: "partial_quotes_received", expire: "expired", cancel: "cancelled" },
  quotes_reconciled: { review: "user_review_required", expire: "expired", cancel: "cancelled" },
  user_review_required: { approve: "option_selected", expire: "expired", cancel: "cancelled" },
  option_selected: { expire: "expired" },
  expired: {},
  cancelled: {},
};

export const isRfqState = (value: unknown): value is RfqState =>
  typeof value === "string" && (RFQ_STATES as readonly string[]).includes(value);

export const isRfqAction = (value: unknown): value is RfqAction =>
  typeof value === "string" && (RFQ_ACTIONS as readonly string[]).includes(value);

export const isRfqTerminal = (state: RfqState): boolean => (RFQ_TERMINAL_STATES as readonly string[]).includes(state);

/** Return the next state for a valid transition, or null when the action is not
 *  allowed from the current state. */
export function transitionRfq(state: RfqState, action: RfqAction): RfqState | null {
  return TRANSITIONS[state][action] ?? null;
}

/** The required approvals: a quote may only be selected (handoff) by the
 *  explicit `approve` action from `user_review_required`. */
export function canApprove(state: RfqState): boolean {
  return transitionRfq(state, "approve") !== null;
}

/** Resolve the effective state for a quote request, applying time-based
 *  expiry. A nonterminal request whose `expiresAt` has passed is reported as
 *  `expired`; terminal states are never altered. This is a pure read and never
 *  persists the resolved state, so read paths stay side-effect free. */
export function effectiveRfqState(state: RfqState, expiresAt: string | null, now: Date = new Date()): RfqState {
  if (isRfqTerminal(state) || !expiresAt) return state;
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) return state;
  return expiresMs <= now.getTime() ? "expired" : state;
}

/** Validate a full path of actions from estimate_ready to a target state. */
export function reachesState(actions: RfqAction[], target: RfqState): boolean {
  let state: RfqState = "estimate_ready";
  for (const action of actions) {
    const next = transitionRfq(state, action);
    if (!next) return false;
    state = next;
  }
  return state === target;
}
