import { describe, expect, it } from "vitest";
import { googleAuthenticationConfigured, googleSocialProviders } from "../../worker/auth-providers";
import type { Env } from "../../worker/env";

const env = (values: Partial<Env>): Env => values as Env;

describe("Google authentication configuration", () => {
  it("fails closed when either Google secret is missing or blank", () => {
    expect(googleAuthenticationConfigured(env({}))).toBe(false);
    expect(googleAuthenticationConfigured(env({ GOOGLE_CLIENT_ID: "client-id" }))).toBe(false);
    expect(googleAuthenticationConfigured(env({ GOOGLE_CLIENT_SECRET: "client-secret" }))).toBe(false);
    expect(googleAuthenticationConfigured(env({ GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "client-secret" }))).toBe(false);
    expect(googleSocialProviders(env({ GOOGLE_CLIENT_ID: "client-id" }))).toBeUndefined();
  });

  it("configures only the official Better Auth Google provider when both secrets exist", () => {
    const configured = env({ GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret" });
    expect(googleAuthenticationConfigured(configured)).toBe(true);
    expect(googleSocialProviders(configured)).toEqual({
      google: { clientId: "client-id", clientSecret: "client-secret" },
    });
  });
});
