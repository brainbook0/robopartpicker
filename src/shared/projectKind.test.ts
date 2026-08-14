import { describe, expect, it } from "vitest";
import { emptyRpps } from "../lib/rpps/schema";
import { classifyProjectKind } from "./projectKind";

describe("project kind classifier", () => {
  it("classifies RPPS packages with BOM or hardware evidence as physical designs", () => {
    expect(classifyProjectKind(emptyRpps({
      name: "Arm Kit",
      slug: "arm-kit",
      bom: [{ name: "Servo", qty: 2 }],
    }))).toBe("physical_design");

    expect(classifyProjectKind(emptyRpps({
      name: "Walker",
      slug: "walker",
      hardware: { dof: 12, compute: "Jetson" },
      software: { middleware: "ROS 2", ros_support: "native" },
    }))).toBe("physical_design");
  });

  it("classifies software-only robotics evidence separately", () => {
    expect(classifyProjectKind(emptyRpps({
      name: "Navigation Stack",
      slug: "navigation-stack",
      software: { middleware: "ROS 2", ros_support: "native" },
    }))).toBe("robotics_software");
  });

  it("uses commercial showcase only when text evidence is explicit", () => {
    expect(classifyProjectKind(emptyRpps({
      name: "Vendor showcase bot",
      slug: "vendor-showcase-bot",
      summary: "Commercial product showcase for a closed source robot.",
    }))).toBe("commercial_showcase");

    expect(classifyProjectKind(emptyRpps({ name: "Mystery Robot", slug: "mystery-robot" }))).toBe("unknown");
  });
});
