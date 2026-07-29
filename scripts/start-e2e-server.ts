import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const stateParent = path.join(root, ".wrangler");
const statePath = path.join(stateParent, "e2e-state");

if (path.dirname(statePath) !== stateParent || path.basename(statePath) !== "e2e-state") {
  throw new Error("Refusing to reset an unexpected end-to-end state directory.");
}

rmSync(statePath, { recursive: true, force: true });
mkdirSync(statePath, { recursive: true });

const migration = spawnSync(process.execPath, [
  path.join(root, "node_modules", "wrangler", "bin", "wrangler.js"),
  "d1", "migrations", "apply", "robopartpicker", "--local", "--persist-to", statePath,
], { cwd: root, env: process.env, stdio: "inherit" });

if (migration.status !== 0) process.exit(migration.status ?? 1);

const server = spawn(process.execPath, [
  path.join(root, "node_modules", "vite", "bin", "vite.js"),
  "dev", "--host", "127.0.0.1", "--port", "8080",
], {
  cwd: root,
  env: { ...process.env, RPP_LOCAL_STATE_PATH: statePath },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
