import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import logoUrl from "@/assets/logo.png";

type PublicClient = {
  client_id?: string;
  client_name?: string;
  client_uri?: string;
  contacts?: string[];
};

const SCOPE_LABELS: Record<string, string> = {
  openid: "Identify your RoboPartPicker account",
  profile: "Read your display name and profile image",
  email: "Read your account email address",
  offline_access: "Remain connected until you revoke access",
  "rpp:read": "Read projects, builds, BOMs, and engineering records you can access",
  "rpp:write": "Create and explicitly confirm structured change proposals",
};

export default function OAuthConsent() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const query = location.search.startsWith("?") ? location.search.slice(1) : location.search;
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const clientId = params.get("client_id") ?? "";
  const scopes = (params.get("scope") ?? "").split(/\s+/u).filter(Boolean);
  const [client, setClient] = useState<PublicClient | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      const returnTo = `${location.pathname}${location.search}`;
      navigate(`/auth?redirect=${encodeURIComponent(returnTo)}`, { replace: true });
    }
  }, [loading, user, navigate, location.pathname, location.search]);

  useEffect(() => {
    if (!user || !clientId) return;
    const controller = new AbortController();
    void fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => null) as PublicClient | { message?: string } | null;
      if (!response.ok) throw new Error(body && "message" in body ? body.message : "The requesting application could not be verified.");
      setClient(body as PublicClient);
    }).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "The requesting application could not be verified.");
    });
    return () => controller.abort();
  }, [user, clientId]);

  const decide = async (accept: boolean) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ accept, oauth_query: query }),
      });
      const body = await response.json().catch(() => null) as { url?: string; message?: string } | null;
      if (!response.ok || !body?.url) throw new Error(body?.message ?? "The authorization decision could not be completed.");
      window.location.assign(body.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The authorization decision could not be completed.");
      setBusy(false);
    }
  };

  const clientLink = safeWebUrl(client?.client_uri);
  const clientName = client?.client_name?.trim() || "An external MCP client";

  return (
    <main className="mx-auto max-w-[520px] px-4 py-12">
      <Link to="/" className="mb-6 flex items-center justify-center gap-2">
        <img src={logoUrl} alt="" className="h-7 w-7 rounded-full" />
        <span className="text-[15px] font-bold tracking-tight">robopartpicker</span>
      </Link>
      <section className="surface-card p-5" aria-labelledby="oauth-title">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded border border-primary/40 bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <h1 id="oauth-title" className="text-base font-semibold">Authorize MCP access</h1>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {clientLink ? <a href={clientLink} rel="noreferrer" className="underline">{clientName}</a> : clientName} wants to connect to your robotics workspace.
            </p>
          </div>
        </div>

        <div className="rounded border border-border bg-muted/30 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Requested access</div>
          <ul className="space-y-2 text-[12px]">
            {scopes.map((scope) => (
              <li key={scope} className="flex gap-2">
                <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{SCOPE_LABELS[scope] ?? scope}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Write access is proposal-based: important changes still require an explicit confirmation. Imported repositories, files, and project text are always treated as untrusted data.
        </p>

        {error && <div role="alert" className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-[12px] text-destructive">{error}</div>}

        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-secondary flex-1 justify-center" disabled={busy || !client} onClick={() => void decide(false)}>Deny</button>
          <button type="button" className="btn-primary flex-1 justify-center" disabled={busy || !client} onClick={() => void decide(true)}>
            {busy ? "Authorizing…" : "Authorize"}
          </button>
        </div>
      </section>
    </main>
  );
}

function safeWebUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
