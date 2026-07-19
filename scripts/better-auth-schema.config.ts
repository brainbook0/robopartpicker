// Schema-generation only. The application runtime always uses the D1 `DB` binding.
import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  appName: "RoboPartPicker",
  database: new DatabaseSync(":memory:"),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
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
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});
