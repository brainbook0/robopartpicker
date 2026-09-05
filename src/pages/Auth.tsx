import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { healthApi } from "@/lib/api/health";
import { isSafeInternalPath } from "@/lib/safe-url";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import logoUrl from "@/assets/logo.png";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The authentication request failed.";
}

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const requested = params.get("redirect")
    ?? params.get("next")
    ?? (location.state as { from?: string } | null)?.from
    ?? "/community";
  const redirect = isSafeInternalPath(requested) ? requested : "/community";
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const healthQuery = useQuery({
    queryKey: ["health-capabilities"],
    queryFn: ({ signal }) => healthApi.get(signal),
    staleTime: 5 * 60_000,
  });
  const googleEnabled = healthQuery.data?.capabilities.googleAuthentication === true;

  useEffect(() => {
    if (!loading && user) navigate(redirect, { replace: true });
  }, [user, loading, navigate, redirect]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/auth`,
        });
        if (result.error) throw new Error(result.error.message);
        toast({
          title: "Reset requested",
          description: "If email delivery is configured, check your inbox for the reset link.",
        });
        return;
      }

      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          email,
          password,
          name: displayName.trim() || email.split("@")[0],
          callbackURL: redirect,
        });
        if (result.error) throw new Error(result.error.message);
        toast({
          title: "Account created",
          description: result.data?.user.emailVerified
            ? "Your account is ready."
            : "Check your email if verification is enabled for this environment.",
        });
      } else {
        const result = await authClient.signIn.email({ email, password, callbackURL: redirect });
        if (result.error) throw new Error(result.error.message);
      }
    } catch (error) {
      toast({ title: "Authentication error", description: messageOf(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onGoogleSignIn = async () => {
    setGoogleBusy(true);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: redirect });
      if (result.error) throw new Error(result.error.message);
    } catch (error) {
      toast({ title: "Google authentication error", description: messageOf(error), variant: "destructive" });
      setGoogleBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[420px] px-4 py-12">
      <Link to="/" className="mb-6 flex items-center justify-center gap-2">
        <img src={logoUrl} alt="" className="h-7 w-7 rounded-full" />
        <span className="text-[15px] font-bold tracking-tight">robopartpicker</span>
      </Link>
      <div className="surface-card p-5">
        {mode !== "reset" && (
          <div className="mb-4 flex gap-1 rounded border border-border bg-muted/40 p-0.5 text-[12px]">
            {(["sign-in", "sign-up"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`flex-1 rounded px-2 py-1 ${mode === item ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
              >
                {item === "sign-in" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
        )}

        {mode === "reset" && (
          <div className="mb-4">
            <div className="text-sm font-semibold">Reset password</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Email delivery must be configured by the operator.</p>
          </div>
        )}

        {mode !== "reset" && googleEnabled && (
          <>
            <button type="button" onClick={() => void onGoogleSignIn()} disabled={googleBusy || busy} className="btn-ghost w-full justify-center border-input">
              <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full border border-border bg-background text-[10px] font-bold">G</span>
              {googleBusy ? "Connecting to Google…" : "Continue with Google"}
            </button>
            <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted-foreground" aria-hidden="true"><span className="h-px flex-1 bg-border" /><span>or use email</span><span className="h-px flex-1 bg-border" /></div>
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-2">
          {mode === "sign-up" && (
            <div>
              <label className="text-[11px] text-muted-foreground">Display name</label>
              <input
                className="input-bare mt-0.5"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="how others see you"
                maxLength={80}
              />
            </div>
          )}
          <div>
            <label className="text-[11px] text-muted-foreground">Email</label>
            <input
              type="email"
              required
              className="input-bare mt-0.5"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
          {mode !== "reset" && (
            <div>
              <label className="text-[11px] text-muted-foreground">Password</label>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                className="input-bare mt-0.5"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              />
            </div>
          )}
          <button disabled={busy} className="btn-primary mt-3 w-full justify-center">
            {busy ? "Working…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Request reset"}
          </button>
        </form>

        {mode === "sign-in" && (
          <button type="button" onClick={() => setMode("reset")} className="mt-3 w-full text-center text-[11px] text-muted-foreground hover:text-foreground">
            Forgot your password?
          </button>
        )}
        {mode === "reset" && (
          <button type="button" onClick={() => setMode("sign-in")} className="mt-3 w-full text-center text-[11px] text-muted-foreground hover:text-foreground">
            Back to sign in
          </button>
        )}

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          By continuing you agree to the <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link> and acknowledge the <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
