import { Link } from "react-router-dom";
import { Download, FileJson } from "lucide-react";
import { RPPS_VERSION, emptyRpps } from "@/lib/rpps/schema";

const example = {
  ...emptyRpps({
    name: "OpenArm v1",
    slug: "openarm-v1",
    version: "0.3.0",
    summary: "6-DoF open-source robotic arm using 3D-printed structural parts and BLDC actuators.",
    license: "CERN-OHL-S-2.0",
    repo_url: "https://github.com/example/openarm",
    tags: ["arm", "6dof", "ros2", "3d-printed"],
    hardware: { dof: 6, payload_kg: 1.5, weight_kg: 4.2, compute: "Raspberry Pi 5 + Teensy 4.1" },
    software: { os: "Ubuntu 22.04", middleware: "ROS 2 Humble", ros_support: "native", languages: ["Python", "C++"] },
    build: { difficulty: "intermediate", estimated_time_hours: 24, estimated_cost_usd: 850, fabrication: ["3d-print"], required_tools: ["hex keys", "soldering iron", "0.4mm 3D printer"] },
    bom: [
      { ref: "ACT-SHOULDER", name: "GIM8108-8", manufacturer: "iFlight", category: "actuator", qty: 1, unit_cost_usd: 189 },
      { ref: "ACT-ELBOW", name: "GIM6010-8", manufacturer: "iFlight", category: "actuator", qty: 1, unit_cost_usd: 129 },
      { ref: "MCU", name: "Teensy 4.1", manufacturer: "PJRC", category: "controller", qty: 1, unit_cost_usd: 32 },
    ],
  }),
};

export default function RppsSpec() {
  const download = () => {
    const blob = new Blob([JSON.stringify(example, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "example.rpps.json"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="mx-auto max-w-[900px] px-4 py-6">
      <h1 className="text-[20px] font-bold tracking-tight mb-1">RoboPartPicker Project Standard <span className="mono text-primary">v{RPPS_VERSION}</span></h1>
      <p className="text-[12.5px] text-muted-foreground mb-4">
        RPPS is RoboPartPicker's open, versioned JSON format for describing DIY robotics projects.
        It is not an industry standard. It is designed to be portable so external tools can adopt it.
      </p>

      <div className="surface-card p-4 space-y-2 mb-4">
        <h2 className="text-[13px] font-semibold">What an RPPS package contains</h2>
        <ul className="text-[12px] list-disc pl-5 space-y-1">
          <li><b>Identity:</b> name, slug, version, license, authors.</li>
          <li><b>Hardware:</b> DoF, payload, weight, compute.</li>
          <li><b>Software:</b> OS, middleware, ROS support, languages, simulators.</li>
          <li><b>Build:</b> difficulty, time, cost, tools, skills, fabrication methods.</li>
          <li><b>BOM:</b> line items with manufacturer, MPN, qty, unit cost, supplier URL.</li>
          <li><b>Assembly:</b> ordered steps with dependencies.</li>
          <li><b>Files:</b> CAD, URDF/MJCF, firmware, config, media.</li>
          <li><b>Integrations:</b> evidence-backed component relationships.</li>
          <li><b>Evidence:</b> source-attributed claims with confidence.</li>
        </ul>
      </div>

      <div className="surface-card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[13px] font-semibold flex items-center gap-1"><FileJson className="h-3.5 w-3.5" /> Example package</h2>
          <button onClick={download} className="btn-ghost btn-sm"><Download className="h-3.5 w-3.5" /> Download</button>
        </div>
        <pre className="text-[10.5px] leading-snug bg-muted/40 border border-border rounded p-3 overflow-x-auto max-h-[380px]">
{JSON.stringify(example, null, 2)}
        </pre>
        <p className="text-[11px] text-muted-foreground mt-2">You can paste an RPPS package on the <Link to="/projects/new" className="text-primary hover:underline">new project</Link> page — it's validated against the schema before creation.</p>
      </div>

      <div className="surface-card p-4">
        <h2 className="text-[13px] font-semibold mb-1">Versioning & compatibility</h2>
        <p className="text-[12px] text-muted-foreground">Packages carry a <span className="mono">rpps_version</span> field. Future minor versions will remain backward-compatible for readers. Breaking changes will bump the major version and ship with a migration path.</p>
      </div>
    </div>
  );
}