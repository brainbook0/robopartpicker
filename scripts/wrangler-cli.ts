import { spawnSync } from "node:child_process";
import path from "node:path";

type WranglerResult = {
  stdout: string;
  stderr: string;
};

function invokeWrangler(args: string[], inherit: boolean): WranglerResult {
  const wranglerEntry = path.resolve("node_modules", "wrangler", "bin", "wrangler.js");
  const result = spawnSync(process.execPath, [wranglerEntry, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: inherit ? "inherit" : "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`Wrangler exited with code ${result.status ?? 1}${details ? `:\n${details}` : ""}`);
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function runWrangler(args: string[]): void {
  invokeWrangler(args, true);
}

export function captureWrangler(args: string[]): WranglerResult {
  return invokeWrangler(args, false);
}

export function captureWranglerJson<T>(args: string[]): T {
  const { stdout } = captureWrangler([...args, "--json"]);
  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new Error(`Wrangler did not return valid JSON.\n${stdout}`, { cause: error });
  }
}
