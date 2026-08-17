// Robot form-factor taxonomy shared by the backfill, harvest, and UI layers.
// A single primary category is assigned per project; secondary aspects remain
// expressed through the project's tags. The vocabulary is intentionally small
// and user-facing so it can drive the browse filters.

export const ROBOT_CATEGORIES = [
  "humanoid",
  "manipulator",
  "gripper",
  "quadruped",
  "hexapod",
  "mobile",
  "aerial",
  "biped",
  "exoskeleton",
  "head",
  "actuator",
  "underwater",
  "other",
] as const;

export type RobotCategory = (typeof ROBOT_CATEGORIES)[number];

export const ROBOT_CATEGORY_LABELS: Record<RobotCategory, string> = {
  humanoid: "Humanoid",
  manipulator: "Manipulator / arm",
  gripper: "Hand / gripper",
  quadruped: "Quadruped",
  hexapod: "Hexapod",
  mobile: "Mobile / rover",
  aerial: "Aerial / drone",
  biped: "Biped",
  exoskeleton: "Exoskeleton",
  head: "Head / face",
  actuator: "Actuator",
  underwater: "Underwater",
  other: "Other",
};

type CategoryRule = {
  category: RobotCategory;
  pattern: RegExp;
};

// Ordered; first match wins. Specific, unambiguous form factors are checked
// before broader ones so, e.g., "robot hand" beats "robot arm" and a humanoid
// beats a generic "mobile" match.
const CATEGORY_RULES: CategoryRule[] = [
  { category: "underwater", pattern: /\b(?:rov|auv|uuv|underwater|subsea|submarine|blue ?rov)\b/i },
  { category: "exoskeleton", pattern: /\b(?:exoskeleton|exosuit|wearable robot|wearable robotics)\b/i },
  { category: "aerial", pattern: /\b(?:drone|uav|u ?a ?v|quadcopter|quad[- ]?rotor|multirotor|multi[- ]?rotor|aerial robot|vtol|hexacopter|octocopter|pixhawk|ardupilot|px4|fpv)\b/i },
  { category: "hexapod", pattern: /\b(?:hexapod|six[- ]legged|6[- ]legged|spider[- ]?bot|spider robot)\b/i },
  { category: "humanoid", pattern: /\b(?:humanoid|nao|pepper|inmoov|robotis[- ]?op|poppy|reem|icub|talos|walk[- ]?man|optimus|atlas|digit|figure|apollo|unitree h1|unitree g1|g1 edu|humanplus|plen2)\b/i },
  { category: "quadruped", pattern: /\b(?:quadruped|quadrupedal|four[- ]legged|4[- ]legged|robot ?dog|robodog|spot ?micro|spot ?mini|mini[- ]?cheetah|cheetah|laikago|go1|go2|b1|a1)\b/i },
  { category: "biped", pattern: /\b(?:biped(?:al)?|two[- ]legged|2[- ]legged|walking robot|self[- ]balanc|balance bot|balancing robot|zmp walking|dynamixel biped|b[- ]robot)\b/i },
  { category: "head", pattern: /\b(?:robot(?:ic)? head|robot(?:ic)? face|animatronic head|social robot head|robot head|robot neck|facial robot)\b/i },
  { category: "manipulator", pattern: /\b(?:manipulator|robot(?:ic)? arm|robotic limb|six[- ]?axis|6[- ]?axis|7[- ]?axis|6[- ]?dof arm|7[- ]?dof arm|scara|delta robot|parallel[- ]?link robot|desktop arm|robot arm kit|arm robot|brachiograph|cobot)\b/i },
  { category: "gripper", pattern: /\b(?:gripper|robot(?:ic)? hand|dexterous hand|end[- ]?effector|prosthetic hand|robot(?:ic)? finger|soft hand|underactuated hand|adaptive gripper|soft gripper)\b/i },
  { category: "actuator", pattern: /\b(?:actuator|servo|robot(?:ic)? joint|motor module|dynamixel|quasi[- ]direct drive|qdd motor|linear actuator|series elastic actuator|robotic muscle)\b/i },
  { category: "mobile", pattern: /\b(?:rover|wheeled robot|mobile robot|differential drive|diff drive|omniwheel|omni[- ]wheel|mecanum|tracked robot|rc car|toy car|self[- ]driving car|robot car|wheelbot|segway|turtlebot|rosbot|line[- ]follow|delivery robot|agv|amr)\b/i },
];

// Extra tags surfaced for a project when a category keyword also matches a
// topic-style token. Kept independent of the primary category.
const TAG_KEYWORDS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "open-source-hardware", pattern: /\b(?:open[- ]source hardware|oshw|open hardware)\b/i },
  { tag: "3d-printed", pattern: /\b(?:3d[- ]print(?:ed|able)?|3dprint|printed parts)\b/i },
  { tag: "ros", pattern: /\b(?:ros1|ros2|ros)\b/i },
  { tag: "urdf", pattern: /\burdf\b/i },
  { tag: "cad", pattern: /\b(?:cad|step file|fusion 360|solidworks|freecad|onshape)\b/i },
  { tag: "bom", pattern: /\bbom\b|\bbill of materials\b/i },
  { tag: "education", pattern: /\b(?:education|educational|stem|classroom|teaching|course)\b/i },
  { tag: "diy", pattern: /\b(?:diy|do it yourself|hobby|maker)\b/i },
];

export type RobotCategoryInput = {
  name?: string | null;
  summary?: string | null;
  description?: string | null;
  tags?: string[];
};

export function classifyRobotCategory(input: RobotCategoryInput): {
  category: RobotCategory;
  matchedTags: string[];
} {
  const text = `${input.name ?? ""} ${input.summary ?? ""} ${input.description ?? ""} ${(input.tags ?? []).join(" ")}`;

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      const matchedTags = TAG_KEYWORDS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.tag);
      return { category: rule.category, matchedTags };
    }
  }

  const matchedTags = TAG_KEYWORDS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.tag);
  return { category: "other", matchedTags };
}
