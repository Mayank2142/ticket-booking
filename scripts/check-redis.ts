import "../src/lib/env";
import { getRedisDiagnostics } from "../src/lib/realtime";

const result = await getRedisDiagnostics();
console.log(JSON.stringify(result, null, 2));
if (result.configured && result.status !== "connected") process.exitCode = 1;
