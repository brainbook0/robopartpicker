export type Failure = {
  id: string;
  partId: string;
  symptom: string;
  runtimeHours: number;
  loadPctOfCont: number;
  voltageV: number;
  ambientC: number;
  resolution: "RMA approved" | "RMA denied" | "Self-repair" | "No response" | "Pending";
  supplierResponseDays: number | null;
  reportedDaysAgo: number;
  author: string;
};

export const failures: Failure[] = [
  { id: "f-1", partId: "a-unitree-a1", symptom: "Encoder drift after thermal cycling", runtimeHours: 312, loadPctOfCont: 85, voltageV: 24, ambientC: 28, resolution: "RMA approved", supplierResponseDays: 9, reportedDaysAgo: 12, author: "biped-lab-mit" },
  { id: "f-2", partId: "a-unitree-a1", symptom: "Phase wire insulation degraded — short to housing", runtimeHours: 180, loadPctOfCont: 110, voltageV: 24, ambientC: 35, resolution: "Self-repair", supplierResponseDays: null, reportedDaysAgo: 30, author: "anon-7741" },
  { id: "f-3", partId: "a-anyrotor-knee48", symptom: "Output bearing failure", runtimeHours: 90, loadPctOfCont: 70, voltageV: 48, ambientC: 22, resolution: "No response", supplierResponseDays: null, reportedDaysAgo: 7, author: "exo-team-zurich" },
  { id: "f-4", partId: "a-anyrotor-knee48", symptom: "Reported torque 60% of spec under load", runtimeHours: 5, loadPctOfCont: 50, voltageV: 48, ambientC: 24, resolution: "RMA denied", supplierResponseDays: 21, reportedDaysAgo: 18, author: "diy-humanoid-club" },
  { id: "f-5", partId: "a-cm-rmd-x8", symptom: "CAN bus dropouts at >90C housing", runtimeHours: 540, loadPctOfCont: 95, voltageV: 48, ambientC: 30, resolution: "Self-repair", supplierResponseDays: 4, reportedDaysAgo: 22, author: "cmu-manip-lab" },
  { id: "f-6", partId: "h-inspire-rh56", symptom: "Index finger tendon fatigue", runtimeHours: 8200, loadPctOfCont: 60, voltageV: 24, ambientC: 22, resolution: "RMA approved", supplierResponseDays: 12, reportedDaysAgo: 40, author: "tum-bipedal" },
  { id: "f-7", partId: "a-unitree-b1", symptom: "Magnet adhesive failure on rotor", runtimeHours: 220, loadPctOfCont: 90, voltageV: 58, ambientC: 32, resolution: "RMA approved", supplierResponseDays: 14, reportedDaysAgo: 60, author: "shenzhen-resell" },
  { id: "f-8", partId: "r-leader-lhd-25", symptom: "Flexspline crack at 1100 hrs", runtimeHours: 1100, loadPctOfCont: 75, voltageV: 0, ambientC: 25, resolution: "RMA denied", supplierResponseDays: 30, reportedDaysAgo: 90, author: "munich-humanoid" },
];

export const failuresByPart = (partId: string) => failures.filter(f => f.partId === partId);
