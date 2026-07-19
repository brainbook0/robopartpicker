export type EvidenceLabel = "verified-by-manufacturer" | "customer-reported" | "public-demo" | "third-party-test" | "teardown-confirmed" | "unverified";

export type ComponentClaim = {
  subsystem: string; // "knee", "shoulder", "hand", "compute"
  claim: string;
  partId?: string;
  evidence: EvidenceLabel;
  source?: string;
};

export type Teardown = {
  robotSlug: string;
  evidenceScore: number; // 0-100
  confirmedCount: number;
  bomLowUsd: number;
  bomMidUsd: number;
  bomHighUsd: number;
  components: ComponentClaim[];
  openQuestions: string[];
  updatedDaysAgo: number;
};

export const teardowns: Teardown[] = [
  {
    robotSlug: "unitree-h1",
    evidenceScore: 78, confirmedCount: 6,
    bomLowUsd: 32000, bomMidUsd: 48000, bomHighUsd: 72000,
    components: [
      { subsystem: "Hip actuator", claim: "Unitree B1-class QDD motor, ~360 Nm peak", partId: "a-unitree-b1", evidence: "teardown-confirmed", source: "Hackaday teardown 2024" },
      { subsystem: "Knee actuator", claim: "Custom QDD, ~200 Nm peak", evidence: "customer-reported" },
      { subsystem: "Compute", claim: "Jetson AGX Orin 64GB", partId: "c-jetson-orin-64", evidence: "verified-by-manufacturer" },
      { subsystem: "Head depth", claim: "Intel RealSense D455", partId: "se-rs-d455", evidence: "public-demo" },
      { subsystem: "LiDAR", claim: "Livox Mid-360", partId: "se-livox-mid360", evidence: "verified-by-manufacturer" },
      { subsystem: "Comms bus", claim: "CAN-FD throughout", evidence: "customer-reported" },
    ],
    openQuestions: ["Exact ankle actuator torque rating", "Battery cell vendor", "Wrist DoF count in shipping units"],
    updatedDaysAgo: 4,
  },
  {
    robotSlug: "figure-02",
    evidenceScore: 42, confirmedCount: 2,
    bomLowUsd: 60000, bomMidUsd: 95000, bomHighUsd: 150000,
    components: [
      { subsystem: "Compute", claim: "NVIDIA-class accelerator, exact SKU unknown", evidence: "public-demo" },
      { subsystem: "Hand", claim: "16-DOF in-house hand", evidence: "verified-by-manufacturer" },
      { subsystem: "Actuators", claim: "Vertically integrated, sourcing not disclosed", evidence: "unverified" },
    ],
    openQuestions: ["Actuator vendor", "Reducer type (harmonic vs cycloidal)", "Battery chemistry", "Production volume"],
    updatedDaysAgo: 9,
  },
  {
    robotSlug: "tesla-optimus-gen2",
    evidenceScore: 35, confirmedCount: 1,
    bomLowUsd: 25000, bomMidUsd: 40000, bomHighUsd: 70000,
    components: [
      { subsystem: "Compute", claim: "Tesla in-house FSD-derived SoC", evidence: "verified-by-manufacturer" },
      { subsystem: "Actuators", claim: "In-house custom actuators, 6 designs", evidence: "public-demo" },
      { subsystem: "Hand", claim: "11-DOF tendon-driven hand", evidence: "public-demo" },
    ],
    openQuestions: ["Reducer supplier", "Cell vendor", "Sensor stack details", "Yield rates"],
    updatedDaysAgo: 14,
  },
];

export const teardownBySlug = (slug: string) => teardowns.find(t => t.robotSlug === slug);
