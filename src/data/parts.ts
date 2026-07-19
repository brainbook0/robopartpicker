export type PartCategory = "actuator" | "hand" | "sensor" | "compute" | "driver" | "reducer";
export type Region = "US" | "EU" | "CN" | "JP" | "KR" | "Global";

type PricePoint = { date: string; price: number };
type SupplierOffer = { supplierId: string; price: number; stock: number; leadDays: number; moq: number; condition?: "new" | "refurb" };

type Base = {
  id: string;
  slug: string;
  category: PartCategory;
  name: string;
  maker: string;
  makerCountry: string;
  region: Region;
  blurb: string;
  tags: string[];
  openSource: boolean;
  datasheetUrl?: string;
  cadAvailable: boolean;
  rosSupport: "native" | "community" | "none";
  warrantyMonths: number;
  priceHistory: PricePoint[];
  offers: SupplierOffer[];
  failures: number;
  compatibility: string[]; // tags: e.g. "humanoid-arm", "shoulder", "biped-knee"
};

export type Actuator = Base & {
  category: "actuator";
  peakNm: number;
  contNm: number;
  speedRpm: number;
  voltageV: number;
  weightKg: number;
  torqueDensity: number; // Nm/kg
  backlashArcmin: number;
  encoderType: string;
  protocol: string;
  thermalLimitC: number;
  dutyCyclePct: number;
};
export type Hand = Base & {
  category: "hand";
  dof: number;
  actuatedDof: number;
  payloadKg: number;
  gripForceN: number;
  tactile: boolean;
  weightKg: number;
  interface: string;
  sdk: string;
  fingerReplaceCostUsd: number;
};
export type Sensor = Base & {
  category: "sensor";
  type: "depth" | "lidar" | "imu" | "tactile" | "rgb";
  rangeM: number;
  fovDeg: number;
  hz: number;
  resolution: string;
  weightKg: number;
  interface: string;
};
export type Compute = Base & {
  category: "compute";
  tops: number;
  ramGb: number;
  storageGb: number;
  ports: string;
  powerW: number;
  weightKg: number;
};
export type Driver = Base & {
  category: "driver";
  maxCurrentA: number;
  voltageV: number;
  protocols: string[];
  weightKg: number;
};
export type Reducer = Base & {
  category: "reducer";
  ratio: number;
  ratedTorqueNm: number;
  peakTorqueNm: number;
  backlashArcmin: number;
  weightKg: number;
  type: "harmonic" | "cycloidal" | "planetary";
};

export type Part = Actuator | Hand | Sensor | Compute | Driver | Reducer;

const ph = (base: number, points = 12, vol = 0.04, drift = 0): PricePoint[] => {
  const out: PricePoint[] = [];
  let p = base;
  const now = new Date();
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    p = Math.max(50, p * (1 + Math.sin(i * 1.3) * vol + drift));
    out.push({ date: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), price: Math.round(p) });
  }
  return out;
};

export const parts: Part[] = [
  // ----- ACTUATORS -----
  {
    id: "a-cm-rmd-x8", slug: "cubemars-rmd-x8-pro", category: "actuator",
    name: "RMD-X8 Pro", maker: "CubeMars", makerCountry: "CN", region: "CN",
    blurb: "Mid-cost QDD actuator popular in research humanoid legs.",
    tags: ["QDD","BLDC","leg","arm"], openSource: false, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 12,
    peakNm: 96, contNm: 32, speedRpm: 75, voltageV: 48, weightKg: 1.55,
    torqueDensity: 61.9, backlashArcmin: 4, encoderType: "absolute 14-bit",
    protocol: "CAN", thermalLimitC: 110, dutyCyclePct: 40,
    priceHistory: ph(840, 12, 0.03, -0.005),
    offers: [
      { supplierId: "s-cubemars", price: 799, stock: 23, leadDays: 10, moq: 1, condition: "new" },
      { supplierId: "s-vincross-parts", price: 749, stock: 4, leadDays: 18, moq: 1, condition: "new" },
    ],
    failures: 3, compatibility: ["humanoid-leg","biped-knee","biped-hip","quadruped"],
  },
  {
    id: "a-cm-rmd-x6", slug: "cubemars-rmd-x6", category: "actuator",
    name: "RMD-X6", maker: "CubeMars", makerCountry: "CN", region: "CN",
    blurb: "Compact mid-torque BLDC for arms and shoulders.",
    tags: ["BLDC","arm","shoulder"], openSource: false, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 12,
    peakNm: 45, contNm: 17, speedRpm: 145, voltageV: 48, weightKg: 0.85,
    torqueDensity: 52.9, backlashArcmin: 5, encoderType: "absolute 14-bit",
    protocol: "CAN", thermalLimitC: 110, dutyCyclePct: 40,
    priceHistory: ph(489, 12, 0.025, -0.003),
    offers: [
      { supplierId: "s-cubemars", price: 459, stock: 41, leadDays: 8, moq: 1, condition: "new" },
    ],
    failures: 2, compatibility: ["humanoid-arm","shoulder","elbow"],
  },
  {
    id: "a-mjbots-moteus-n1", slug: "mjbots-moteus-n1", category: "actuator",
    name: "moteus n1 servo", maker: "mjbots", makerCountry: "US", region: "US",
    blurb: "Open-source FOC actuator with excellent docs and clean CAN-FD API.",
    tags: ["BLDC","open-source","CAN-FD","arm"], openSource: true, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 6,
    peakNm: 18, contNm: 6, speedRpm: 230, voltageV: 44, weightKg: 0.43,
    torqueDensity: 41.9, backlashArcmin: 6, encoderType: "magnetic 14-bit",
    protocol: "CAN-FD", thermalLimitC: 105, dutyCyclePct: 50,
    priceHistory: ph(595, 12, 0.02, 0),
    offers: [
      { supplierId: "s-mjbots", price: 595, stock: 18, leadDays: 14, moq: 1, condition: "new" },
    ],
    failures: 0, compatibility: ["humanoid-arm","wrist","neck","gripper"],
  },
  {
    id: "a-unitree-a1", slug: "unitree-a1-motor", category: "actuator",
    name: "Unitree A1 motor", maker: "Unitree", makerCountry: "CN", region: "CN",
    blurb: "Low-cost QDD widely cloned, used in many DIY humanoid legs.",
    tags: ["QDD","leg","budget"], openSource: false, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 6,
    peakNm: 33, contNm: 11, speedRpm: 200, voltageV: 24, weightKg: 0.61,
    torqueDensity: 54.1, backlashArcmin: 7, encoderType: "magnetic 12-bit",
    protocol: "RS485", thermalLimitC: 95, dutyCyclePct: 30,
    priceHistory: ph(369, 12, 0.05, 0.005),
    offers: [
      { supplierId: "s-unitree", price: 349, stock: 60, leadDays: 21, moq: 1, condition: "new" },
      { supplierId: "s-anyrotor", price: 289, stock: 200, leadDays: 35, moq: 10, condition: "new" },
    ],
    failures: 11, compatibility: ["biped-knee","biped-hip","quadruped"],
  },
  {
    id: "a-dyn-xm540", slug: "dynamixel-xm540-w270", category: "actuator",
    name: "Dynamixel XM540-W270", maker: "Robotis", makerCountry: "KR", region: "KR",
    blurb: "Workhorse digital servo for arms and grippers.",
    tags: ["servo","arm","wrist","gripper"], openSource: false, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 12,
    peakNm: 12.9, contNm: 4.1, speedRpm: 30, voltageV: 24, weightKg: 0.165,
    torqueDensity: 78.2, backlashArcmin: 12, encoderType: "12-bit",
    protocol: "RS485", thermalLimitC: 80, dutyCyclePct: 50,
    priceHistory: ph(729, 12, 0.015, 0),
    offers: [
      { supplierId: "s-robotis", price: 729, stock: 35, leadDays: 10, moq: 1, condition: "new" },
    ],
    failures: 1, compatibility: ["humanoid-arm","wrist","gripper","neck"],
  },
  {
    id: "a-maxon-ec90", slug: "maxon-ec-90-flat", category: "actuator",
    name: "Maxon EC 90 Flat", maker: "Maxon", makerCountry: "CH", region: "EU",
    blurb: "Industrial-grade frameless BLDC used in serious humanoid joints.",
    tags: ["frameless","industrial","arm","leg"], openSource: false, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 24,
    peakNm: 8.5, contNm: 2.8, speedRpm: 3300, voltageV: 48, weightKg: 0.6,
    torqueDensity: 14.2, backlashArcmin: 0, encoderType: "external",
    protocol: "EtherCAT", thermalLimitC: 125, dutyCyclePct: 100,
    priceHistory: ph(890, 12, 0.01, 0),
    offers: [{ supplierId: "s-maxon", price: 890, stock: 8, leadDays: 28, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["humanoid-arm","humanoid-leg","industrial"],
  },
  {
    id: "a-unitree-b1", slug: "unitree-b1-motor", category: "actuator",
    name: "Unitree B1 hip motor", maker: "Unitree", makerCountry: "CN", region: "CN",
    blurb: "High-torque QDD for full-size humanoid hips.",
    tags: ["QDD","hip","leg"], openSource: false, cadAvailable: false,
    rosSupport: "community", warrantyMonths: 6,
    peakNm: 360, contNm: 120, speedRpm: 60, voltageV: 58, weightKg: 4.6,
    torqueDensity: 78.3, backlashArcmin: 3, encoderType: "magnetic 14-bit",
    protocol: "CAN", thermalLimitC: 110, dutyCyclePct: 35,
    priceHistory: ph(2200, 12, 0.04, -0.01),
    offers: [{ supplierId: "s-unitree", price: 1990, stock: 14, leadDays: 25, moq: 1, condition: "new" }],
    failures: 5, compatibility: ["biped-hip","humanoid-leg"],
  },
  {
    id: "a-tmotor-ak80", slug: "tmotor-ak80-9", category: "actuator",
    name: "T-Motor AK80-9", maker: "T-Motor", makerCountry: "CN", region: "CN",
    blurb: "Popular open-loop friendly QDD for legs and exoskeletons.",
    tags: ["QDD","leg","exo"], openSource: false, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 12,
    peakNm: 18, contNm: 9, speedRpm: 390, voltageV: 24, weightKg: 0.485,
    torqueDensity: 37.1, backlashArcmin: 4, encoderType: "magnetic 14-bit",
    protocol: "CAN", thermalLimitC: 100, dutyCyclePct: 40,
    priceHistory: ph(429, 12, 0.03, 0),
    offers: [{ supplierId: "s-cubemars", price: 419, stock: 50, leadDays: 10, moq: 1, condition: "new" }],
    failures: 4, compatibility: ["biped-knee","exo","quadruped","arm"],
  },
  {
    id: "a-odrive-d6374", slug: "odrive-d6374-150kv", category: "actuator",
    name: "ODrive D6374 150KV + Pro", maker: "ODrive", makerCountry: "US", region: "US",
    blurb: "Hobby/research direct-drive motor with ODrive Pro stack.",
    tags: ["BLDC","DIY","arm"], openSource: true, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 12,
    peakNm: 6, contNm: 2.5, speedRpm: 5400, voltageV: 56, weightKg: 0.815,
    torqueDensity: 7.4, backlashArcmin: 0, encoderType: "magnetic 14-bit",
    protocol: "CAN-FD", thermalLimitC: 100, dutyCyclePct: 60,
    priceHistory: ph(279, 12, 0.02, 0),
    offers: [{ supplierId: "s-odrive", price: 279, stock: 95, leadDays: 10, moq: 1, condition: "new" }],
    failures: 1, compatibility: ["arm","wrist","gripper"],
  },
  {
    id: "a-anyrotor-knee48", slug: "anyrotor-knee48", category: "actuator",
    name: "AnyRotor K48 knee", maker: "AnyRotor", makerCountry: "CN", region: "CN",
    blurb: "Budget knee actuator with frequent QC variance reports.",
    tags: ["QDD","budget","knee"], openSource: false, cadAvailable: false,
    rosSupport: "none", warrantyMonths: 3,
    peakNm: 80, contNm: 22, speedRpm: 80, voltageV: 48, weightKg: 1.9,
    torqueDensity: 42.1, backlashArcmin: 9, encoderType: "magnetic 12-bit",
    protocol: "CAN", thermalLimitC: 90, dutyCyclePct: 25,
    priceHistory: ph(259, 12, 0.08, -0.01),
    offers: [{ supplierId: "s-anyrotor", price: 239, stock: 300, leadDays: 35, moq: 10, condition: "new" }],
    failures: 17, compatibility: ["biped-knee"],
  },
  {
    id: "a-mjbots-moteus-c1", slug: "mjbots-moteus-c1", category: "actuator",
    name: "moteus c1 controller+motor", maker: "mjbots", makerCountry: "US", region: "US",
    blurb: "Compact open-source actuator for hands and wrists.",
    tags: ["open-source","wrist","gripper"], openSource: true, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 6,
    peakNm: 4, contNm: 1.4, speedRpm: 400, voltageV: 28, weightKg: 0.18,
    torqueDensity: 22.2, backlashArcmin: 8, encoderType: "magnetic 12-bit",
    protocol: "CAN-FD", thermalLimitC: 95, dutyCyclePct: 50,
    priceHistory: ph(229, 12, 0.02, 0),
    offers: [{ supplierId: "s-mjbots", price: 229, stock: 60, leadDays: 12, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["gripper","wrist","neck"],
  },
  {
    id: "a-cm-rmd-l9015", slug: "cubemars-rmd-l9015", category: "actuator",
    name: "RMD-L 9015", maker: "CubeMars", makerCountry: "CN", region: "CN",
    blurb: "Pancake-style BLDC for low-profile shoulders.",
    tags: ["pancake","shoulder"], openSource: false, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 12,
    peakNm: 8, contNm: 3, speedRpm: 600, voltageV: 24, weightKg: 0.255,
    torqueDensity: 31.4, backlashArcmin: 0, encoderType: "magnetic 14-bit",
    protocol: "CAN", thermalLimitC: 100, dutyCyclePct: 50,
    priceHistory: ph(199, 12, 0.025, 0),
    offers: [{ supplierId: "s-cubemars", price: 189, stock: 88, leadDays: 8, moq: 1, condition: "new" }],
    failures: 1, compatibility: ["shoulder","neck","wrist"],
  },
  // ----- HANDS -----
  {
    id: "h-psyonic-ability", slug: "psyonic-ability-hand", category: "hand",
    name: "Ability Hand", maker: "PSYONIC", makerCountry: "US", region: "US",
    blurb: "6-DOF compliant hand with tactile sensing, ROS2 SDK.",
    tags: ["compliant","tactile"], openSource: false, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 12,
    dof: 6, actuatedDof: 6, payloadKg: 11, gripForceN: 100,
    tactile: true, weightKg: 0.49, interface: "I2C/BLE/CAN", sdk: "C++/Python/ROS2",
    fingerReplaceCostUsd: 220,
    priceHistory: ph(8500, 12, 0.01, 0),
    offers: [{ supplierId: "s-psyonic", price: 8500, stock: 9, leadDays: 30, moq: 1, condition: "new" }],
    failures: 1, compatibility: ["humanoid-arm","wrist"],
  },
  {
    id: "h-inspire-rh56", slug: "inspire-rh56dfx", category: "hand",
    name: "Inspire RH56DFX", maker: "Inspire", makerCountry: "CN", region: "CN",
    blurb: "Affordable 6-DOF research hand used on many Chinese humanoids.",
    tags: ["research","budget"], openSource: false, cadAvailable: false,
    rosSupport: "community", warrantyMonths: 6,
    dof: 12, actuatedDof: 6, payloadKg: 5, gripForceN: 80,
    tactile: false, weightKg: 0.54, interface: "RS485/USB", sdk: "C++/Python",
    fingerReplaceCostUsd: 110,
    priceHistory: ph(3400, 12, 0.04, -0.01),
    offers: [{ supplierId: "s-inspire", price: 3200, stock: 22, leadDays: 30, moq: 1, condition: "new" }],
    failures: 4, compatibility: ["humanoid-arm","wrist"],
  },
  {
    id: "h-shadow-modular", slug: "shadow-modular-hand", category: "hand",
    name: "Shadow Modular Hand", maker: "Shadow Robot", makerCountry: "UK", region: "EU",
    blurb: "Research-grade tendon-driven hand, 24 DOF.",
    tags: ["tendon","research"], openSource: false, cadAvailable: false,
    rosSupport: "native", warrantyMonths: 12,
    dof: 24, actuatedDof: 20, payloadKg: 5, gripForceN: 60,
    tactile: true, weightKg: 4.2, interface: "EtherCAT", sdk: "ROS2",
    fingerReplaceCostUsd: 1800,
    priceHistory: ph(140000, 12, 0.01, 0),
    offers: [{ supplierId: "s-shadowrobot", price: 140000, stock: 1, leadDays: 90, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["humanoid-arm"],
  },
  {
    id: "h-allegro-v5", slug: "wonik-allegro-v5", category: "hand",
    name: "Allegro Hand v5", maker: "Wonik", makerCountry: "KR", region: "KR",
    blurb: "4-finger research hand commonly used in manipulation research.",
    tags: ["research"], openSource: false, cadAvailable: false,
    rosSupport: "community", warrantyMonths: 12,
    dof: 16, actuatedDof: 16, payloadKg: 1.5, gripForceN: 50,
    tactile: false, weightKg: 1.08, interface: "CAN", sdk: "C++",
    fingerReplaceCostUsd: 1200,
    priceHistory: ph(18500, 12, 0.01, 0),
    offers: [{ supplierId: "s-allegrohand", price: 18500, stock: 3, leadDays: 60, moq: 1, condition: "new" }],
    failures: 2, compatibility: ["humanoid-arm"],
  },
  {
    id: "h-leap-v1", slug: "leap-hand-v1", category: "hand",
    name: "LEAP Hand v1", maker: "CMU Open-Source", makerCountry: "US", region: "US",
    blurb: "Open-source low-cost research hand built around Dynamixel servos.",
    tags: ["open-source","research"], openSource: true, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 0,
    dof: 16, actuatedDof: 16, payloadKg: 2, gripForceN: 40,
    tactile: false, weightKg: 0.6, interface: "RS485", sdk: "Python/ROS2",
    fingerReplaceCostUsd: 80,
    priceHistory: ph(2000, 12, 0.02, 0),
    offers: [{ supplierId: "s-robotis", price: 2000, stock: 999, leadDays: 14, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["humanoid-arm","DIY"],
  },
  // ----- SENSORS -----
  {
    id: "se-rs-d455", slug: "intel-realsense-d455", category: "sensor",
    name: "RealSense D455", maker: "Intel", makerCountry: "US", region: "Global",
    blurb: "Stereo depth + IMU camera widely used in humanoid perception.",
    tags: ["depth","head"], openSource: false, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 12,
    type: "depth", rangeM: 20, fovDeg: 87, hz: 90, resolution: "1280x720",
    weightKg: 0.39, interface: "USB3",
    priceHistory: ph(419, 12, 0.03, 0.01),
    offers: [{ supplierId: "s-realsense", price: 419, stock: 41, leadDays: 7, moq: 1, condition: "new" }],
    failures: 2, compatibility: ["head","torso"],
  },
  {
    id: "se-zed-x", slug: "stereolabs-zed-x", category: "sensor",
    name: "ZED X", maker: "Stereolabs", makerCountry: "FR", region: "Global",
    blurb: "GMSL2 depth+RGB designed for robotics integration.",
    tags: ["depth","GMSL"], openSource: false, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 12,
    type: "depth", rangeM: 35, fovDeg: 110, hz: 60, resolution: "1920x1200",
    weightKg: 0.166, interface: "GMSL2",
    priceHistory: ph(1499, 12, 0.02, 0),
    offers: [{ supplierId: "s-zed", price: 1499, stock: 12, leadDays: 7, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["head","wrist"],
  },
  {
    id: "se-livox-mid360", slug: "livox-mid-360", category: "sensor",
    name: "Livox Mid-360", maker: "Livox", makerCountry: "CN", region: "CN",
    blurb: "Hemispherical solid-state LiDAR for humanoid head perception.",
    tags: ["lidar"], openSource: false, cadAvailable: false,
    rosSupport: "community", warrantyMonths: 12,
    type: "lidar", rangeM: 70, fovDeg: 360, hz: 10, resolution: "200k pts/s",
    weightKg: 0.265, interface: "Ethernet",
    priceHistory: ph(849, 12, 0.04, -0.01),
    offers: [{ supplierId: "s-livox", price: 799, stock: 18, leadDays: 21, moq: 1, condition: "new" }],
    failures: 1, compatibility: ["head","torso"],
  },
  // ----- COMPUTE -----
  {
    id: "c-jetson-orin-64", slug: "nvidia-jetson-agx-orin-64", category: "compute",
    name: "Jetson AGX Orin 64GB", maker: "NVIDIA", makerCountry: "US", region: "Global",
    blurb: "Standard humanoid AI compute module, 275 TOPS.",
    tags: ["AI","compute"], openSource: false, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 24,
    tops: 275, ramGb: 64, storageGb: 64, ports: "USB3 x4, GbE, PCIe x4", powerW: 60,
    weightKg: 0.7,
    priceHistory: ph(1999, 12, 0.02, 0),
    offers: [{ supplierId: "s-nvidia", price: 1999, stock: 25, leadDays: 14, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["torso","head"],
  },
  {
    id: "c-jetson-orin-nx", slug: "nvidia-jetson-orin-nx-16", category: "compute",
    name: "Jetson Orin NX 16GB", maker: "NVIDIA", makerCountry: "US", region: "Global",
    blurb: "Mid-tier compute for arms, perception subsystems.",
    tags: ["AI","compute","subsystem"], openSource: false, cadAvailable: true,
    rosSupport: "native", warrantyMonths: 24,
    tops: 100, ramGb: 16, storageGb: 0, ports: "USB3 x4, GbE, PCIe x2", powerW: 25,
    weightKg: 0.18,
    priceHistory: ph(699, 12, 0.02, 0),
    offers: [{ supplierId: "s-nvidia", price: 699, stock: 60, leadDays: 14, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["torso","arm"],
  },
  // ----- DRIVERS -----
  {
    id: "d-moteus-pi3hat", slug: "mjbots-pi3hat-r4-5", category: "driver",
    name: "pi3hat r4.5", maker: "mjbots", makerCountry: "US", region: "US",
    blurb: "Raspberry Pi HAT bridging 5 CAN-FD buses for moteus controllers.",
    tags: ["CAN-FD","bridge"], openSource: true, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 6,
    maxCurrentA: 0, voltageV: 5, protocols: ["CAN-FD"], weightKg: 0.085,
    priceHistory: ph(199, 12, 0.01, 0),
    offers: [{ supplierId: "s-mjbots", price: 199, stock: 80, leadDays: 12, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["torso"],
  },
  {
    id: "d-odrive-pro", slug: "odrive-pro-s1", category: "driver",
    name: "ODrive Pro S1", maker: "ODrive", makerCountry: "US", region: "US",
    blurb: "Single-axis 80V FOC controller for high-power BLDCs.",
    tags: ["FOC","high-voltage"], openSource: false, cadAvailable: true,
    rosSupport: "community", warrantyMonths: 12,
    maxCurrentA: 80, voltageV: 80, protocols: ["CAN-FD","USB"], weightKg: 0.16,
    priceHistory: ph(309, 12, 0.02, 0),
    offers: [{ supplierId: "s-odrive", price: 309, stock: 70, leadDays: 10, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["arm","leg"],
  },
  // ----- REDUCERS -----
  {
    id: "r-hd-csd-25", slug: "harmonic-csd-25-100", category: "reducer",
    name: "CSD-25 100:1", maker: "Harmonic Drive", makerCountry: "JP", region: "JP",
    blurb: "Premium harmonic reducer used in industrial-grade humanoid joints.",
    tags: ["harmonic","zero-backlash"], openSource: false, cadAvailable: true,
    rosSupport: "none", warrantyMonths: 12,
    ratio: 100, ratedTorqueNm: 76, peakTorqueNm: 217, backlashArcmin: 0.5,
    weightKg: 0.66, type: "harmonic",
    priceHistory: ph(1290, 12, 0.015, 0),
    offers: [{ supplierId: "s-harmonic", price: 1290, stock: 5, leadDays: 60, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["humanoid-arm","shoulder","elbow"],
  },
  {
    id: "r-leader-lhd-25", slug: "leaderdrive-lhd-25-100", category: "reducer",
    name: "LHD-25 100:1", maker: "Leader Drive", makerCountry: "CN", region: "CN",
    blurb: "Lower-cost harmonic clone with wider QC distribution.",
    tags: ["harmonic","budget"], openSource: false, cadAvailable: false,
    rosSupport: "none", warrantyMonths: 6,
    ratio: 100, ratedTorqueNm: 73, peakTorqueNm: 195, backlashArcmin: 1.2,
    weightKg: 0.71, type: "harmonic",
    priceHistory: ph(429, 12, 0.04, -0.01),
    offers: [{ supplierId: "s-leaderdrive", price: 399, stock: 24, leadDays: 30, moq: 5, condition: "new" }],
    failures: 6, compatibility: ["humanoid-arm","shoulder","elbow"],
  },
  {
    id: "r-nab-rv25", slug: "nabtesco-rv-25e", category: "reducer",
    name: "RV-25E", maker: "Nabtesco", makerCountry: "JP", region: "JP",
    blurb: "Cycloidal reducer for high-torque hip joints.",
    tags: ["cycloidal","hip"], openSource: false, cadAvailable: true,
    rosSupport: "none", warrantyMonths: 12,
    ratio: 100, ratedTorqueNm: 245, peakTorqueNm: 612, backlashArcmin: 1,
    weightKg: 2.1, type: "cycloidal",
    priceHistory: ph(1850, 12, 0.02, 0),
    offers: [{ supplierId: "s-nabtesco", price: 1850, stock: 3, leadDays: 70, moq: 1, condition: "new" }],
    failures: 0, compatibility: ["biped-hip","humanoid-leg"],
  },
];

export const partsByCategory = (cat: PartCategory) => parts.filter(p => p.category === cat);
export const partBySlug = (slug: string) => parts.find(p => p.slug === slug);
export const partById = (id: string) => parts.find(p => p.id === id);

export const lowestPrice = (p: Part) => p.offers.reduce((m, o) => Math.min(m, o.price), Infinity);
export const priceDelta30 = (p: Part) => {
  const h = p.priceHistory;
  if (h.length < 2) return 0;
  const prev = h[h.length - 2].price;
  const cur = h[h.length - 1].price;
  return ((cur - prev) / prev) * 100;
};
export const categoryLabel: Record<PartCategory,string> = {
  actuator: "Actuators", hand: "Hands", sensor: "Sensors",
  compute: "Compute", driver: "Motor Drivers", reducer: "Reducers",
};
