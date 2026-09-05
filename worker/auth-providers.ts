import type { Env } from "./env";

type GoogleProviderEnv = Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">;

type GoogleSocialProviders = {
  google: {
    clientId: string;
    clientSecret: string;
  };
};

export function googleAuthenticationConfigured(env: GoogleProviderEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleSocialProviders(env: GoogleProviderEnv): GoogleSocialProviders | undefined {
  if (!googleAuthenticationConfigured(env)) return undefined;
  return {
    google: {
      clientId: env.GOOGLE_CLIENT_ID!.trim(),
      clientSecret: env.GOOGLE_CLIENT_SECRET!.trim(),
    },
  };
}
