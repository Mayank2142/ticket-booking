import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error("TEST_DATABASE_URL is required, for example postgresql://postgres:postgres@localhost:55432/cinebook_test");
  process.exit(1);
}

const parsed = new URL(databaseUrl);
if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || !parsed.pathname.toLowerCase().endsWith("_test")) {
  console.error("Refusing to reset a database whose name does not end in _test");
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: "test-secret",
  SEAT_HOLD_TTL_MINUTES: "10",
  WAITLIST_OFFER_TTL_MINUTES: "15",
  APP_URL: "http://localhost:3000",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  REDIS_URL: "",
};

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([resolve("node_modules", "prisma", "build", "index.js"), "migrate", "deploy"]);
run([
  resolve("node_modules", "tsx", "dist", "cli.mjs"),
  "--test",
  "tests/booking-lifecycle.test.ts",
  "tests/catalog.test.ts",
  "tests/realtime.test.ts",
  "tests/security.test.ts",
]);
