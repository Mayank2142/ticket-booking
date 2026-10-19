import type { AuthUserDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { firebaseClient, firebaseErrorMessage, getFirebaseConfig } from "../lib/firebase";
import "./FirebaseSignIn.css";

type FirebaseSignInProps = {
  mode?: "login" | "register" | "link";
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onComplete: (user: AuthUserDto) => void;
};

/** Google is an alternative to the page's single, shared email form. */
export function FirebaseSignIn({ mode = "login", disabled = false, onBusyChange, onComplete }: FirebaseSignInProps) {
  const { updateSession } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; getFirebaseConfig().then((config) => { if (active) setEnabled(Boolean(config)); if (config) void firebaseClient().catch(() => null); }); return () => { active = false; }; }, []);
  if (!enabled) return mode === "link" ? <p>Google sign-in is not configured on this deployment yet. Your existing login still works.</p> : null;

  async function google() {
    setBusy(true); onBusyChange?.(true); setError("");
    try {
      const { auth, sdk } = await firebaseClient();
      try {
        const provider = new sdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const identity = await sdk.signInWithPopup(auth, provider);
        const result = await api<{ token: string; user: AuthUserDto }>("/api/auth/firebase", {
          method: "POST", body: JSON.stringify({ idToken: await identity.user.getIdToken(), link: mode === "link" }),
        });
        updateSession(result.token, result.user);
        onComplete(result.user);
      } finally { await sdk.signOut(auth); }
    } catch (reason) { setError(firebaseErrorMessage(reason)); }
    finally { setBusy(false); onBusyChange?.(false); }
  }

  return <section className="firebase-sign-in" aria-label={mode === "link" ? "Link Google sign-in" : "Google sign-in"} aria-busy={busy}>
    <button type="button" className="google-sign-in-button" onClick={google} disabled={busy || disabled}>
      <img src="https://developers.google.com/static/identity/images/g-logo.png" width="20" height="20" alt="" aria-hidden="true" />
      <span>{busy ? "Connecting to Google…" : mode === "link" ? "Link Google account" : "Continue with Google"}</span>
    </button>
    {mode === "link" && <p className="firebase-sign-in__hint">Use the same email. Your existing password, bookings and role are preserved.</p>}
    {error && <p className="form-message error" role="alert">{error}</p>}
    {mode !== "link" && <div className="auth-method-divider"><span>OR</span></div>}
  </section>;
}
