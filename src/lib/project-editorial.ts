// Curated, source-backed build notes for individual project pages, keyed by project slug.
//
// One flat imported BOM (line items + a set of file paths) is thin for the one query class this
// catalogue already ranks for: people deciding what to buy to build a known arm. The pages that
// outrank our SO-101 project page are hands-on build guides, so this states, in the words of the
// upstream repository's own README, what the arm is, which arm you are building, the motor gearing
// per arm, the repository's own list cost, the print recipe and where the assembly guide lives.
// Every number here is quoted from the cited upstream README (retrieved 2026-11-01); none of it is
// inferred, and the per-part observed catalogue prices stay separate.
//
// This is a SHARED module on purpose: the same structured data is rendered both by the React app
// (so human visitors actually read it) and by the worker's crawler prerender (worker/services/seo.ts).
// Keeping one source guarantees the crawler body and the rendered app never disagree — a build note
// that only the crawler could see would be both a ranking risk and useless to a builder.

export type EditorialInline = { text: string; href?: string };

export type EditorialBlock =
  | { type: "p"; segments: EditorialInline[] }
  | { type: "ul"; items: EditorialInline[][] };

export interface EditorialSection {
  heading: string;
  blocks: EditorialBlock[];
}

export const PROJECT_EDITORIAL: Record<string, EditorialSection[]> = {
  "therobotstudio-so-arm100": [
    {
      heading: "SO-101 at a glance",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The SO-101 is The RobotStudio's second-generation 6-DOF desktop arm, built with Hugging Face for the open-source LeRobot stack. Against the deprecated SO-100 it improved its wiring, updated the leader-arm motors and assembles without removing servo gears. It is a leader/follower pair: the follower carries the gripper and executes motion, while the leader is the hand-guided arm you move by hand to teleoperate the follower or collect training data.",
            },
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Source: " },
            { text: "TheRobotStudio/SO-ARM100", href: "https://github.com/TheRobotStudio/SO-ARM100" },
            { text: " README (Apache-2.0)." },
          ],
        },
      ],
    },
    {
      heading: "Which arm are you building?",
      blocks: [
        {
          type: "ul",
          items: [
            [{ text: "Leader + follower teleoperation set — 12 servos in total." }],
            [{ text: "Single follower arm — 6 servos." }],
          ],
        },
      ],
    },
    {
      heading: "Motors by arm and gear",
      blocks: [
        {
          type: "p",
          segments: [
            { text: "Both arms use Feetech STS3215 bus servos, but the gearing differs: the leader only has to sense hand motion, not drive a load." },
          ],
        },
        {
          type: "ul",
          items: [
            [{ text: "Follower arm — 6 × STS3215 7.4 V, 1/345 gear (C001)." }],
            [{ text: "Leader arm — 1 × 1/345 (C001), 2 × 1/191 (C044), 3 × 1/147 (C046); 6 total." }],
            [{ text: "Leader + follower set — 7 × C001, 2 × C044, 3 × C046; 12 total." }],
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Torque: the 7.4 V servo is rated 16.5 kg·cm stall at 6 V; a 12 V STS3215 reaches 30 kg·cm. The 7.4 V part is sufficient for both arms and the leader is always 7.4 V. Fitting 12 V servos to the follower also requires a 12 V 5 A+ power supply." },
          ],
        },
      ],
    },
    {
      heading: "Typical cost (upstream list prices)",
      blocks: [
        {
          type: "p",
          segments: [
            { text: "From the repository's own sourcing tables: one follower arm ≈ US$121.94; the full leader + follower set ≈ US$229.88, so the leader arm adds ≈ US$108. The two-arm set is ≈ €226.3 (EU) or ¥1343.16 (CN). These are the upstream README's figures, not supplier quotes; observed per-part catalogue prices appear separately above." },
          ],
        },
      ],
    },
    {
      heading: "3D printing the frame",
      blocks: [
        {
          type: "ul",
          items: [
            [{ text: "Material PLA+, 0.4 mm nozzle at 0.2 mm layer height (or 0.6 mm nozzle at 0.4 mm)." }],
            [{ text: "15% infill; supports everywhere except slopes over 45° and screw holes on horizontal axes." }],
            [{ text: "Each arm prints as one pre-oriented STL: the Ender profile (220×220 mm bed) or the Prusa/UP profile (205×250 mm)." }],
            [{ text: "Print a gauge (servo or Lego size) first to check dimensional accuracy before committing the full arm." }],
          ],
        },
      ],
    },
    {
      heading: "Assembly",
      blocks: [
        {
          type: "p",
          segments: [
            { text: "The SO-101 is built without removing servo gears, which is the main reason to choose it over the SO-100. The step-by-step build and LeRobot setup live in the " },
            { text: "LeRobot SO-101 guide", href: "https://huggingface.co/docs/lerobot/so101" },
            { text: ". Pre-built arms and part kits are offered by Seeed Studio, WowRobo, RobotEd, Robonine, PartaBot, ForgeMotion Labs and others linked from the repository." },
          ],
        },
      ],
    },
  ],
};

export function projectEditorial(slug: string): EditorialSection[] | undefined {
  return PROJECT_EDITORIAL[slug];
}
