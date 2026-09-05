import { describe, expect, it } from "vitest";
import { normalizeManagedFileUrl } from "./managedFileUrl";

describe("normalizeManagedFileUrl", () => {
  it("normalizes legacy Workers managed path to relative with encoded query", () => {
    expect(
      normalizeManagedFileUrl(
        "https://robopartpicker-production.ludomi2502.workers.dev/api/v1/files/content?id=abc123",
      ),
    ).toBe("/api/v1/files/content?id=abc123");
    expect(
      normalizeManagedFileUrl(
        "https://staging.ludomi2502.workers.dev/api/v1/files/content?id=xyz%20456",
      ),
    ).toBe("/api/v1/files/content?id=xyz%20456");
  });

  it("normalizes https://robopartpicker.com managed path to relative", () => {
    expect(
      normalizeManagedFileUrl(
        "https://robopartpicker.com/api/v1/files/content?id=def456",
      ),
    ).toBe("/api/v1/files/content?id=def456");
  });

  it("normalizes https://www.robopartpicker.com managed path to relative", () => {
    expect(
      normalizeManagedFileUrl(
        "https://www.robopartpicker.com/api/v1/files/content?id=ghi789",
      ),
    ).toBe("/api/v1/files/content?id=ghi789");
  });

  it("returns relative managed path unchanged", () => {
    expect(normalizeManagedFileUrl("/api/v1/files/content?id=jkl")).toBe(
      "/api/v1/files/content?id=jkl",
    );
  });

  it("returns manufacturer URL unchanged (external host)", () => {
    expect(
      normalizeManagedFileUrl(
        "https://www.ti.com/lit/ds/symlink/lm358.pdf",
      ),
    ).toBe("https://www.ti.com/lit/ds/symlink/lm358.pdf");
    expect(
      normalizeManagedFileUrl(
        "https://example.com/api/v1/files/content?id=nope",
      ),
    ).toBe("https://example.com/api/v1/files/content?id=nope");
  });

  it("returns null for blank, null, undefined, and malformed values", () => {
    expect(normalizeManagedFileUrl(null)).toBe(null);
    expect(normalizeManagedFileUrl(undefined)).toBe(null);
    expect(normalizeManagedFileUrl("")).toBe(null);
    expect(normalizeManagedFileUrl("   ")).toBe(null);
    // Malformed: no meaningful URL structure
    expect(normalizeManagedFileUrl("not-a-url")).toBe(null);
  });

  it("returns null for protocol-relative, credentialed, and non-HTTP URLs", () => {
    expect(normalizeManagedFileUrl("//evil.example/image.png")).toBe(null);
    expect(normalizeManagedFileUrl("/\\evil.example/image.png")).toBe(null);
    expect(normalizeManagedFileUrl("javascript:alert(1)")).toBe(null);
    expect(normalizeManagedFileUrl("data:image/png;base64,AAAA")).toBe(null);
    expect(normalizeManagedFileUrl("https://user:secret@example.com/image.png")).toBe(null);
  });

  it("preserves safe same-origin root-relative asset paths", () => {
    expect(normalizeManagedFileUrl("/assets/category/humanoid.svg")).toBe("/assets/category/humanoid.svg");
  });
});