import { describe, it, expect } from "vitest";
import { isInternalPath, normalizeTags, slugify } from "./forum";

describe("isInternalPath", () => {
  it("accepts internal paths", () => {
    expect(isInternalPath("/projects/foo")).toBe(true);
    expect(isInternalPath("/parts/actuators/bar-baz")).toBe(true);
    expect(isInternalPath("/community?tag=ros2")).toBe(true);
    expect(isInternalPath("/projects/foo?tab=bom")).toBe(true);
    expect(isInternalPath("/projects/foo?tab=bom#parts")).toBe(true);
  });
  it("rejects external, protocol-relative, and unsafe paths", () => {
    expect(isInternalPath("https://example.com/x")).toBe(false);
    expect(isInternalPath("//evil.com")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
    expect(isInternalPath("data:text/html,foo")).toBe(false);
    expect(isInternalPath("mailto:a@b.c")).toBe(false);
    expect(isInternalPath("no-slash")).toBe(false);
    expect(isInternalPath("")).toBe(false);
    expect(isInternalPath("/foo\\bar")).toBe(false);
    expect(isInternalPath("/foo\nbar")).toBe(false);
  });
});

describe("normalizeTags", () => {
  it("trims, lowercases, dedupes, strips hash, caps count", () => {
    expect(normalizeTags("BLDC, #bldc, harmonic-drive, ROS2, ,")).toEqual(["bldc", "harmonic-drive", "ros2"]);
  });
  it("truncates over-long tags and honors max count", () => {
    const tags = normalizeTags("a,b,c,d,e,f,g,h,i", 4);
    expect(tags).toEqual(["a","b","c","d"]);
  });
});

describe("slugify", () => {
  it("produces url-safe slugs", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
});