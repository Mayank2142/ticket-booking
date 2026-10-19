import "dotenv/config";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

let app;
try {
  const required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
  if (required.some((name) => !process.env[name])) throw new Error("missing-configuration");
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("auth-emulator-not-permitted");
  app = initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }) }, "cinebook-configuration-check");
  try {
    // A read-only lookup: never creates or changes a Firebase identity.
    await getAuth(app).getUser("cinebook-configuration-check");
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  console.log("Firebase Admin credentials and Auth read access verified. No identities were changed.");
} catch (error) {
  // SDK messages may contain configuration details; report only a safe error code.
  const code = typeof error?.code === "string" && /^[a-z0-9_/-]+$/i.test(error.code) ? error.code : "invalid-or-missing-configuration";
  console.error(`Firebase Admin verification failed (${code}). Check the Railway variables and service-account permissions. Secret values were not printed.`);
  if (code === "auth/configuration-not-found") console.error("Open Firebase Console → Authentication → Get started, then enable Google and Email/Password sign-in.");
  process.exitCode = 1;
} finally {
  if (app) await deleteApp(app);
}
