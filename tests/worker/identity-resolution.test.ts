import { describe, expect, it } from "vitest";
import {
  buildComponentRelationship,
  createIdentityCandidates,
  type CanonicalIdentity,
} from "../../worker/services/identity-resolution";
import {
  buildConflictSet,
  resolveConflictSet,
  withdrawClaim,
} from "../../worker/services/claim-conflicts";
import {
  appendLifecycleEvent,
  currentLifecycleView,
  transitionMissingInformation,
  type LifecycleEvent,
} from "../../worker/services/record-lifecycle";


const canonical: CanonicalIdentity[] = [
  {
    id: "component-a",
    entityType: "component",
    validatedEntityType: "component",
    exists: true,
    name: "DYNAMIXEL XH430 W350 R",
    manufacturerName: "ROBOTIS",
    manufacturerPartNumber: "XH430-W350-R",
    category: "actuator",
  },
  {
    id: "component-b",
    entityType: "component",
    validatedEntityType: "component",
    exists: true,
    name: "DYNAMIXEL XH430 W350 R",
    manufacturerName: "Fixture Robotics",
    manufacturerPartNumber: "OTHER-1",
    category: "actuator",
  },
  {
    id: "wrong-type",
    entityType: "component",
    validatedEntityType: "supplier",
    exists: true,
    name: "DYNAMIXEL XH430 W350 R",
    manufacturerPartNumber: "XH430-W350-R",
  },
  {
    id: "missing-row",
    entityType: "component",
    validatedEntityType: "component",
    exists: false,
    name: "DYNAMIXEL XH430 W350 R",
    manufacturerPartNumber: "XH430-W350-R",
  },
];

describe("identity resolution", () => {
  it("ranks exact deterministic matches and rejects invalid canonical dependencies", async () => {
    const result = await createIdentityCandidates({
      recordType: "component",
      name: "Dynamixel XH430-W350-R",
      manufacturerName: "Robotis",
      manufacturerPartNumber: "xh430-w350-r",
      category: "actuator",
      canonical,
    });

    expect(result.state).toBe("candidate_found");
    expect(result.promotionAllowed).toBe(false);
    expect(result.candidates[0]).toMatchObject({
      canonicalEntityId: "component-a",
      deterministicScore: 1,
      matchMethod: "manufacturer_part_number_and_manufacturer_exact",
    });
    expect(result.candidates.map((candidate) => candidate.canonicalEntityId)).not.toContain("wrong-type");
    expect(result.candidates.map((candidate) => candidate.canonicalEntityId)).not.toContain("missing-row");
    expect(result.rejections).toEqual([
      { canonicalEntityId: "wrong-type", reason: "wrong_canonical_entity_type" },
      { canonicalEntityId: "missing-row", reason: "canonical_entity_not_found" },
    ]);
  });

  it("keeps ambiguous name matches unresolved and AI signals separate", async () => {
    const result = await createIdentityCandidates({
      recordType: "component",
      name: "DYNAMIXEL XH430 W350 R",
      category: "actuator",
      canonical,
      aiSignals: [
        { canonicalEntityId: "component-b", score: 0.99, model: "fixture-model" },
      ],
    });

    expect(result.state).toBe("ambiguous");
    expect(result.canonicalEntityId).toBeNull();
    expect(result.promotionAllowed).toBe(false);
    expect(result.candidates.slice(0, 2).map((candidate) => candidate.canonicalEntityId)).toEqual([
      "component-a",
      "component-b",
    ]);
    expect(result.candidates[1].aiSignal).toEqual({
      score: 0.99,
      model: "fixture-model",
    });
    expect(result.candidates[1].deterministicScore).toBe(result.candidates[0].deterministicScore);
  });

  it("keeps substitutions evidence-backed and never infers success", () => {
    expect(buildComponentRelationship({
      relationship: "substitution",
      original: canonical[0]!,
      replacement: canonical[1]!,
      reason: "Original component was unavailable.",
      evidenceIds: ["evidence-build-log"],
      adaptations: {
        mechanical: "Adapter plate required",
        electrical: null,
        software: "CAN ID changed",
      },
      reportedOutcome: null,
    })).toEqual({
      relationship: "substitution",
      originalComponentId: "component-a",
      replacementComponentId: "component-b",
      reason: "Original component was unavailable.",
      evidenceIds: ["evidence-build-log"],
      adaptations: {
        mechanical: "Adapter plate required",
        electrical: null,
        software: "CAN ID changed",
      },
      verificationState: "unverified",
      successful: null,
    });
  });
});

describe("claim conflicts", () => {
  it("does not create a conflict for repeated normalized values", async () => {
    expect(await buildConflictSet([
      { id: "claim-a", claimKey: "actuator.torque", normalizedValue: 12, evidenceId: "evidence-a" },
      { id: "claim-b", claimKey: "actuator.torque", normalizedValue: 12, evidenceId: "evidence-b" },
    ])).toBeNull();
  });

  it("preserves every contradictory claim and withdrawal history", async () => {
    const claims = [
      { id: "claim-a", claimKey: "actuator.torque", normalizedValue: 12, evidenceId: "evidence-a" },
      { id: "claim-b", claimKey: "actuator.torque", normalizedValue: 13, evidenceId: "evidence-b" },
    ];
    const conflict = await buildConflictSet(claims);

    expect(conflict).toMatchObject({
      status: "open",
      claimKey: "actuator.torque",
      memberClaimIds: ["claim-a", "claim-b"],
      preferredClaimId: null,
    });
    expect(withdrawClaim(claims, "claim-a", "2026-07-30T00:00:00.000Z", "source withdrew value")).toEqual([
      {
        ...claims[0],
        withdrawnAt: "2026-07-30T00:00:00.000Z",
        withdrawalReason: "source withdrew value",
      },
      claims[1],
    ]);
    expect(claims[0]).not.toHaveProperty("withdrawnAt");

    const resolved = resolveConflictSet(
      conflict!,
      "claim-b",
      "2026-07-30T00:00:00.000Z",
      "Measured evidence is newer.",
    );
    expect(resolved).toMatchObject({
      status: "resolved",
      preferredClaimId: "claim-b",
      resolvedAt: "2026-07-30T00:00:00.000Z",
      resolutionNotes: "Measured evidence is newer.",
    });
    expect(conflict).toMatchObject({ status: "open", preferredClaimId: null });
  });
});

describe("record lifecycle", () => {
  const mutableClasses: LifecycleEvent["mutableClass"][] = [
    "specification",
    "firmware",
    "release",
    "project_version",
    "availability",
    "source_policy_status",
    "delisting",
  ];

  it.each(mutableClasses)("keeps append order but computes the current %s view by occurrence time", (mutableClass) => {
    const newer: LifecycleEvent = {
      id: `${mutableClass}-new`,
      mutableClass,
      eventType: mutableClass === "delisting" ? "withdraw" : "observe",
      occurredAt: "2026-07-30T00:00:00.000Z",
      receivedAt: "2026-07-30T01:00:00.000Z",
      value: "new",
      supersedesEventId: null,
    };
    const older: LifecycleEvent = {
      id: `${mutableClass}-old`,
      mutableClass,
      eventType: "observe",
      occurredAt: "2026-07-29T00:00:00.000Z",
      receivedAt: "2026-07-31T01:00:00.000Z",
      value: "old",
      supersedesEventId: null,
    };
    const history = appendLifecycleEvent(appendLifecycleEvent([], newer), older);

    expect(history.map((event) => event.id)).toEqual([newer.id, older.id]);
    expect(currentLifecycleView(history, mutableClass)).toMatchObject({
      currentEventId: newer.id,
      value: "new",
      withdrawn: mutableClass === "delisting",
    });
  });

  it("preserves superseded events and validates missing-information transitions", () => {
    const original: LifecycleEvent = {
      id: "firmware-a",
      mutableClass: "firmware",
      eventType: "observe",
      occurredAt: "2026-07-29T00:00:00.000Z",
      receivedAt: "2026-07-29T00:00:00.000Z",
      value: "1.0.0",
      supersedesEventId: null,
    };
    const replacement: LifecycleEvent = {
      id: "firmware-b",
      mutableClass: "firmware",
      eventType: "supersede",
      occurredAt: "2026-07-30T00:00:00.000Z",
      receivedAt: "2026-07-30T00:00:00.000Z",
      value: "1.1.0",
      supersedesEventId: "firmware-a",
    };
    const history = appendLifecycleEvent(appendLifecycleEvent([], original), replacement);

    expect(history).toHaveLength(2);
    expect(currentLifecycleView(history, "firmware").value).toBe("1.1.0");
    expect(transitionMissingInformation("open", "deferred")).toBe("deferred");
    expect(transitionMissingInformation("deferred", "resolved")).toBe("resolved");
    expect(() => transitionMissingInformation("resolved", "open")).toThrow("Invalid missing-information transition");
  });
});
