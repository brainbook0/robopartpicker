import { betterAuth } from "better-auth";
import type { Env } from "./env";
import { UsersRepository } from "./db/repositories/users";
import { sendAuthEmail } from "./services/email";

export function createAuth(env: Env) {
  const users = new UsersRepository(env.DB);
  const emailConfigured = Boolean(env.EMAIL_PROVIDER_URL && env.EMAIL_PROVIDER_TOKEN && env.EMAIL_FROM);

  return betterAuth({
    appName: env.APP_NAME,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: emailConfigured,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(env, {
          to: user.email,
          subject: "Reset your RoboPartPicker password",
          text: `Open this link to reset your password: ${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: emailConfigured,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(env, {
          to: user.email,
          subject: "Verify your RoboPartPicker email",
          text: `Open this link to verify your email: ${url}`,
        });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/request-password-reset": { window: 3600, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await users.ensureProfile(user);
          },
        },
      },
    },
    advanced: {
      database: {
        generateId: "uuid",
        defaultFindManyLimit: 100,
      },
      cookiePrefix: "rpp",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.APP_ENV === "production",
      },
    },
  });
}
