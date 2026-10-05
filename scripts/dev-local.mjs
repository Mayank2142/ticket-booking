import { spawn } from "node:child_process";
import { resolve } from "node:path";

const node = process.execPath;
const tsx = resolve("node_modules", "tsx", "dist", "cli.mjs");
const vite = resolve("node_modules", "vite", "bin", "vite.js");

const processes = [
  spawn(node, [tsx, "watch", "apps/api/src/server.ts"], { stdio: "inherit", env: process.env }),
  spawn(node, [vite, "apps/web", "--config", "apps/web/vite.config.ts"], { stdio: "inherit", env: process.env }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill("SIGTERM");
  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`Local service stopped unexpectedly (${signal ?? code ?? "unknown"}).`);
      stop(code ?? 1);
    }
  });
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
