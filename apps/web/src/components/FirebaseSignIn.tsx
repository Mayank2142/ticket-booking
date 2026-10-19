import type { AuthUserDto } from "@cinebook/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { firebaseClient, firebaseErrorMessage, getFirebaseConfig, resetFirebasePassword } from "../lib/firebase";
import "./FirebaseSignIn.css";

export function FirebaseSignIn({ mode = "login", onComplete }: { mode?: "login" | "register" | "link"; onComplete: (user: AuthUserDto) => void }) {
  const { updateSession } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { let active = true; getFirebaseConfig().then((config) => { if (active) setEnabled(Boolean(config)); if (config) void firebaseClient().catch(() => null); }); return () => { active = false; }; }, []);
  if (!enabled) return mode === "link" ? <p>Google sign-in is not configured on this deployment yet. Your existing login still works.</p> : null;

  async function exchange(idToken: string) {
    const result = await api<{ token: string; user: AuthUserDto }>("/api/auth/firebase", { method: "POST", body: JSON.stringify({ idToken, link: mode === "link" }) });
    updateSession(result.token, result.user);
    onComplete(result.user);
  }

  async function google() {
    setBusy(true); setError(""); setNotice("");
    try {
      const { auth, sdk } = await firebaseClient();
      try {
        const provider = new sdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await sdk.signInWithPopup(auth, provider);
        await exchange(await result.user.getIdToken());
      } finally { await sdk.signOut(auth); }
    } catch (reason) { setError(firebaseErrorMessage(reason)); }
    finally { setBusy(false); }
  }

  async function verifiedEmail(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "register" && (!/[A-Za-z]/.test(password) || !/\d/.test(password))) throw new Error("Password must include a letter and a number.");
      const { auth, sdk } = await firebaseClient();
      try {
        const result = mode === "register"
          ? await sdk.createUserWithEmailAndPassword(auth, email.trim(), password)
          : await sdk.signInWithEmailAndPassword(auth, email.trim(), password);
        if (mode === "register") await sdk.updateProfile(result.user, { displayName: name.trim() });
        if (!result.user.emailVerified) {
          await sdk.sendEmailVerification(result.user);
          setNotice("Firebase sent a verification email. Open the link in your inbox, then use verified-email sign-in below on the login page.");
          setPassword("");
        } else { await exchange(await result.user.getIdToken(true)); }
      } finally { await sdk.signOut(auth); }
    } catch (reason) { setError(firebaseErrorMessage(reason)); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!email.trim()) throw new Error("Enter your Firebase email address first.");
      await resetFirebasePassword(email.trim());
      setNotice("If this address has a Firebase account, check its inbox for a password-reset email.");
    } catch (reason) { setError(firebaseErrorMessage(reason)); }
    finally { setBusy(false); }
  }

  return <section className="firebase-sign-in" aria-label={mode === "link" ? "Link Google sign-in" : "Firebase sign-in options"} aria-busy={busy}>
    <button type="button" className="button button-secondary submit-button" onClick={google} disabled={busy}>{busy ? "Please wait…" : mode === "link" ? "Link Google account" : "Continue with Google"}</button>
    <p className="firebase-sign-in__hint">{mode === "link" ? "Use the same email. Your existing password, bookings and role are preserved." : "New Google and Firebase accounts are customer accounts. Existing customer, admin and organiser logins remain below."}</p>
    {mode !== "link" && <details><summary>{mode === "register" ? "Create a verified-email customer account" : "Sign in with verified Firebase email"}</summary><form className="auth-form" onSubmit={verifiedEmail}>
      {mode === "register" && <label>Full name<input className="form-control" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} /></label>}
      <label>Firebase email address<input className="form-control" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label>Firebase password<input className="form-control" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "register" ? 8 : undefined} maxLength={128} /></label>
      <button className="button button-primary" type="submit" disabled={busy}>{mode === "register" ? "Create & send verification email" : "Sign in with verified email"}</button>
      {mode === "login" && <button className="button button-ghost" type="button" disabled={busy} onClick={resetPassword}>Reset Firebase password</button>}
    </form></details>}
    {notice && <p className="form-message" role="status">{notice}</p>}
    {error && <p className="form-message error" role="alert">{error}</p>}
    {mode !== "link" && <p className="firebase-sign-in__divider">Or use your existing CineBook account</p>}
  </section>;
}
