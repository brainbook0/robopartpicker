export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_ENV: "development" | "preview" | "production" | "test";
  APP_NAME: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  INGESTION_SECRET: string;
  EMAIL_PROVIDER_URL?: string;
  EMAIL_PROVIDER_TOKEN?: string;
  EMAIL_FROM?: string;
  GITHUB_TOKEN?: string;
  AI_PROVIDER_URL?: string;
  AI_PROVIDER_KEY?: string;
  AI_MODEL?: string;
  AI_DAILY_TOKEN_LIMIT?: string;
  AI_MAX_OUTPUT_TOKENS?: string;
  MALWARE_SCAN_URL?: string;
  MALWARE_SCAN_TOKEN?: string;
}

export type AuthSession = Awaited<
  ReturnType<ReturnType<typeof import("./auth").createAuth>["api"]["getSession"]>
>;

export type AppBindings = {
  Bindings: Env;
  Variables: {
    requestId: string;
    authSession: AuthSession;
  };
};
