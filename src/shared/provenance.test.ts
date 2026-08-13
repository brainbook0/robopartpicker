import { describe, expect, it } from "vitest";
import { computePublishability, normalizeUpstreamIdentity, resolveUpstreamIdentity } from "./provenance";

describe("project provenance", () => {
  it("gates publishability on identity, license, maintainer and revision", () => {
    expect(computePublishability({ name: "", slug: "x", version: "1.0.0" })).toBe("blocked");
    expect(computePublishability({ name: "A", slug: "a", version: "1.0.0" })).toBe("incomplete"); // no license
    expect(computePublishability({ name: "A", slug: "a", version: "1.0.0", license: "Apache-2.0" })).toBe("incomplete"); // no maintainer
    expect(computePublishability({ name: "A", slug: "a", version: "1.0.0", license: "Apache-2.0", maintainer: "Owner" })).toBe("ready");
    expect(computePublishability({ name: "A", slug: "a", version: "1.0.0", license: "Apache-2.0", authorsCount: 2, repositoryUrl: "https://github.com/o/r" })).toBe("review"); // upstream but no revision
    expect(computePublishability({ name: "A", slug: "a", version: "1.0.0", license: "Apache-2.0", maintainer: "Owner", repositoryUrl: "https://github.com/o/r", revision: "abc123" })).toBe("ready");
  });

  it("normalizes upstream identities for dedup", () => {
    expect(normalizeUpstreamIdentity("https://github.com/Owner/Repo.git")).toBe("https://github.com/owner/repo");
    expect(normalizeUpstreamIdentity("https://github.com/Owner/Repo/?x=1#readme")).toBe("https://github.com/owner/repo");
    expect(normalizeUpstreamIdentity("https://gitlab.com/Owner/Repo/")).toBe("https://gitlab.com/owner/repo");
    expect(normalizeUpstreamIdentity("ftp://example.com/x")).toBe(null);
    expect(normalizeUpstreamIdentity("not a url")).toBe(null);
    expect(normalizeUpstreamIdentity(null)).toBe(null);
  });

  it("resolves the canonical identity from upstream or repository URL", () => {
    expect(resolveUpstreamIdentity({ repositoryUrl: "https://github.com/Owner/Repo.git" })).toBe("https://github.com/owner/repo");
    expect(resolveUpstreamIdentity({ upstreamUrl: "https://example.com/a", repositoryUrl: "https://example.com/b" })).toBe("https://example.com/a");
    expect(resolveUpstreamIdentity({})).toBe(null);
  });
});
