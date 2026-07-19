import { parts, partById, lowestPrice } from "./parts";

export type BomSlot = { slot: string; partId: string; qty: number; note?: string };

export type Bom = {
  id: string;
  slug: string;
  name: string;
  subsystem: "arm" | "leg" | "hand" | "upper-body" | "perception" | "full";
  author: string;
  description: string;
  slots: BomSlot[];
  forks: number;
  updatedDaysAgo: number;
};

export const boms: Bom[] = [
  {
    id: "b-1", slug: "low-cost-humanoid-arm-7dof", name: "Low-cost humanoid arm (7-DOF)",
    subsystem: "arm", author: "diy-humanoid-club",
    description: "Budget research arm using CubeMars + Dynamixel mix.",
    slots: [
      { slot: "Shoulder pitch", partId: "a-cm-rmd-x6", qty: 1 },
      { slot: "Shoulder roll", partId: "a-cm-rmd-x6", qty: 1 },
      { slot: "Shoulder yaw", partId: "a-cm-rmd-l9015", qty: 1 },
      { slot: "Elbow", partId: "a-mjbots-moteus-n1", qty: 1 },
      { slot: "Wrist roll", partId: "a-dyn-xm540", qty: 1 },
      { slot: "Wrist pitch", partId: "a-dyn-xm540", qty: 1 },
      { slot: "Wrist yaw", partId: "a-mjbots-moteus-c1", qty: 1 },
      { slot: "Driver bridge", partId: "d-moteus-pi3hat", qty: 1 },
    ],
    forks: 18, updatedDaysAgo: 3,
  },
  {
    id: "b-2", slug: "premium-humanoid-arm-7dof", name: "Premium humanoid arm (7-DOF)",
    subsystem: "arm", author: "munich-humanoid",
    description: "Maxon frameless + Harmonic Drive build for serious manipulation.",
    slots: [
      { slot: "Shoulder pitch", partId: "a-maxon-ec90", qty: 1 },
      { slot: "Shoulder roll", partId: "a-maxon-ec90", qty: 1 },
      { slot: "Shoulder yaw", partId: "a-maxon-ec90", qty: 1 },
      { slot: "Elbow", partId: "a-maxon-ec90", qty: 1 },
      { slot: "Wrist roll", partId: "a-mjbots-moteus-n1", qty: 1 },
      { slot: "Wrist pitch", partId: "a-mjbots-moteus-n1", qty: 1 },
      { slot: "Wrist yaw", partId: "a-mjbots-moteus-c1", qty: 1 },
      { slot: "Shoulder reducer", partId: "r-hd-csd-25", qty: 3 },
      { slot: "Driver bridge", partId: "d-moteus-pi3hat", qty: 1 },
    ],
    forks: 4, updatedDaysAgo: 11,
  },
  {
    id: "b-3", slug: "biped-leg-actuator-set", name: "Biped leg actuator set (6-DOF per leg)",
    subsystem: "leg", author: "biped-lab-mit",
    description: "12-actuator set covering both legs of a mid-size biped.",
    slots: [
      { slot: "Hip pitch L/R", partId: "a-unitree-b1", qty: 2 },
      { slot: "Hip roll L/R", partId: "a-cm-rmd-x8", qty: 2 },
      { slot: "Hip yaw L/R", partId: "a-cm-rmd-x8", qty: 2 },
      { slot: "Knee L/R", partId: "a-cm-rmd-x8", qty: 2 },
      { slot: "Ankle pitch L/R", partId: "a-tmotor-ak80", qty: 2 },
      { slot: "Ankle roll L/R", partId: "a-tmotor-ak80", qty: 2 },
    ],
    forks: 31, updatedDaysAgo: 1,
  },
  {
    id: "b-4", slug: "dexterous-hand-open-source", name: "Dexterous hand (open-source LEAP)",
    subsystem: "hand", author: "cmu-manip-lab",
    description: "LEAP hand v1 reference BOM.",
    slots: [
      { slot: "Hand assembly", partId: "h-leap-v1", qty: 1 },
    ],
    forks: 62, updatedDaysAgo: 5,
  },
  {
    id: "b-5", slug: "perception-stack-humanoid", name: "Humanoid perception stack",
    subsystem: "perception", author: "clearpath-surplus",
    description: "Head + torso perception module with depth + lidar.",
    slots: [
      { slot: "Head depth", partId: "se-rs-d455", qty: 2 },
      { slot: "Wrist depth", partId: "se-zed-x", qty: 2 },
      { slot: "Head lidar", partId: "se-livox-mid360", qty: 1 },
      { slot: "Edge compute", partId: "c-jetson-orin-nx", qty: 1 },
      { slot: "Main compute", partId: "c-jetson-orin-64", qty: 1 },
    ],
    forks: 9, updatedDaysAgo: 8,
  },
  {
    id: "b-6", slug: "budget-quadruped-leg", name: "Budget quadruped leg",
    subsystem: "leg", author: "diy-humanoid-club",
    description: "3-DOF Unitree A1-based quadruped leg.",
    slots: [
      { slot: "Hip", partId: "a-unitree-a1", qty: 1 },
      { slot: "Thigh", partId: "a-unitree-a1", qty: 1 },
      { slot: "Calf", partId: "a-tmotor-ak80", qty: 1 },
    ],
    forks: 44, updatedDaysAgo: 2,
  },
];

export const bomCost = (b: Bom) =>
  b.slots.reduce((sum, s) => {
    const p = partById(s.partId); if (!p) return sum;
    return sum + lowestPrice(p) * s.qty;
  }, 0);

export const bomMass = (b: Bom) =>
  b.slots.reduce((sum, s) => {
    const p = partById(s.partId) as { weightKg?: number } | undefined;
    if (!p || typeof p.weightKg !== "number") return sum;
    return sum + p.weightKg * s.qty;
  }, 0);

export const bomPartCount = (b: Bom) => b.slots.reduce((n, s) => n + s.qty, 0);
export const bomBySlug = (slug: string) => boms.find(b => b.slug === slug);
