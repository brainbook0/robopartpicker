import { describe, expect, it } from "vitest";
import { canApprove, effectiveRfqState, isRfqTerminal, reachesState, transitionRfq } from "./rfq";

describe("RFQ state machine", () => {
  it("reaches user_review_required through the quote workflow spine", () => {
    expect(reachesState(["request", "prepare", "send", "receive_partial", "reconcile", "review"], "user_review_required")).toBe(true);
  });

  it("requires explicit approval before option_selected", () => {
    expect(canApprove("user_review_required")).toBe(true);
    expect(canApprove("estimate_ready")).toBe(false);
    expect(canApprove("quotes_reconciled")).toBe(false);
    expect(canApprove("requests_sent")).toBe(false);
    expect(transitionRfq("user_review_required", "approve")).toBe("option_selected");
  });

  it("rejects invalid transitions", () => {
    expect(transitionRfq("estimate_ready", "approve")).toBe(null);
    expect(transitionRfq("estimate_ready", "reconcile")).toBe(null);
    expect(transitionRfq("option_selected", "cancel")).toBe(null);
  });

  it("supports expired and cancelled states from active states", () => {
    expect(transitionRfq("estimate_ready", "cancel")).toBe("cancelled");
    expect(transitionRfq("requests_sent", "expire")).toBe("expired");
    expect(transitionRfq("partial_quotes_received", "cancel")).toBe("cancelled");
    expect(isRfqTerminal("cancelled")).toBe(true);
    expect(isRfqTerminal("expired")).toBe(true);
    expect(isRfqTerminal("option_selected")).toBe(true);
    expect(isRfqTerminal("estimate_ready")).toBe(false);
  });

  it("does not allow transitions out of terminal states", () => {
    expect(transitionRfq("cancelled", "request")).toBe(null);
    expect(transitionRfq("expired", "approve")).toBe(null);
  });
});

describe("RFQ time-based expiry", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");

  it("expires a nonterminal request once expires_at has passed", () => {
    expect(effectiveRfqState("quote_requested", "2026-08-14T11:59:59.000Z", now)).toBe("expired");
    expect(effectiveRfqState("estimate_ready", "2026-08-14T12:00:00.000Z", now)).toBe("expired");
    expect(effectiveRfqState("user_review_required", "2026-08-01T00:00:00.000Z", now)).toBe("expired");
  });

  it("leaves a nonterminal request untouched while expires_at is in the future", () => {
    expect(effectiveRfqState("quote_requested", "2026-08-14T12:00:01.000Z", now)).toBe("quote_requested");
    expect(effectiveRfqState("estimate_ready", "2027-01-01T00:00:00.000Z", now)).toBe("estimate_ready");
    expect(effectiveRfqState("requests_sent", null, now)).toBe("requests_sent");
  });

  it("never alters terminal states, even with a past expires_at", () => {
    expect(effectiveRfqState("expired", "2026-08-01T00:00:00.000Z", now)).toBe("expired");
    expect(effectiveRfqState("cancelled", "2026-08-01T00:00:00.000Z", now)).toBe("cancelled");
    expect(effectiveRfqState("option_selected", "2026-08-01T00:00:00.000Z", now)).toBe("option_selected");
  });

  it("treats a malformed expires_at as absent rather than expiring", () => {
    expect(effectiveRfqState("quote_requested", "not-a-date", now)).toBe("quote_requested");
    expect(effectiveRfqState("quote_requested", "", now)).toBe("quote_requested");
  });

  it("keeps cancel disallowed for a time-expired request via the state machine", () => {
    const effective = effectiveRfqState("requests_sent", "2026-08-01T00:00:00.000Z", now);
    expect(transitionRfq(effective, "cancel")).toBe(null);
  });
});
