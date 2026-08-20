import { describe, expect, it } from "vitest";
import { normalizeRppsForWrite, validateRpps } from "./schema";

describe("normalizeRppsForWrite", () => {
  it("removes legacy null placeholders and resolves relative managed URLs", () => {
    const normalized = normalizeRppsForWrite({
      rpps_version: "1.0.0",
      name: "Robot",
      slug: "robot",
      version: "1.0.0",
      bom: [],
      summary: `${"Source-backed summary text ".repeat(20)}end`,
      cover_image_url: "/api/v1/files/content?id=cover",
      docs_url: "www.ros.org/wiki/robot",
      hardware: { dof: 6, payload_kg: null },
      files: [
        { path: "model.obj", kind: "cad", url: "/api/v1/files/content?id=model", description: null },
        { path: "notes.txt", kind: "doc", url: "not a URL" },
      ],
      extension: { absent: null, retained: true },
    }, "https://example.com") as Record<string, unknown>;

    expect(normalized).toMatchObject({
      cover_image_url: "https://example.com/api/v1/files/content?id=cover",
      docs_url: "https://www.ros.org/wiki/robot",
      hardware: { dof: 6 },
      files: [
        { path: "model.obj", kind: "cad", url: "https://example.com/api/v1/files/content?id=model" },
        { path: "notes.txt", kind: "doc" },
      ],
      extension: { retained: true },
    });
    expect(validateRpps(normalized)).toMatchObject({ ok: true });
    expect(String(normalized.summary).length).toBeLessThanOrEqual(280);
    expect(String(normalized.summary).endsWith("…")).toBe(true);
  });
});
