export interface ComparisonPage {
  slug: string;
  title: string;
  desc: string;
  subject: string;
  verdict: string;
  rows: Array<[string, string, string]>;
}

export const COMPARISONS: ComparisonPage[] = [
  {
    slug: "vs-octopart",
    title: "RoboPartPicker vs Octopart | RoboPartPicker",
    desc: "Octopart aggregates electronic component data; RoboPartPicker is project-first - it derives a BOM from a robotics repo, then sources it.",
    subject: "Octopart",
    verdict: "Use Octopart for parametric search of a single electronic part; use RoboPartPicker when you start from a robot project or an entire BOM.",
    rows: [
      ["Entry point", "Component search", "Project or repository"],
      ["BOM extraction", "Manual", "Automatic from repo files, docs, CAD, URDF"],
      ["Sourcing", "Component-level offers", "Whole-BOM estimate with blockers"],
      ["Robotics focus", "General electronics", "Projects, parts, BOMs, builds"],
      ["Price honesty", "Market data", "Observed offers labeled as observations"],
    ],
  },
  {
    slug: "vs-digikey",
    title: "RoboPartPicker vs DigiKey | RoboPartPicker",
    desc: "DigiKey is a distributor with deep inventory; RoboPartPicker is a discovery and planning layer that sources from distributors like DigiKey.",
    subject: "DigiKey",
    verdict: "DigiKey is where you buy; RoboPartPicker is where you plan which parts to buy and see the whole build cost.",
    rows: [
      ["Entry point", "Distributor catalog", "Open robotics projects"],
      ["BOM handling", "Cart/parts list", "Auto-derived, evidence-linked BOM"],
      ["Multi-supplier compare", "No", "Yes - observed offers across stores"],
      ["Robot project context", "No", "Yes - per-project and per-part"],
      ["Purchase", "Yes", "Link-out and RFQ workflow"],
    ],
  },
  {
    slug: "vs-mcmaster-carr",
    title: "RoboPartPicker vs McMaster-Carr | RoboPartPicker",
    desc: "McMaster-Carr is ideal for fasteners, framing, and hardware; RoboPartPicker tracks those mechanical parts inside a full robot BOM.",
    subject: "McMaster-Carr",
    verdict: "McMaster for the mechanical bits you know; RoboPartPicker to discover which mechanical bits a project actually needs.",
    rows: [
      ["Catalog breadth", "Mechanical + hardware", "Robotics-focused, source-linked"],
      ["Project discovery", "No", "Yes - open robot projects"],
      ["BOM line matching", "Manual", "Automatic with evidence"],
      ["Supplier comparison", "Single store", "Multiple distributors observed"],
      ["Community evidence", "No", "Yes - project usage and reproducibility"],
    ],
  },
  {
    slug: "vs-pcpartpicker",
    title: "RoboPartPicker vs PCPartPicker | RoboPartPicker",
    desc: "PCPartPicker is the PC-building inspiration; RoboPartPicker brings the same project, BOM, and sourcing workflow to open robotics.",
    subject: "PCPartPicker",
    verdict: "PCPartPicker solved PC builds; RoboPartPicker is bringing the same pattern to robotics projects where parts are messier and suppliers are many.",
    rows: [
      ["Domain", "PC components", "Robotics projects and parts"],
      ["BOM source", "User-selected parts", "Derived from repo, docs, CAD, URDF"],
      ["Compatibility", "Strict hardware rules", "Evidence-based with unresolved lines kept visible"],
      ["Project identity", "Single build list", "Reproducible project with lineage and forks"],
      ["Supplier compare", "Yes", "Yes - observed offers, honest freshness"],
    ],
  },
  {
    slug: "vs-grabcad",
    title: "RoboPartPicker vs GrabCAD | RoboPartPicker",
    desc: "GrabCAD hosts CAD models and engineering communities; RoboPartPicker catalogs projects and turns their files into sourceable BOMs.",
    subject: "GrabCAD",
    verdict: "GrabCAD for CAD discovery; RoboPartPicker for turning a robot design into a bill of materials and a sourcing plan.",
    rows: [
      ["Primary asset", "CAD models", "Projects + BOMs + sourcing"],
      ["File analysis", "Download, view", "Parse CAD metadata into BOM lines"],
      ["Sourcing", "No", "Yes - supplier offers and estimates"],
      ["Reproduction", "No", "Yes - build workspace and releases"],
      ["Evidence", "Community", "Source-linked and provenance-tracked"],
    ],
  },
];