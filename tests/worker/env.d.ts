declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
  }
}
