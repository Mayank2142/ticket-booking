import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { FirebasePublicConfigDto } from "@cinebook/shared";

export class FirebaseAuthError extends Error {
  constructor(message: string, public status = 401) { super(message); }
}

export type FirebasePrincipal = { uid: string; email: string; emailVerified: boolean; name?: string; provider: string; authTime: number };

export function firebaseAdminConfigured() {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

export function firebasePublicConfig(): FirebasePublicConfigDto | null {
  if (!firebaseAdminConfigured() || !process.env.FIREBASE_WEB_API_KEY || !process.env.FIREBASE_AUTH_DOMAIN || !process.env.FIREBASE_APP_ID) return null;
  if (!/^[a-z0-9.-]+$/i.test(process.env.FIREBASE_AUTH_DOMAIN)) return null;
  return { apiKey: process.env.FIREBASE_WEB_API_KEY, authDomain: process.env.FIREBASE_AUTH_DOMAIN, projectId: process.env.FIREBASE_PROJECT_ID!, appId: process.env.FIREBASE_APP_ID };
}

function firebaseAdminAuth() {
  if (!firebaseAdminConfigured()) throw new FirebaseAuthError("Firebase sign-in is not configured yet. Existing account login is still available.", 503);
  // Never permit unsigned emulator tokens in a deployed service.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new FirebaseAuthError("The production Firebase token verifier cannot use the Auth emulator.", 503);
  const app = getApps().find((item) => item.name === "cinebook-auth") ?? initializeApp({
    credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n") }),
    projectId: process.env.FIREBASE_PROJECT_ID,
  }, "cinebook-auth");
  return getAuth(app);
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebasePrincipal> {
  const auth = firebaseAdminAuth();
  try {
    const token = await auth.verifyIdToken(idToken, true);
    return { uid: token.uid, email: token.email ?? "", emailVerified: token.email_verified === true, name: typeof token.name === "string" ? token.name : undefined, provider: token.firebase.sign_in_provider, authTime: token.auth_time };
  } catch {
    throw new FirebaseAuthError("Firebase sign-in is invalid, expired or revoked. Please sign in again.");
  }
}

export async function verifyRecentFirebaseUser(idToken: unknown, uid: string) {
  if (typeof idToken !== "string" || idToken.length > 16_384) throw new FirebaseAuthError("Sign in again to confirm this action.");
  const principal = await verifyFirebaseIdToken(idToken);
  if (principal.uid !== uid || !principal.emailVerified || Date.now() / 1000 - principal.authTime > 300 || principal.authTime > Date.now() / 1000 + 60) {
    throw new FirebaseAuthError("A recent sign-in to this same Firebase account is required.");
  }
  return principal;
}

export async function deleteFirebaseIdentity(uid: string) {
  try { await firebaseAdminAuth().deleteUser(uid); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "auth/user-not-found") return;
    throw error;
  }
}
