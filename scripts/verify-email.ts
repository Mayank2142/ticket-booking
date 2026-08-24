import "dotenv/config";
import { verifyEmailTransport } from "../src/lib/email";

async function main() {
  const result = await verifyEmailTransport();
  console.log(result.message);
  if (!result.verified) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
