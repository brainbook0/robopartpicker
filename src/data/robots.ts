export type Robot = {
  slug: string;
  name: string;
  maker: string;
  country: string;
  status: "shipping" | "preorder" | "research" | "discontinued";
  category: "humanoid" | "biped" | "wheeled-humanoid" | "quadruped";
  // Physical
  heightCm: number;
  weightKg: number;
  dof: number;
  payloadKg: number;
  walkSpeedMs: number;          // m/s top walking speed
  runtimeMin: number;
  ipRating?: string;
  // Engineering
  engineering: {
    actuatorType: string;        // e.g. "BLDC + planetary", "Cycloidal", "QDD", "Tendon-driven"
    peakJointTorqueNm: number;   // strongest joint
    legDoF: number;
    armDoF: number;
    handDoF: number;
    bodyMaterial: string;        // e.g. "Aluminum + CFRP"
    commsBus: string;            // EtherCAT / CAN-FD / RS-485
    batteryV: number;
    batteryWh: number;
    chargeTimeMin: number;
  };
  // Sensing & compute
  compute: {
    primary: string;             // e.g. "Jetson AGX Orin 64GB"
    tops: number;                // AI TOPS
    ramGb: number;
    storageGb: number;
    secondary?: string;          // realtime MCU
  };
  sensors: {
    cameras: string;             // "2× Intel RealSense D455 + 1× ZED X"
    lidar?: string;
    imu: string;
    microphones?: number;
    forceTorque?: string;
  };
  // Software
  software: {
    os: string;                  // "Ubuntu 22.04 + PREEMPT_RT"
    middleware: string;          // "ROS 2 Humble" / "Custom RTOS"
    sdkLanguages: string[];      // ["Python", "C++"]
    rosSupport: "native" | "community" | "none";
    vlaModel?: string;           // "Helix v2", "Pi-Zero", "GR00T N1"
    teleopSupport: boolean;
    simulators: string[];        // ["MuJoCo", "Isaac Sim"]
  };
  // Commercial
  commercial: {
    msrpUsd: number | null;
    streetUsd: number | null;
    leadTimeWeeks: number | null;
    warrantyMonths: number;
    regions: string[];           // ["US", "EU", "APAC"]
    distribution: "direct" | "dealer" | "research-only" | "preorder";
    spareAvailability: "high" | "medium" | "low" | "none";
  };
  openSource: boolean;
  releaseYear: number;
  blurb: string;
  resources: { label: string; type: "pdf" | "link" | "repo" | "video"; url: string }[];
  priceHistory: { date: string; price: number }[];
  accentHsl: string;             // e.g. "188 86% 53%" used for technical illustration
  priceUsd?: number | null;       // derived from commercial.streetUsd ?? msrpUsd (back-compat)
};

const series = (start: number, points: number, vol = 0.04, drift = 0): { date: string; price: number }[] => {
  const out: { date: string; price: number }[] = [];
  let p = start;
  const now = new Date();
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    p = Math.max(100, p * (1 + (Math.sin(i * 1.3) * vol) + drift + (Math.cos(i * 0.7) * vol * 0.5)));
    out.push({ date: d.toISOString().slice(0, 7), price: Math.round(p) });
  }
  return out;
};

export const robots: Robot[] = [
  {
    slug: "unitree-g1",
    name: "G1", maker: "Unitree", country: "CN", status: "shipping", category: "humanoid",
    heightCm: 130, weightKg: 35, dof: 23, payloadKg: 3, walkSpeedMs: 2.0, runtimeMin: 120, ipRating: "IP54",
    engineering: { actuatorType: "BLDC + planetary, joint encoders", peakJointTorqueNm: 120, legDoF: 12, armDoF: 7, handDoF: 0,
      bodyMaterial: "Aluminum alloy + ABS shell", commsBus: "EtherCAT", batteryV: 58, batteryWh: 580, chargeTimeMin: 90 },
    compute: { primary: "Jetson Orin NX 16GB", tops: 100, ramGb: 16, storageGb: 256, secondary: "STM32H7 realtime MCU" },
    sensors: { cameras: "Intel RealSense D435i (depth) + RGB head", lidar: "Livox Mid-360 (optional)", imu: "9-axis, 1 kHz", microphones: 4, forceTorque: "ankle 6-axis (option)" },
    software: { os: "Ubuntu 20.04 + PREEMPT_RT", middleware: "ROS 2 Foxy + Unitree SDK2", sdkLanguages: ["C++","Python"], rosSupport: "native", vlaModel: "User-supplied (LeRobot, Pi-Zero)", teleopSupport: true, simulators: ["MuJoCo","Isaac Sim"] },
    commercial: { msrpUsd: 16000, streetUsd: 16000, leadTimeWeeks: 6, warrantyMonths: 12, regions: ["CN","US","EU","APAC"], distribution: "direct", spareAvailability: "high" },
    openSource: false, releaseYear: 2024,
    blurb: "Compact 1.3 m developer humanoid. 23 DoF, EtherCAT actuators, dual-mode (DEV / EDU) with optional 3-finger hands.",
    resources: [
      { label: "Official product page", type: "link", url: "https://www.unitree.com/g1" },
      { label: "Unitree SDK2 (GitHub)", type: "repo", url: "https://github.com/unitreerobotics/unitree_sdk2" },
      { label: "G1 datasheet", type: "pdf", url: "#" },
      { label: "Teardown (YouTube)", type: "video", url: "#" },
    ],
    priceHistory: series(21000, 14, 0.03, -0.018), accentHsl: "188 86% 53%",
  },
  {
    slug: "unitree-h1",
    name: "H1", maker: "Unitree", country: "CN", status: "shipping", category: "humanoid",
    heightCm: 180, weightKg: 47, dof: 27, payloadKg: 5, walkSpeedMs: 3.3, runtimeMin: 90, ipRating: "IP54",
    engineering: { actuatorType: "Custom BLDC, 360 Nm peak hip", peakJointTorqueNm: 360, legDoF: 10, armDoF: 8, handDoF: 0,
      bodyMaterial: "Aluminum alloy", commsBus: "EtherCAT", batteryV: 58, batteryWh: 864, chargeTimeMin: 120 },
    compute: { primary: "Intel Core i5 + Jetson Orin", tops: 100, ramGb: 32, storageGb: 512 },
    sensors: { cameras: "Intel RealSense D435", lidar: "Livox Mid-360 360°", imu: "9-axis, 1 kHz", forceTorque: "ankle 6-axis" },
    software: { os: "Ubuntu 20.04 + PREEMPT_RT", middleware: "ROS 2 Foxy + Unitree SDK2", sdkLanguages: ["C++","Python"], rosSupport: "native", teleopSupport: true, simulators: ["MuJoCo","Isaac Sim","Gazebo"] },
    commercial: { msrpUsd: 90000, streetUsd: 90000, leadTimeWeeks: 8, warrantyMonths: 12, regions: ["CN","US","EU","APAC"], distribution: "direct", spareAvailability: "medium" },
    openSource: false, releaseYear: 2023,
    blurb: "Full-size 1.8 m dynamic humanoid. Holds the unofficial walking-speed record (3.3 m/s) in its class.",
    resources: [
      { label: "Official page", type: "link", url: "https://www.unitree.com/h1" },
      { label: "ROS 2 driver", type: "repo", url: "https://github.com/unitreerobotics/unitree_ros2" },
      { label: "Service manual", type: "pdf", url: "#" },
    ],
    priceHistory: series(150000, 14, 0.04, -0.025), accentHsl: "188 86% 53%",
  },
  {
    slug: "tesla-optimus-gen2",
    name: "Optimus Gen 2", maker: "Tesla", country: "US", status: "research", category: "humanoid",
    heightCm: 173, weightKg: 57, dof: 28, payloadKg: 9, walkSpeedMs: 0.6, runtimeMin: 240,
    engineering: { actuatorType: "Tesla in-house actuators (rotary + linear)", peakJointTorqueNm: 200, legDoF: 12, armDoF: 7, handDoF: 11,
      bodyMaterial: "Aluminum + composite", commsBus: "Custom (Tesla)", batteryV: 52, batteryWh: 2300, chargeTimeMin: 90 },
    compute: { primary: "Tesla FSD inference SoC", tops: 144, ramGb: 16, storageGb: 256 },
    sensors: { cameras: "8× cameras (Tesla Vision)", imu: "Custom 9-axis", forceTorque: "fingertip tactile (11/hand)" },
    software: { os: "Custom Linux", middleware: "Tesla in-house", sdkLanguages: [], rosSupport: "none", vlaModel: "Optimus FSD-derived policy", teleopSupport: true, simulators: ["Tesla internal"] },
    commercial: { msrpUsd: null, streetUsd: null, leadTimeWeeks: null, warrantyMonths: 0, regions: ["US"], distribution: "research-only", spareAvailability: "none" },
    openSource: false, releaseYear: 2024,
    blurb: "Tesla's vertically-integrated humanoid. FSD compute, Tesla-designed actuators, 11-DoF dexterous hands, no external SDK.",
    resources: [
      { label: "Tesla AI Day overview", type: "video", url: "#" },
      { label: "Press kit", type: "link", url: "#" },
    ],
    priceHistory: series(30000, 14, 0.02, 0.005), accentHsl: "0 75% 60%",
  },
  {
    slug: "figure-02",
    name: "Figure 02", maker: "Figure", country: "US", status: "preorder", category: "humanoid",
    heightCm: 170, weightKg: 70, dof: 26, payloadKg: 20, walkSpeedMs: 1.2, runtimeMin: 300,
    engineering: { actuatorType: "Custom BLDC + planetary", peakJointTorqueNm: 250, legDoF: 12, armDoF: 6, handDoF: 16,
      bodyMaterial: "Aluminum + structural battery", commsBus: "EtherCAT", batteryV: 60, batteryWh: 2250, chargeTimeMin: 60 },
    compute: { primary: "Onboard NVIDIA + Figure inference module", tops: 275, ramGb: 32, storageGb: 1024 },
    sensors: { cameras: "6× RGB (head + chest + hands)", imu: "9-axis", microphones: 2, forceTorque: "wrist 6-axis" },
    software: { os: "Linux", middleware: "Figure proprietary", sdkLanguages: [], rosSupport: "none", vlaModel: "Helix (Figure VLA)", teleopSupport: true, simulators: ["Isaac Sim"] },
    commercial: { msrpUsd: 50000, streetUsd: null, leadTimeWeeks: 24, warrantyMonths: 12, regions: ["US","EU"], distribution: "preorder", spareAvailability: "low" },
    openSource: false, releaseYear: 2024,
    blurb: "Commercial humanoid for logistics & manufacturing. Helix VLA stack runs end-to-end vision→action onboard.",
    resources: [
      { label: "Figure homepage", type: "link", url: "https://www.figure.ai" },
      { label: "BMW pilot whitepaper", type: "pdf", url: "#" },
    ],
    priceHistory: series(60000, 14, 0.03, -0.012), accentHsl: "210 90% 60%",
  },
  {
    slug: "1x-neo",
    name: "NEO", maker: "1X", country: "NO", status: "preorder", category: "humanoid",
    heightCm: 165, weightKg: 30, dof: 22, payloadKg: 20, walkSpeedMs: 1.2, runtimeMin: 240,
    engineering: { actuatorType: "Tendon-driven, soft-body", peakJointTorqueNm: 70, legDoF: 12, armDoF: 6, handDoF: 4,
      bodyMaterial: "Knit textile + composite skeleton", commsBus: "CAN-FD", batteryV: 48, batteryWh: 700, chargeTimeMin: 60 },
    compute: { primary: "1X custom inference module", tops: 100, ramGb: 16, storageGb: 256 },
    sensors: { cameras: "Stereo RGB head", imu: "9-axis", microphones: 4 },
    software: { os: "Linux", middleware: "1X World Model", sdkLanguages: [], rosSupport: "none", vlaModel: "1X World Model (proprietary)", teleopSupport: true, simulators: ["1X internal"] },
    commercial: { msrpUsd: 20000, streetUsd: null, leadTimeWeeks: 52, warrantyMonths: 24, regions: ["US"], distribution: "preorder", spareAvailability: "none" },
    openSource: false, releaseYear: 2025,
    blurb: "Soft-bodied home humanoid. Tendon drives keep peak forces low for safe HRI; targets domestic chores.",
    resources: [
      { label: "1X NEO page", type: "link", url: "https://www.1x.tech" },
      { label: "Reservation FAQ", type: "pdf", url: "#" },
    ],
    priceHistory: series(20000, 12, 0.02, 0), accentHsl: "30 80% 60%",
  },
  {
    slug: "k-scale-stompy",
    name: "Stompy Mini", maker: "K-Scale Labs", country: "US", status: "shipping", category: "humanoid",
    heightCm: 110, weightKg: 18, dof: 21, payloadKg: 2, walkSpeedMs: 0.8, runtimeMin: 60,
    engineering: { actuatorType: "Robstride 03/04 QDD (open)", peakJointTorqueNm: 120, legDoF: 10, armDoF: 8, handDoF: 0,
      bodyMaterial: "CNC aluminum + 3D-printed shell", commsBus: "CAN-FD", batteryV: 24, batteryWh: 280, chargeTimeMin: 45 },
    compute: { primary: "Jetson Orin Nano 8GB", tops: 40, ramGb: 8, storageGb: 256, secondary: "Teensy 4.1 realtime" },
    sensors: { cameras: "Intel RealSense D435", imu: "BNO086 9-axis", microphones: 2 },
    software: { os: "Ubuntu 22.04", middleware: "K-Scale OS (Rust) + ROS 2 Humble bridge", sdkLanguages: ["Python","Rust","C++"], rosSupport: "community", vlaModel: "K-Bot policy + LeRobot Pi-Zero", teleopSupport: true, simulators: ["MuJoCo","Isaac Sim"] },
    commercial: { msrpUsd: 8999, streetUsd: 8999, leadTimeWeeks: 4, warrantyMonths: 6, regions: ["US","EU"], distribution: "direct", spareAvailability: "high" },
    openSource: true, releaseYear: 2025,
    blurb: "Fully open-source 1.1 m DIY humanoid. CAD, firmware, and BOM under MIT. Ships as kit or assembled.",
    resources: [
      { label: "K-Scale GitHub", type: "repo", url: "https://github.com/kscalelabs" },
      { label: "Assembly guide v3", type: "pdf", url: "#" },
      { label: "BOM (CSV)", type: "link", url: "#" },
      { label: "Build log playlist", type: "video", url: "#" },
    ],
    priceHistory: series(11000, 14, 0.05, -0.022), accentHsl: "75 85% 60%",
  },
  {
    slug: "hugging-face-reachy2",
    name: "Reachy 2", maker: "Pollen Robotics", country: "FR", status: "shipping", category: "wheeled-humanoid",
    heightCm: 140, weightKg: 30, dof: 17, payloadKg: 3, walkSpeedMs: 1.5, runtimeMin: 180,
    engineering: { actuatorType: "Dynamixel + custom shoulder", peakJointTorqueNm: 44, legDoF: 0, armDoF: 14, handDoF: 0,
      bodyMaterial: "Aluminum + 3D-printed shells", commsBus: "RS-485 + EtherCAT", batteryV: 48, batteryWh: 620, chargeTimeMin: 120 },
    compute: { primary: "Mini-PC (Intel Core i7) + Jetson Orin Nano", tops: 40, ramGb: 32, storageGb: 1024 },
    sensors: { cameras: "Stereo head + ZED 2i", lidar: "RPLIDAR S2 (mobile base)", imu: "9-axis", microphones: 4 },
    software: { os: "Ubuntu 22.04", middleware: "ROS 2 Humble + reachy2-sdk", sdkLanguages: ["Python"], rosSupport: "native", vlaModel: "LeRobot policies (Pi-Zero, ACT, Diffusion)", teleopSupport: true, simulators: ["MuJoCo","Gazebo"] },
    commercial: { msrpUsd: 70000, streetUsd: 70000, leadTimeWeeks: 12, warrantyMonths: 12, regions: ["EU","US"], distribution: "direct", spareAvailability: "medium" },
    openSource: true, releaseYear: 2024,
    blurb: "Open-source bi-manual mobile manipulator. First-class Hugging Face LeRobot integration; popular research base.",
    resources: [
      { label: "Reachy docs", type: "link", url: "https://docs.pollen-robotics.com" },
      { label: "LeRobot integration", type: "repo", url: "https://github.com/huggingface/lerobot" },
      { label: "Mechanical drawings", type: "pdf", url: "#" },
    ],
    priceHistory: series(75000, 14, 0.02, -0.008), accentHsl: "188 86% 53%",
  },
  {
    slug: "agility-digit",
    name: "Digit v4", maker: "Agility Robotics", country: "US", status: "shipping", category: "biped",
    heightCm: 175, weightKg: 65, dof: 20, payloadKg: 16, walkSpeedMs: 1.5, runtimeMin: 180, ipRating: "IP54",
    engineering: { actuatorType: "Cassie-lineage QDD + harmonic", peakJointTorqueNm: 220, legDoF: 12, armDoF: 4, handDoF: 0,
      bodyMaterial: "Aluminum + carbon fiber", commsBus: "EtherCAT", batteryV: 80, batteryWh: 1250, chargeTimeMin: 90 },
    compute: { primary: "Industrial x86 + Jetson Orin", tops: 100, ramGb: 32, storageGb: 1024 },
    sensors: { cameras: "4× RGB + perception head", lidar: "Velodyne Puck (option)", imu: "Tactical-grade 9-axis", forceTorque: "wrist + ankle 6-axis" },
    software: { os: "Ubuntu 22.04 + PREEMPT_RT", middleware: "Agility Arc OS + ROS 2 bridge", sdkLanguages: ["Python","C++"], rosSupport: "community", teleopSupport: true, simulators: ["AgilityCore","Isaac Sim"] },
    commercial: { msrpUsd: 250000, streetUsd: 250000, leadTimeWeeks: 16, warrantyMonths: 12, regions: ["US","EU"], distribution: "direct", spareAvailability: "high" },
    openSource: false, releaseYear: 2024,
    blurb: "Bipedal logistics robot deployed at scale at Amazon and GXO warehouses. Backwards-knee Cassie heritage.",
    resources: [
      { label: "Agility product page", type: "link", url: "https://agilityrobotics.com" },
      { label: "Operator manual", type: "pdf", url: "#" },
    ],
    priceHistory: series(280000, 14, 0.02, -0.01), accentHsl: "38 92% 60%",
  },
];

// Backwards-compat: many components still read robot.priceUsd
for (const r of robots) {
  (r as any).priceUsd = r.commercial.streetUsd ?? r.commercial.msrpUsd;
}

export const getRobot = (slug: string) => robots.find(r => r.slug === slug);
