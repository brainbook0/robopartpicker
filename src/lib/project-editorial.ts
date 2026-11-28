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
    {
      heading: "Where to buy the parts (by region)",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The repository publishes per-part purchase links for four regions, and the same servo is listed at a different price in each. One STS3215 is about US$13.89, €12.2, ¥97.72 or ¥2,980 depending on where you buy.",
            },
          ],
        },
        {
          type: "ul",
          items: [
            [{ text: "US — one follower arm ≈ US$121.94; the leader + follower set ≈ US$229.88." }],
            [{ text: "EU — the leader + follower set ≈ €226.3." }],
            [{ text: "China — the leader + follower set ≈ ¥1,343.16." }],
            [{ text: "Japan — the leader + follower set ≈ ¥44,530." }],
          ],
        },
        {
          type: "p",
          segments: [
            { text: "The full per-part links by region are in the " },
            { text: "upstream sourcing tables", href: "https://github.com/TheRobotStudio/SO-ARM100#sourcing-parts" },
            { text: " (Apache-2.0, retrieved 2026-11-14). These are the repository's own list prices, not observed supplier quotes — the per-part catalogue prices further up this page are the observed ones." },
          ],
        },
      ],
    },
    {
      heading: "Pre-built kits and printed frames",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "If you would rather not source the parts and print the frame yourself, the project links third-party kits that cover different levels of assembly:",
            },
          ],
        },
        {
          type: "ul",
          items: [
            [{ text: "Seeed Studio — low-cost kit that includes the 3D-printed parts." }],
            [{ text: "WowRobo — a parts kit and a fully assembled version." }],
            [{ text: "RobotEd (Switzerland) — printed frame kit, electronics kit, or a complete arm." }],
            [{ text: "Robonine — a parts kit bundled with a wrist camera and an ArUco cube." }],
            [{ text: "PartaBot (US) — assembled arms; also sells LeKiwi and Koch robots." }],
            [{ text: "ForgeMotion Labs (US) — printed frame kit, electronics kit, or a complete arm." }],
            [{ text: "RoboSEasy (South Korea), NeoBot (China), Autodiscovery (EU) — regional sellers." }],
            [{ text: "Phospho — an SO-100 follower-arm kit without a leader, aimed at VR-headset teleoperation." }],
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Vendor links are listed in the " },
            { text: "repository's kits section", href: "https://github.com/TheRobotStudio/SO-ARM100#kits" },
            { text: "." },
          ],
        },
      ],
    },
    {
      heading: "Extending the arm",
      blocks: [
        {
          type: "ul",
          items: [
            [{ text: "XLeRobot — a dual-arm mobile robot built from 2× SO-101 arms plus a LeKiwi base, a 300 Wh battery, two wrist cameras and a head camera; the project quotes US$660 in total." }],
            [{ text: "AnySkin tactile sensing — adds touch to the gripper (sold by WOWROBO)." }],
            [{ text: "Camera mounts — an overhead mount (webcam or 32×32 UVC module) and wrist mounts for 32×32 UVC modules, RealSense D405 and D435/D435i, or a webcam." }],
            [{ text: "Compliant gripper — a TPU 95A finger on a PLA base for a softer, higher-friction grasp (two extra M3 screws, optional gripper tape)." }],
            [{ text: "Base mounts — a raised leader base, a 4040 aluminium-profile mount, and a print-alignment jig." }],
          ],
        },
        {
          type: "p",
          segments: [
            { text: "The optional-hardware STL files and build notes are in the repository's " },
            { text: "add-ons section", href: "https://github.com/TheRobotStudio/SO-ARM100#optional-hardware" },
            { text: " (Apache-2.0)." },
          ],
        },
      ],
    },
    {
      heading: "Checking the servos",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The servos are configured through the LeRobot library, so no separate tool is required to build the arm. For bench debugging, Feetech's own software runs on Windows and the open-source FT_SCServo_Debug_Qt on Ubuntu.",
            },
          ],
        },
      ],
    },
  ],
  "mobile-aloha": [
    {
      heading: "What Mobile ALOHA is",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "Mobile ALOHA is Stanford's low-cost whole-body teleoperation system for bimanual mobile manipulation (Fu, Zhao and Finn, CoRL 2024). It extends the ALOHA system with a wheeled mobile base and a whole-body teleoperation interface, and is used to collect demonstrations for imitation learning — the paper reports that co-training with existing static ALOHA data raises success rates on mobile tasks by up to 90%.",
            },
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Source: " },
            { text: "mobile-aloha.github.io", href: "https://mobile-aloha.github.io/" },
            { text: " and the " },
            { text: "MarkFzp/mobile-aloha", href: "https://github.com/MarkFzp/mobile-aloha" },
            { text: " repository." },
          ],
        },
      ],
    },
    {
      heading: "Hardware the project uses (from its README)",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The public repository documents how to wire and run the hardware, but does not publish a priced parts list. What it states:",
            },
          ],
        },
        {
          type: "ul",
          items: [
            [{ text: "Two leader (master) arms and two follower (puppet) arms — four Interbotix arms in total, each with 9 Dynamixel motors (36 motors across the four)." }],
            [{ text: "The follower wrist and gripper motor is a Dynamixel XM430-W350; the README sets its current limit to 300 to protect the gripper." }],
            [{ text: "Mobile base: an AgileX Tracer, driven over CAN with the pyagxrobots SDK." }],
            [{ text: "Three cameras: left wrist, right wrist and an overhead (high) view." }],
            [{ text: "Software: ROS 1 Noetic on Ubuntu 18.04 or 20.04 (ROS 2 support is still in progress)." }],
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Source: " },
            { text: "MarkFzp/mobile-aloha README", href: "https://github.com/MarkFzp/mobile-aloha" },
            { text: " (retrieved 2026-11-15)." },
          ],
        },
      ],
    },
    {
      heading: "Why there is no bill of materials here yet",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "Mobile ALOHA's hardware is assembled from commercial arms and a commercial mobile base rather than a printed kit with a published parts list, and the repository ships the control software and gripper CAD but not a priced BOM. So this entry lists no resolved BOM lines: what the project documents is how to wire and operate the hardware, not what each part costs. Any per-part price should be checked against the component pages and the suppliers themselves.",
            },
          ],
        },
      ],
    },
  ],
  "nasa-jpl-open-source-rover": [
    {
      heading: "The JPL Open Source Rover at a glance",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The Open Source Rover (OSR) is NASA JPL's build-it-yourself, scaled-down version of the six-wheel rover design JPL uses on Mars. It has been public since 2017 and is built entirely from consumer off-the-shelf (COTS) parts — the base build needs no metal machining. JPL frames it as a teaching and learning platform for mechanical engineering, electronics, software and robotics that doubles as a research platform for rugged terrain; no prior skills are assumed. It is Apache-2.0 licensed and Open Source Hardware certified (US002551).",
            },
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Source: " },
            { text: "nasa-jpl/open-source-rover", href: "https://github.com/nasa-jpl/open-source-rover" },
            { text: " README (Apache-2.0, retrieved 2026-11-26)." },
          ],
        },
      ],
    },
    {
      heading: "The specs the project publishes",
      blocks: [
        {
          type: "ul",
          items: [
            [{ text: "Top speed — about 1.6 m/s (a slow run; it varies with the motor you choose)." }],
            [{ text: "Motors — 10." }],
            [{ text: "Structural material — aluminium." }],
            [
              {
                text: "Total cost — the project's own figure is about US$1,600, which it notes is roughly the cost of a TurtleBot 3 Waffle.",
              },
            ],
          ],
        },
        {
          type: "p",
          segments: [
            {
              text: "Those are the repository's figures, not supplier quotes; the observed per-part catalogue prices appear separately above.",
            },
          ],
        },
      ],
    },
    {
      heading: "How it drives",
      blocks: [
        {
          type: "ul",
          items: [
            [
              {
                text: "Rocker-Bogie suspension — keeps all six wheels in contact with the ground while climbing obstacles.",
              },
            ],
            [
              {
                text: "Differential pivot — mechanically offloads weight from one side of the rover to the other while climbing.",
              },
            ],
            [
              {
                text: "Six-wheel Ackermann steering — sets where the wheels point and how fast each one turns.",
              },
            ],
          ],
        },
      ],
    },
    {
      heading: "Parts and cost",
      blocks: [
        {
          type: "p",
          segments: [
            { text: "The mechanical assembly is built mostly from " },
            { text: "GoBilda", href: "https://www.gobilda.com" },
            { text: " parts; the full parts list lives in the repository's " },
            {
              text: "parts_list",
              href: "https://github.com/nasa-jpl/open-source-rover/tree/master/parts_list",
            },
            {
              text: ". Educational builders can apply through the repository for a 15% GoBilda discount. You can fit higher-RPM motors for more speed at the cost of stall torque — the README points at the GoBilda 5203 series — and the design accommodates different wheel sizes.",
            },
          ],
        },
      ],
    },
    {
      heading: "Build roadmap and effort",
      blocks: [
        {
          type: "ul",
          items: [
            [{ text: "Stage 1 — order the parts (the README starts here because lead times are long)." }],
            [{ text: "Stage 2 — build the wiring, which has to exist before the mechanical assemblies." }],
            [{ text: "Stage 3 — make (solder) the electronics and the printed circuit board." }],
            [
              {
                text: "Stage 4 — build the mechanical assemblies: body, two rocker-bogies, and the drive and corner motor assemblies.",
              },
            ],
            [{ text: "Stage 5 — set up the operating system and the rover code on the Raspberry Pi." }],
          ],
        },
        {
          type: "p",
          segments: [
            {
              text: "JPL's own estimate is no less than 100 person-hours to build, and the repository says the base version needs no metal machining — only basic fabrication skills for the optional expansions.",
            },
          ],
        },
      ],
    },
    {
      heading: "Tools you will need",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "Mandatory: metric hex keys, pliers, wire snips and strippers, a soldering iron, solder and a digital multimeter. Optional: a 3D printer, a laser cutter (the body plates can also be ordered cut), a benchtop power supply for testing without the battery, and the usual Raspberry Pi peripherals.",
            },
          ],
        },
      ],
    },
    {
      heading: "The brain, the code and the battery",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "A Raspberry Pi is the rover's brain, chosen so it is easy to add, change and upgrade — any method of talking to a Pi (Bluetooth, WiFi, USB) can be wired into the control system, and the rover runs ROS. The software lives in the separate ",
            },
            { text: "osr-rover-code", href: "https://github.com/nasa-jpl/osr-rover-code" },
            {
              text: " repository, with step-by-step setup. On a 7.2 Ah battery the project reports at least three hours of driving on rough terrain; the rover shuts down when the pack falls below about 13–14 V, and you can extend range with a bigger or swappable battery.",
            },
          ],
        },
      ],
    },
    {
      heading: "Community, CAD and alternatives",
      blocks: [
        {
          type: "ul",
          items: [
            [
              {
                text: "A community Slack group for builders and modifications — run by the public, with JPL and Caltech noting no official affiliation.",
              },
            ],
            [{ text: "A live 3D model of the latest rover, viewable in a browser on OnShape." }],
            [
              {
                text: "Cheaper Mars-rover replicas the project links to: Sawppy Rover, ESA ExoMy, and a 3D-printed Curiosity/Perseverance-inspired rover.",
              },
            ],
          ],
        },
      ],
    },
  ],
  "xlerobot": [
    {
      heading: "XLeRobot at a glance",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "XLeRobot is a low-cost dual-arm mobile household robot from Gaotian (Vector) Wang's RobotPi Lab at Rice University, built as a personal project to give anyone a cheap platform for embodied AI. It stands on four other open projects: the two arms are SO-100/SO-101 arms from The RobotStudio, the wheeled base follows LeKiwi, and the low-cost electronics follow Bambot; the whole thing runs on Hugging Face's LeRobot stack. The current design is XLeRobot 0.2.0, described by the author as the first version fully capable of autonomous household tasks.",
            },
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Source: " },
            { text: "Vector-Wangel/XLeRobot README", href: "https://github.com/Vector-Wangel/XLeRobot" },
            { text: " (Apache-2.0, retrieved 2026-11-26)." },
          ],
        },
      ],
    },
    {
      heading: "What the project says it costs",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "These are the repository's own figures for buying the parts yourself. They exclude 3D printing, tools, shipping and taxes, and they are the project's numbers, not supplier quotes; the observed per-part catalogue prices appear separately on this page.",
            },
          ],
        },
        {
          type: "ul",
          items: [
            [{ text: "Basic build — use your own laptop and a single RGB head camera: about US$660 / €680 / ¥3,999 / ₹87,000." }],
            [{ text: "Add a stereo dual-eye RGB head camera: +US$30." }],
            [{ text: "Add a Raspberry Pi: +US$79." }],
            [{ text: "Add an Intel RealSense RGBD head camera: +US$220." }],
          ],
        },
      ],
    },
    {
      heading: "Kits and documentation",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "A developer assembly kit (excluding the battery and the IKEA cart base) is offered in collaboration with WowRobo: around US$579 worldwide or ¥3,699 in China. The author states the project is non-profit and that he earns nothing from kit sales.",
            },
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Build order, printing files and software are in the " },
            { text: "XLeRobot documentation", href: "https://xlerobot.readthedocs.io/en/latest/index.html" },
            {
              text: ": buy the parts from the materials list, print the frame, assemble (the author quotes under four hours in total), then run the LeRobot software. A dual-wheel base was released in December 2025 as a more stable and cheaper alternative to the default base.",
            },
          ],
        },
      ],
    },
    {
      heading: "Simulation and teleoperation",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The project ships URDFs and control scripts for simulation and teleoperation — keyboard, Xbox controller, Switch Joy-Con or Quest 3 VR — alongside a MuJoCo plus 3D Gaussian Splatting demo that runs in the browser.",
            },
          ],
        },
      ],
    },
  ],
  "openbot": [
    {
      heading: "OpenBot at a glance",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "OpenBot makes a smartphone the brain of a small, low-cost wheeled robot. The project supplies a 3D-printable robot body, microcontroller firmware and an app, so the phone does the sensing, compute and control while the printed body supplies the motors and drivetrain. It started at Intel's Intelligent Systems Lab and is now maintained by the OpenBot organisation under the MIT licence; it was published at ICRA 2021 by Matthias Müller and Vladlen Koltun.",
            },
          ],
        },
        {
          type: "p",
          segments: [
            { text: "Source: " },
            { text: "ob-f/OpenBot", href: "https://github.com/ob-f/OpenBot" },
            { text: " README (MIT, retrieved 2026-11-28)." },
          ],
        },
      ],
    },
    {
      heading: "What the project says it costs",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The repository states the robot body costs about US$50 in parts and is assembled from low-cost, readily available hobby hardware around a microcontroller such as an Arduino Nano. That is the project's own figure for the body only: the phone, tools and printing your own parts are separate, and the observed per-part catalogue prices on this page are supplier offers, not the project's estimate.",
            },
          ],
        },
      ],
    },
    {
      heading: "The body options",
      blocks: [
        {
          type: "ul",
          items: [
            [{ text: "DIY: the original 3D-printed wheeled body, built on low-cost hobby hardware." }],
            [{ text: "Lite: a smaller, simplified variant developed for education." }],
            [
              {
                text: "Compact: a compact 3D-printed body for an ESP32 with an L298N motor driver; every part prints on a 180 mm printer and the lid is LEGO-compatible.",
              },
            ],
            [{ text: "RC-Truck: a 3D-printed body that drops onto an off-the-shelf 1:16 RC truck." }],
            [{ text: "Multi-Terrain Vehicle: blueprints for a general-purpose outdoor platform using the same framework." }],
            [{ text: "Ready-to-run: the RTR-TT and RTR-520 bodies are sold assembled for builders who would rather not print." }],
          ],
        },
        {
          type: "p",
          segments: [
            {
              text: "Any wheeled body built around a compatible microcontroller can run the OpenBot stack, so the printed designs are starting points rather than the only option.",
            },
          ],
        },
      ],
    },
    {
      heading: "The software stack",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The robot app runs on the phone (or computer) that sits on the robot. It talks to the body over a serial or Bluetooth link, streams video to a controller, and runs the driving policies.",
            },
          ],
        },
        {
          type: "ul",
          items: [
            [{ text: "Android: install the APK from the latest release, or build it in Android Studio." }],
            [{ text: "iOS: a beta built with Xcode; it is not on the App Store yet." }],
            [{ text: "Linux: a Python version for a Linux computer with a camera." }],
            [{ text: "Firmware: flash the Arduino sketch to the body's microcontroller." }],
            [{ text: "Playground: program the robot directly from the app." }],
            [
              {
                text: "Driving policy: train your own; the project warns this needs a high-end machine with a dedicated GPU and a good deal of patience.",
              },
            ],
          ],
        },
      ],
    },
    {
      heading: "What it can do",
      blocks: [
        {
          type: "p",
          segments: [
            {
              text: "The app supports advanced robotics workloads such as person following and real-time autonomous navigation, and the body can be driven manually from a game controller. The project also keeps a Slack channel and a list of community builds.",
            },
          ],
        },
      ],
    },
    {
      heading: "Source and citation",
      blocks: [
        {
          type: "p",
          segments: [
            { text: "Repository: " },
            { text: "ob-f/OpenBot", href: "https://github.com/ob-f/OpenBot" },
            {
              text: " (MIT). Paper: Müller & Koltun, OpenBot: Turning Smartphones into Robots, ICRA 2021. Project site: ",
            },
            { text: "openbot.org", href: "https://www.openbot.org/" },
            { text: "." },
          ],
        },
      ],
    },
  ],
};

export function projectEditorial(slug: string): EditorialSection[] | undefined {
  return PROJECT_EDITORIAL[slug];
}
