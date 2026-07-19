import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    main: "./worker/index.ts",
    miniflare: {
      compatibilityDate: "2026-07-19",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      r2Buckets: ["FILES"],
      bindings: {
        TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
        APP_ENV: "test",
        APP_NAME: "RoboPartPicker",
        BETTER_AUTH_SECRET: "test-only-better-auth-secret-32-characters-minimum",
        BETTER_AUTH_URL: "https://example.com",
        INGESTION_SECRET: "test-only-ingestion-secret-32-characters-minimum",
      },
      serviceBindings: { ASSETS: () => new Response("not found", { status: 404 }) },
    },
  }))],
  test: { globals: true, include: ["tests/worker/**/*.{test,spec}.ts"], setupFiles: ["./tests/worker/setup.ts"], testTimeout: 30_000 },
});
