export type Supplier = {
  id: string;
  slug: string;
  name: string;
  website: string;
  region: "US" | "EU" | "CN" | "JP" | "KR" | "Global";
  categories: string[];
  moq: number;
  leadDays: number;
  verified: boolean;
  claimed: boolean;
  warranty: string;
  docScore: number; // 0-100
  interfaces: string[];
  reviews: { rating: number; count: number };
  notes?: string;
};

export const suppliers: Supplier[] = [
  { id: "s-unitree", slug: "unitree", name: "Unitree Robotics", website: "https://www.unitree.com", region: "CN", categories: ["actuator","hand","robot"], moq: 1, leadDays: 21, verified: true, claimed: true, warranty: "12 mo", docScore: 78, interfaces: ["CAN","RS485"], reviews: { rating: 4.2, count: 312 } },
  { id: "s-cubemars", slug: "cubemars", name: "CubeMars (T-Motor)", website: "https://www.cubemars.com", region: "CN", categories: ["actuator","driver"], moq: 1, leadDays: 10, verified: true, claimed: true, warranty: "12 mo", docScore: 84, interfaces: ["CAN","CAN-FD","RS485"], reviews: { rating: 4.4, count: 921 } },
  { id: "s-mjbots", slug: "mjbots", name: "mjbots Robotic Systems", website: "https://mjbots.com", region: "US", categories: ["actuator","driver","compute"], moq: 1, leadDays: 14, verified: true, claimed: true, warranty: "6 mo", docScore: 92, interfaces: ["CAN-FD"], reviews: { rating: 4.7, count: 184 } },
  { id: "s-shadowrobot", slug: "shadow-robot", name: "Shadow Robot Company", website: "https://www.shadowrobot.com", region: "EU", categories: ["hand"], moq: 1, leadDays: 90, verified: true, claimed: true, warranty: "12 mo", docScore: 88, interfaces: ["EtherCAT","ROS2"], reviews: { rating: 4.5, count: 47 } },
  { id: "s-inspire", slug: "inspire-robots", name: "Inspire Robots", website: "https://www.inspire-robots.com", region: "CN", categories: ["hand"], moq: 1, leadDays: 30, verified: true, claimed: false, warranty: "6 mo", docScore: 62, interfaces: ["RS485","USB"], reviews: { rating: 3.9, count: 124 } },
  { id: "s-realsense", slug: "intel-realsense", name: "Intel RealSense (Resold)", website: "https://www.intelrealsense.com", region: "Global", categories: ["sensor"], moq: 1, leadDays: 7, verified: true, claimed: false, warranty: "12 mo", docScore: 90, interfaces: ["USB3"], reviews: { rating: 4.3, count: 1820 } },
  { id: "s-nvidia", slug: "nvidia-jetson", name: "NVIDIA Jetson (Authorized)", website: "https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/", region: "Global", categories: ["compute"], moq: 1, leadDays: 14, verified: true, claimed: true, warranty: "24 mo", docScore: 95, interfaces: ["PCIe","USB3","GbE"], reviews: { rating: 4.6, count: 2100 } },
  { id: "s-odrive", slug: "odrive", name: "ODrive Robotics", website: "https://odriverobotics.com", region: "US", categories: ["driver","actuator"], moq: 1, leadDays: 10, verified: true, claimed: true, warranty: "12 mo", docScore: 86, interfaces: ["CAN-FD","USB"], reviews: { rating: 4.5, count: 540 } },
  { id: "s-harmonic", slug: "harmonic-drive", name: "Harmonic Drive LLC", website: "https://www.harmonicdrive.net", region: "JP", categories: ["reducer"], moq: 1, leadDays: 60, verified: true, claimed: true, warranty: "12 mo", docScore: 93, interfaces: [], reviews: { rating: 4.8, count: 88 } },
  { id: "s-nabtesco", slug: "nabtesco", name: "Nabtesco Precision", website: "https://precision.nabtesco.com", region: "JP", categories: ["reducer"], moq: 1, leadDays: 70, verified: true, claimed: false, warranty: "12 mo", docScore: 88, interfaces: [], reviews: { rating: 4.7, count: 41 } },
  { id: "s-leaderdrive", slug: "leaderdrive", name: "Leader Drive", website: "https://www.leaderdrive.com", region: "CN", categories: ["reducer"], moq: 5, leadDays: 30, verified: true, claimed: false, warranty: "6 mo", docScore: 64, interfaces: [], reviews: { rating: 4.0, count: 132 } },
  { id: "s-robotis", slug: "robotis", name: "Robotis (Dynamixel)", website: "https://www.robotis.us", region: "KR", categories: ["actuator"], moq: 1, leadDays: 10, verified: true, claimed: true, warranty: "12 mo", docScore: 91, interfaces: ["RS485","TTL"], reviews: { rating: 4.4, count: 2400 } },
  { id: "s-moteus", slug: "moteus", name: "Moteus / mjbots Pi3hat", website: "https://mjbots.com/collections/moteus", region: "US", categories: ["driver"], moq: 1, leadDays: 12, verified: true, claimed: true, warranty: "6 mo", docScore: 88, interfaces: ["CAN-FD"], reviews: { rating: 4.6, count: 210 } },
  { id: "s-zed", slug: "stereolabs", name: "Stereolabs (ZED)", website: "https://www.stereolabs.com", region: "Global", categories: ["sensor"], moq: 1, leadDays: 7, verified: true, claimed: true, warranty: "12 mo", docScore: 88, interfaces: ["USB3"], reviews: { rating: 4.4, count: 980 } },
  { id: "s-livox", slug: "livox", name: "Livox (DJI)", website: "https://www.livoxtech.com", region: "CN", categories: ["sensor"], moq: 1, leadDays: 21, verified: true, claimed: false, warranty: "12 mo", docScore: 76, interfaces: ["Ethernet"], reviews: { rating: 4.2, count: 320 } },
  { id: "s-allegrohand", slug: "wonik", name: "Wonik Robotics", website: "https://www.wonikrobotics.com", region: "KR", categories: ["hand"], moq: 1, leadDays: 60, verified: true, claimed: false, warranty: "12 mo", docScore: 70, interfaces: ["CAN"], reviews: { rating: 4.0, count: 28 } },
  { id: "s-psyonic", slug: "psyonic", name: "PSYONIC", website: "https://www.psyonic.io", region: "US", categories: ["hand"], moq: 1, leadDays: 30, verified: true, claimed: true, warranty: "12 mo", docScore: 84, interfaces: ["I2C","BLE","CAN"], reviews: { rating: 4.5, count: 96 } },
  { id: "s-anyrotor", slug: "anyrotor", name: "AnyRotor BLDC Co.", website: "https://www.anyrotor.example", region: "CN", categories: ["actuator"], moq: 10, leadDays: 35, verified: false, claimed: false, warranty: "3 mo", docScore: 40, interfaces: ["CAN"], reviews: { rating: 3.6, count: 22 }, notes: "Frequent spec mismatch reports." },
  { id: "s-maxon", slug: "maxon", name: "Maxon Group", website: "https://www.maxongroup.com", region: "EU", categories: ["actuator","driver"], moq: 1, leadDays: 28, verified: true, claimed: true, warranty: "24 mo", docScore: 96, interfaces: ["EtherCAT","CANopen"], reviews: { rating: 4.7, count: 540 } },
  { id: "s-vincross", slug: "vincross-parts", name: "Vincross Parts", website: "https://www.vincross.com", region: "CN", categories: ["actuator","sensor"], moq: 1, leadDays: 20, verified: false, claimed: false, warranty: "6 mo", docScore: 55, interfaces: ["CAN","USB"], reviews: { rating: 3.8, count: 64 } },
];

export const supplierBySlug = (slug: string) => suppliers.find(s => s.slug === slug);
