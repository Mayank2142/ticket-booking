import { closeSync, existsSync, openSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databasePath = resolve("tests", "test.db");
if (existsSync(databasePath)) rmSync(databasePath);
closeSync(openSync(databasePath, "w"));

const env = {
  ...process.env,
  DATABASE_URL: "file:./tests/test.db",
  JWT_SECRET: "test-secret",
  SEAT_HOLD_TTL_MINUTES: "10",
  WAITLIST_OFFER_TTL_MINUTES: "15",
  APP_URL: "http://localhost:3000",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
};

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([resolve("node_modules", "prisma", "build", "index.js"), "migrate", "deploy"]);
run([resolve("node_modules", "tsx", "dist", "cli.mjs"), "--test", "tests/booking-lifecycle.test.ts"]);

if (existsSync(databasePath)) rmSync(databasePath);
