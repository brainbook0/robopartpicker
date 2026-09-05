import type { RobotCategory } from "../shared/robotCategory";

export type CommercialIdentityOverride = { name: string; model: string; category?: RobotCategory };

export const COMMERCIAL_IDENTITY_OVERRIDES: Readonly<Record<string, CommercialIdentityOverride>> = {
  "dobot-atom-html": { name: "DOBOT Atom", model: "Atom", category: "humanoid" },
  "dobot-x-trainer-html": { name: "DOBOT X-Trainer", model: "X-Trainer", category: "manipulator" },
  "dobot-cr-30h-collaborative-robots-html": { name: "DOBOT CR30H", model: "CR30H" },
  "dobot-cr10as-html": { name: "DOBOT CR10AS", model: "CR10AS" },
  "dobot-cr10s-html": { name: "DOBOT CR10S", model: "CR10S" },
  "dobot-cr20a-html": { name: "DOBOT CR20A", model: "CR20A" },
  "dobot-cr3as-html": { name: "DOBOT CR3AS", model: "CR3AS" },
  "dobot-cr3s-html": { name: "DOBOT CR3S", model: "CR3S" },
  "dobot-cr5as-html": { name: "DOBOT CR5AS", model: "CR5AS" },
  "dobot-cr5s-html": { name: "DOBOT CR5S", model: "CR5S" },
  "dobot-m1-pro-html": { name: "DOBOT M1 Pro", model: "M1 Pro" },
  "dobot-magician-e6-html": { name: "DOBOT Magician E6", model: "Magician E6" },
  "dobot-magician-go-html": { name: "DOBOT Magician Go", model: "Magician Go" },
  "dobot-magician-lite-html": { name: "DOBOT Magician Lite", model: "Magician Lite" },
  "dobot-magician-html": { name: "DOBOT Magician", model: "Magician" },
  "dobot-mg400-html": { name: "DOBOT MG400", model: "MG400" },
  "dobot-nova2-html": { name: "DOBOT Nova 2", model: "Nova 2" },
  "dobot-nova5-html": { name: "DOBOT Nova 5", model: "Nova 5" },
  "dobot-vx500-html": { name: "DOBOT VX500", model: "VX500" },
};

export function applyCommercialIdentityOverride<T extends { slug: string; name: string; model: string; category: string }>(record: T): T {
  const override = COMMERCIAL_IDENTITY_OVERRIDES[record.slug];
  return override ? { ...record, ...override } : record;
}
