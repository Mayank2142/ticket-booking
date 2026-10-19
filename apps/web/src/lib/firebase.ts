import type { FirebasePublicConfigDto } from "@cinebook/shared";
import { api } from "./api";

let configRequest: Promise<FirebasePublicConfigDto | null> | undefined;
let clientRequest: Promise<{ auth: import("@firebase/auth").Auth; sdk: typeof import("@firebase/auth") }> | undefined;

export function getFirebaseConfig() {
  return configRequest ??= api<{ firebase: FirebasePublicConfigDto | null }>("/api/auth/providers").then((result) => result.firebase).catch(() => null);
}

export async function firebaseClient() {
  return clientRequest ??= (async () => {
    const config = await getFirebaseConfig();
    if (!config) throw new Error("Firebase sign-in is not configured yet. Use your existing CineBook login.");
    const [appSdk, sdk] = await Promise.all([import("@firebase/app"), import("@firebase/auth")]);
    const app = appSdk.getApps().find((item) => item.name === "cinebook-web") ?? appSdk.initializeApp(config, "cinebook-web");
    const auth = sdk.getAuth(app);
    await sdk.setPersistence(auth, sdk.inMemoryPersistence);
    sdk.useDeviceLanguage(auth);
    return { auth, sdk };
  })();
}

export function firebaseErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const messages: Record<string, string> = {
    "auth/popup-closed-by-user": "Google sign-in was cancelled. You can try again or use your existing login.",
    "auth/popup-blocked": "Allow popups for this website, then try Google sign-in again.",
    "auth/unauthorized-domain": "This website domain must be added to Firebase Authentication's authorised domains.",
    "auth/operation-not-allowed": "Enable this sign-in method in Firebase Authentication first.",
    "auth/configuration-not-found": "Open Authentication in the Firebase Console, choose Get started, then enable Google and Email/Password sign-in.",
    "auth/email-already-in-use": "This email already has a Firebase account. Use verified-email sign-in or reset its password.",
    "auth/invalid-credential": "Email or password is incorrect. Existing demo accounts use the original login form.",
    "auth/weak-password": "Choose a stronger password with at least eight characters, a letter and a number.",
    "auth/network-request-failed": "Firebase could not be reached. Check your connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please wait before trying again.",
    "auth/account-exists-with-different-credential": "Use the sign-in method already linked to this email.",
  };
  return messages[code] ?? (error instanceof Error ? error.message : "Sign-in could not be completed.");
}

export async function confirmFirebaseIdentity(email: string, provider: string | null | undefined, password: string) {
  const { auth, sdk } = await firebaseClient();
  try {
    const result = provider === "password"
      ? await sdk.signInWithEmailAndPassword(auth, email, password)
      : await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
    if (result.user.email?.toLowerCase() !== email.toLowerCase()) throw new Error("Choose the same account as your CineBook profile.");
    return await result.user.getIdToken(true);
  } finally { await sdk.signOut(auth); }
}

export async function resetFirebasePassword(email: string) {
  const { auth, sdk } = await firebaseClient();
  await sdk.sendPasswordResetEmail(auth, email);
}
