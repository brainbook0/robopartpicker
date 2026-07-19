export type PostType =
  | "question" | "review" | "failure-report" | "test-result"
  | "teardown-note" | "supplier-experience" | "compatibility-note"
  | "build-log" | "alternative-rec";

export type ObjectRef =
  | { kind: "part"; id: string }
  | { kind: "supplier"; id: string }
  | { kind: "robot"; slug: string }
  | { kind: "bom"; slug: string }
  | { kind: "listing"; id: string };

export type Post = {
  id: string;
  type: PostType;
  title: string;
  author: string;
  postedDaysAgo: number;
  ref: ObjectRef;
  refSecondary?: ObjectRef;
  replies: number;
  upvotes: number;
  fields: Record<string, string | number | boolean>;
  body?: string;
};

export const posts: Post[] = [
  { id: "p-1", type: "failure-report", title: "RMA experience — Unitree A1 encoder drift",
    author: "biped-lab-mit", postedDaysAgo: 2, ref: { kind: "part", id: "a-unitree-a1" },
    replies: 14, upvotes: 42,
    fields: { runtimeHr: 312, loadPct: 85, voltageV: 24, ambientC: 28, symptom: "Encoder drift after thermal cycling", resolution: "RMA approved", responseDays: 9 } },
  { id: "p-2", type: "review", title: "moteus n1 holds spec at 110hr",
    author: "cmu-manip-lab", postedDaysAgo: 5, ref: { kind: "part", id: "a-mjbots-moteus-n1" },
    replies: 7, upvotes: 38, fields: { rating: 5, contextHr: 110, useCase: "Manipulation research" } },
  { id: "p-3", type: "compatibility-note", title: "RMD-X6 + pi3hat works out of the box",
    author: "diy-humanoid-club", postedDaysAgo: 6, ref: { kind: "part", id: "a-cm-rmd-x6" },
    refSecondary: { kind: "part", id: "d-moteus-pi3hat" }, replies: 4, upvotes: 21,
    fields: { result: "Compatible", notes: "CAN address remap required" } },
  { id: "p-4", type: "test-result", title: "AnyRotor K48 — measured torque 58% of spec",
    author: "exo-team-zurich", postedDaysAgo: 9, ref: { kind: "part", id: "a-anyrotor-knee48" },
    replies: 22, upvotes: 88,
    fields: { testType: "Dyno load test", measuredPeakNm: 46, ratedPeakNm: 80, sampleSize: 3 } },
  { id: "p-5", type: "supplier-experience", title: "Leader Drive RFQ — slow quote, fast ship",
    author: "munich-humanoid", postedDaysAgo: 12, ref: { kind: "supplier", id: "s-leaderdrive" },
    replies: 3, upvotes: 12,
    fields: { rfqToQuoteDays: 8, quoteAccuracy: "off by 12%", shipDays: 18 } },
  { id: "p-6", type: "teardown-note", title: "Figure 02 — visible hand actuators",
    author: "shenzhen-resell", postedDaysAgo: 14, ref: { kind: "robot", slug: "figure-02" },
    replies: 18, upvotes: 67,
    fields: { component: "Hand actuators", evidence: "public-demo", finding: "Likely in-house brushless" } },
  { id: "p-7", type: "build-log", title: "DIY humanoid arm milestone 3 — first IK solve",
    author: "diy-humanoid-club", postedDaysAgo: 3, ref: { kind: "bom", slug: "low-cost-humanoid-arm-7dof" },
    replies: 9, upvotes: 54,
    fields: { milestone: "IK solve", issuesOpen: 2, hoursLogged: 41 } },
  { id: "p-8", type: "alternative-rec", title: "Use RMD-X8 instead of Unitree B1 for budget hip",
    author: "biped-lab-mit", postedDaysAgo: 7, ref: { kind: "part", id: "a-unitree-b1" },
    refSecondary: { kind: "part", id: "a-cm-rmd-x8" }, replies: 11, upvotes: 33,
    fields: { reason: "73% cost reduction at 27% torque tradeoff" } },
  { id: "p-9", type: "question", title: "Best ankle actuator under $500?",
    author: "anon-7741", postedDaysAgo: 1, ref: { kind: "part", id: "a-tmotor-ak80" },
    replies: 6, upvotes: 5, fields: { joint: "ankle", budgetUsd: 500 } },
  { id: "p-10", type: "failure-report", title: "LHD-25 flexspline cracked at 1100hr",
    author: "munich-humanoid", postedDaysAgo: 30, ref: { kind: "part", id: "r-leader-lhd-25" },
    replies: 27, upvotes: 102,
    fields: { runtimeHr: 1100, loadPct: 75, ambientC: 25, symptom: "Flexspline crack", resolution: "RMA denied" } },
];

export const postsByRef = (kind: ObjectRef["kind"], id: string) =>
  posts.filter(p => {
    const matchPrimary = p.ref.kind === kind && (("id" in p.ref ? p.ref.id : p.ref.slug) === id);
    const r2 = p.refSecondary;
    const matchSecondary = r2 ? (r2.kind === kind && (("id" in r2 ? r2.id : r2.slug) === id)) : false;
    return matchPrimary || matchSecondary;
  });

export const postTypeLabel: Record<PostType, string> = {
  question: "Question", review: "Review", "failure-report": "Failure report",
  "test-result": "Test result", "teardown-note": "Teardown note",
  "supplier-experience": "Supplier experience", "compatibility-note": "Compatibility",
  "build-log": "Build log", "alternative-rec": "Alternative rec",
};
