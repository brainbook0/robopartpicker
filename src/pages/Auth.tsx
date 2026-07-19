import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import logoUrl from "@/assets/logo.png";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const qsRedirect = new URLSearchParams(loc.search).get("redirect");
  const redirect = qsRedirect ?? (loc.state as { from?: string } | null)?.from ?? "/community";
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) nav(redirect, { replace: true });
  }, [user, loading, nav, redirect]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/community`,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast({ title: "Account created", description: "Check your email if confirmation is enabled." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast({ title: "Auth error", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}${redirect}` });
      if (r.error) throw r.error;
    } catch (err: any) {
      toast({ title: "Google sign-in failed", description: err.message ?? String(err), variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[420px] px-4 py-12">
      <Link to="/" className="flex items-center justify-center gap-2 mb-6">
        <img src={logoUrl} alt="" className="h-7 w-7 rounded-full" />
        <span className="text-[15px] font-bold tracking-tight">robopartpicker</span>
      </Link>
      <div className="surface-card p-5">
        <div className="flex gap-1 mb-4 rounded border border-border bg-muted/40 p-0.5 text-[12px]">
          {(["sign-in","sign-up"] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 rounded px-2 py-1 ${mode===m ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>
              {m === "sign-in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <button type="button" onClick={onGoogle} disabled={busy}
          className="btn-ghost w-full justify-center mb-3">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Continue with Google
        </button>

        <div className="relative my-3 text-center">
          <span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground relative z-10">or email</span>
          <span className="absolute left-0 right-0 top-1/2 h-px bg-border -z-0" />
        </div>

        <form onSubmit={onSubmit} className="space-y-2">
          {mode === "sign-up" && (
            <div>
              <label className="text-[11px] text-muted-foreground">Display name</label>
              <input className="input-bare mt-0.5" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="how others see you" />
            </div>
          )}
          <div>
            <label className="text-[11px] text-muted-foreground">Email</label>
            <input type="email" required className="input-bare mt-0.5" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Password</label>
            <input type="password" required minLength={6} className="input-bare mt-0.5" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==="sign-in"?"current-password":"new-password"} />
          </div>
          <button disabled={busy} className="btn-primary w-full mt-3 justify-center">
            {busy ? "…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-[11px] text-muted-foreground text-center">
          By continuing you agree to community guidelines. Be excellent to each other.
        </p>
      </div>
    </div>
  );
}