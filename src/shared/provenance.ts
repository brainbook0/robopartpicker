// Shared project provenance rules: canonical upstream identity, required
// provenance fields and publishability gating. Pure and side-effect free so it
// can be unit-tested and reused verbatim in the Worker.

export type Publishability = "ready" | "review" | "incomplete" | "blocked";

export type ProvenanceInput = {
  name?: string | null;
  slug?: string | null;
  version?: string | null;
  license?: string | null;
  maintainer?: string | null;
  authorsCount?: number;
  upstreamUrl?: string | null;
  repositoryUrl?: string | null;
  revision?: string | null;
};

/** Publishability gate. A project is never silently published when required
 *  provenance is missing:
 *  - blocked: no stable identity (name/slug/version)
 *  - incomplete: missing license or maintainer
 *  - review: has an upstream but no recorded revision
 *  - ready: all required provenance present */
export function computePublishability(input: ProvenanceInput): Publishability {
  const hasIdentity = Boolean(input.name?.trim() && input.slug?.trim() && input.version?.trim());
  if (!hasIdentity) return "blocked";
  const hasLicense = Boolean(input.license?.trim());
  const hasMaintainer = Boolean(input.maintainer?.trim() || (input.authorsCount ?? 0) > 0);
  if (!hasLicense || !hasMaintainer) return "incomplete";
  const hasUpstream = Boolean(input.upstreamUrl?.trim() || input.repositoryUrl?.trim());
  if (hasUpstream && !input.revision?.trim()) return "review";
  return "ready";
}

/** Normalize an upstream URL into a canonical dedup identity (scheme + host +
 *  path, lowercased, no query/fragment/userinfo, trailing `.git`/slashes
 *  stripped). Returns null when the value is not a usable HTTP(S) URL. */
export function normalizeUpstreamIdentity(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    url.username = "";
    url.password = "";
    const path = url.pathname.replace(/\.git$/iu, "").replace(/\/+$/u, "").toLowerCase();
    url.pathname = path;
    return url.toString();
  } catch {
    return null;
  }
}

/** Canonical identity preference: an explicit upstream identity wins, otherwise
 *  a repository URL is normalized the same way. */
export function resolveUpstreamIdentity(input: { upstreamUrl?: string | null; repositoryUrl?: string | null }): string | null {
  return normalizeUpstreamIdentity(input.upstreamUrl) ?? normalizeUpstreamIdentity(input.repositoryUrl);
}
