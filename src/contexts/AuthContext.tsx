import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api/client";

export type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  region: string | null;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MeResponse = {
  user: AuthUser;
  profile: Profile | null;
  session: AuthSession;
};

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => undefined,
  refreshProfile: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const authSession = authClient.useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const sessionData = authSession.data as unknown as { user: AuthUser; session: AuthSession } | null;
  const user = sessionData?.user ?? null;
  const session = sessionData?.session ?? null;

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    try {
      const me = await api.get<MeResponse>("/api/v1/me", { retry: false });
      setProfile(me.profile);
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const signOut = async () => {
    await authClient.signOut();
    setProfile(null);
    await authSession.refetch();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading: authSession.isPending || profileLoading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
