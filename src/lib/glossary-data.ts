export interface GlossaryTerm {
  term: string;
  definition: string;
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    term: "Bill of Materials (BOM)",
    definition: "A structured list of every part, component, and material needed to build a robot, usually with quantities, identifiers, and sources. RoboPartPicker derives BOMs from project files and keeps unresolved lines visible rather than dropping them.",
  },
  {
    term: "COTS parts",
    definition: "Commercial off-the-shelf components: standard parts you can buy from distributors rather than fabricate yourself. FRC teams use COTS part exemptions to build competitive robots quickly from catalog suppliers.",
  },
  {
    term: "Servo motor",
    definition: "A motor with closed-loop position control that can be commanded to a specific angle. Servos are the workhorse of small robots and robot arms; torque and speed specs determine which servo fits which joint.",
  },
  {
    term: "Stepper motor",
    definition: "A brushless motor that moves in discrete steps, allowing precise open-loop position control. Steppers are common in 3D printers and robot arms where holding torque matters more than top speed.",
  },
  {
    term: "BLDC motor",
    definition: "Brushless DC motor: high efficiency and power density for its size, driven by an electronic speed controller. BLDC motors power quadrupeds, drones, and robot wheels where continuous motion and efficiency matter.",
  },
  {
    term: "Actuator",
    definition: "The component that produces motion in a robot: a motor, linear actuator, or muscle-like device. The actuator finder on RoboPartPicker narrows actuator selection by torque, speed, size, and supply voltage.",
  },
  {
    term: "ESC (Electronic Speed Controller)",
    definition: "A power electronics board that drives brushless motors by converting DC power into three-phase commutation. ESC selection depends on motor current draw, battery voltage, and firmware features.",
  },
  {
    term: "Motor driver",
    definition: "A board or IC that converts a microcontroller's logic-level control signals into the higher voltage/current needed to drive DC or stepper motors. Common chips include L298, DRV8825, and TB6612.",
  },
  {
    term: "Legacy component / EOL",
    definition: "End-of-life: a part the manufacturer is discontinuing. EOL parts matter in robotics because a build tied to an obsolete component becomes hard to reproduce. RoboPartPicker flags sourcing uncertainty rather than hiding it.",
  },
  {
    term: "Supplier offer",
    definition: "An observed price for a component at a specific distributor. On RoboPartPicker, supplier offers are labeled as observations, not binding quotes, with freshness shown honestly.",
  },
  {
    term: "ROS 2",
    definition: "The Robot Operating System 2: an open-source middleware framework for building robot software, providing messaging, drivers, tooling, and a huge ecosystem. Most open-source robot projects in the RoboPartPicker catalog are built on ROS or ROS 2.",
  },
  {
    term: "URDF (Unified Robot Description Format)",
    definition: "An XML file describing a robot's links, joints, and kinematics. RoboPartPicker reads URDF and robot-description files as evidence when deriving a project's bill of materials.",
  },
  {
    term: "CAD files",
    definition: "Computer-aided design models of robot parts, usually STEP or STL. CAD files are primary evidence in RoboPartPicker BOM extraction, alongside explicit BOM files and documentation.",
  },
  {
    term: "Fabricated part",
    definition: "A component designed to be made in-house: 3D printed, machined, or laser cut. Fabricated parts appear in BOMs with their own tolerances, materials, and manufacturing notes.",
  },
  {
    term: "Reproducibility",
    definition: "How completely a robot build can be recreated from its published files, BOM, and instructions. Honest reproducibility evidence - including what is missing - is a core value of the RoboPartPicker platform.",
  },
];