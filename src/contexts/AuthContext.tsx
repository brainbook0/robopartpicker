import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type Ctx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string | undefined) => {
    if (!uid) { setProfile(null); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .eq("id", uid)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  };

  useEffect(() => {
    // Register listener FIRST, then check existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // Defer DB call to avoid deadlock inside the auth callback.
      setTimeout(() => loadProfile(s?.user?.id), 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      loadProfile(data.session?.user?.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };
  const refreshProfile = async () => { await loadProfile(user?.id); };

  return (
    <AuthCtx.Provider value={{ session, user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);