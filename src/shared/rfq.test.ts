import { describe, expect, it } from "vitest";
import { canApprove, isRfqTerminal, reachesState, transitionRfq } from "./rfq";

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
