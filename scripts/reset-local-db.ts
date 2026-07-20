import { rmSync } from "node:fs";
import path from "node:path";
import { runWrangler } from "./wrangler-cli";

const workspaceRoot = path.resolve(process.cwd());
const wranglerStateRoot = path.resolve(workspaceRoot, ".wrangler", "state");
const localD1Root = path.resolve(wranglerStateRoot, "v3", "d1");

const expectedPrefix = `${wranglerStateRoot}${path.sep}`;
if (!localD1Root.startsWith(expectedPrefix) || path.basename(localD1Root) !== "d1") {
  throw new Error(`Refusing to remove unexpected path: ${localD1Root}`);
}

console.log(`Resetting the local-only D1 state at ${localD1Root}`);
rmSync(localD1Root, { recursive: true, force: true });

runWrangler(["d1", "migrations", "apply", "robopartpicker", "--local"]);
