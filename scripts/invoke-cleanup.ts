import "dotenv/config";

async function main() {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!appUrl || !secret) throw new Error("APP_URL and CRON_SECRET are required");

  const response = await fetch(`${appUrl}/api/cron/release-holds`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Cleanup failed (${response.status}): ${body}`);
  console.log(body);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
