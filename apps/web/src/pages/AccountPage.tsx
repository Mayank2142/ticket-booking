import type { AuthUserDto, CustomerProfileDto, EmailVerificationDeliveryDto } from "@cinebook/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { Button } from "../components/ui/Button";
import { CustomerEmptyState, CustomerFeedback, CustomerLoading, CustomerPageHeading } from "./CustomerPageUI";
import { FirebaseSignIn } from "../components/FirebaseSignIn";
import { confirmFirebaseIdentity, firebaseErrorMessage, resetFirebasePassword } from "../lib/firebase";

export function AccountPage() {
  const { logout, updateSession } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CustomerProfileDto | null>(null);
  const [savedEmail, setSavedEmail] = useState("");
  const [message, setMessage] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [pending, setPending] = useState<"profile" | "password" | "verify" | "verify-status" | "delete" | null>(null);
  const [messageError, setMessageError] = useState(false);

  useEffect(() => { api<{ user: CustomerProfileDto }>("/api/account").then(({ user }) => { setProfile(user); setSavedEmail(user.email); }).catch((reason) => { setMessage(reason instanceof Error ? reason.message : "Account could not be loaded"); setMessageError(true); }); }, []);

  const emailChanged = Boolean(profile && profile.email.trim().toLowerCase() !== savedEmail.trim().toLowerCase());

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setPending("profile"); setMessage(""); setMessageError(false);
    try {
      const result = await api<{ user: CustomerProfileDto; token: string }>("/api/account", { method: "PATCH", body: JSON.stringify(profile) });
      setProfile(result.user);
      setSavedEmail(result.user.email);
      updateSession(result.token, result.user as AuthUserDto);
      setMessage("Profile and notification preferences saved.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Profile update failed"); setMessageError(true); }
    finally { setPending(null); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPending("password"); setMessage(""); setMessageError(false);
    try {
      await api("/api/account/password", { method: "POST", body: JSON.stringify(passwords) });
      setPasswords({ currentPassword: "", newPassword: "" });
      setMessage("Password changed successfully.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Password change failed"); setMessageError(true); }
    finally { setPending(null); }
  }

  async function resendVerification() {
    setPending("verify"); setMessage(""); setMessageError(false);
    try {
      const result = await api<{ queued: boolean; verified: boolean; delivery?: EmailVerificationDeliveryDto }>("/api/account/email-verification/resend", { method: "POST" });
      if (result.verified) await refreshVerification();
      else {
        setProfile((current) => current ? { ...current, emailVerificationDelivery: result.delivery } : current);
        setMessage(result.delivery?.message ?? "Verification email queued. Delivery is not confirmed yet; check your inbox and spam folder.");
      }
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Verification email could not be queued"); setMessageError(true); }
    finally { setPending(null); }
  }

  async function refreshVerification() {
    const { user } = await api<{ user: CustomerProfileDto }>("/api/account");
    setProfile((current) => current ? { ...current, emailVerifiedAt: user.emailVerifiedAt, emailVerificationDelivery: user.emailVerificationDelivery } : current);
    setMessage(user.emailVerifiedAt ? "Your email address is verified." : user.emailVerificationDelivery?.message ?? "Your email is still unverified. Open the verification link, then check again.");
    setMessageError(!user.emailVerifiedAt && ["failed", "retrying", "preview"].includes(user.emailVerificationDelivery?.state ?? ""));
  }

  async function checkVerification() {
    setPending("verify-status"); setMessage(""); setMessageError(false);
    try { await refreshVerification(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Verification status could not be checked."); setMessageError(true); }
    finally { setPending(null); }
  }

  async function deleteAccount() {
    setPending("delete"); setMessage(""); setMessageError(false);
    try {
      const firebaseIdToken = profile?.passwordLoginEnabled === false ? await confirmFirebaseIdentity(profile.email, profile.firebaseProvider, deletePassword) : undefined;
      await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: deletePassword, firebaseIdToken }) });
      await logout();
      navigate("/");
    } catch (reason) { setMessage(firebaseErrorMessage(reason)); setMessageError(true); }
    finally { setPending(null); }
  }

  async function resetProviderPassword() {
    if (!profile) return;
    setPending("password"); setMessage(""); setMessageError(false);
    try { await resetFirebasePassword(profile.email); setMessage("If this email has a Firebase password account, check its inbox for a reset link."); }
    catch (reason) { setMessage(firebaseErrorMessage(reason)); setMessageError(true); }
    finally { setPending(null); }
  }

  return <section className="customer-space profile-page">
    <CustomerPageHeading eyebrow="Customer account" title="Profile & preferences" description="Manage identity, reminders, security, and account access." />
    {message && !deleteRequested && <CustomerFeedback error={messageError} focus>{message}</CustomerFeedback>}
    {!profile ? message ? <CustomerEmptyState error title="Account unavailable" description="Your account details could not be loaded. Please try again later." /> : <CustomerLoading label="Loading your account…" /> : <div className="profile-grid">
      <form className="account-form customer-profile-main" onSubmit={saveProfile} aria-busy={pending === "profile"}>
        <h2>Personal details</h2><p>Update your contact details and choose the emails you want to receive.</p>
        <label>Full name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label>
        <label>Email address<input type="email" value={profile.email} readOnly={profile.firebaseLinked} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required />{profile.firebaseLinked && <small>This email is linked to your Firebase identity and cannot be changed in this form.</small>}</label>
        <section className="email-verification-panel" aria-label="Email verification">
          <div className={`verification-state ${!emailChanged && profile.emailVerifiedAt ? "verified" : "pending"}`}>
            <strong>{emailChanged ? "Save your new email address first" : profile.emailVerifiedAt ? "Email verified" : "Email verification pending"}</strong>
            {!emailChanged && profile.emailVerifiedAt && <span>Verified {new Date(profile.emailVerifiedAt).toLocaleDateString("en-IN")}</span>}
          </div>
          {emailChanged ? <p>Save changes before requesting verification. Links are sent only to your saved address.</p> : !profile.emailVerifiedAt && <>
            <p>{profile.emailVerificationDelivery?.message ?? "Verify your saved email by opening the link in your inbox. Requesting an email alone does not verify the address."}</p>
            <div className="email-verification-actions">
              <Button type="button" variant="secondary" size="small" disabled={pending !== null} onClick={resendVerification}>{pending === "verify" ? "Requesting…" : "Send verification email"}</Button>
              <Button type="button" variant="secondary" size="small" disabled={pending !== null} onClick={checkVerification}>{pending === "verify-status" ? "Checking…" : "Check verification status"}</Button>
            </div>
            {!profile.firebaseLinked && <a href="#account-google-sign-in">Verify with Google using the same email instead</a>}
          </>}
        </section>
        <fieldset><legend>Email preferences</legend>
          <label className="check-row"><input type="checkbox" checked={profile.reminderEmails} onChange={(event) => setProfile({ ...profile, reminderEmails: event.target.checked })} /> Booking and event reminders</label>
          <label className="check-row"><input type="checkbox" checked={profile.waitlistAlerts} onChange={(event) => setProfile({ ...profile, waitlistAlerts: event.target.checked })} /> Waitlist offer alerts</label>
          <p className="email-preference-hint">Waitlist alerts are emails about your queue and seat offers. Turning them off does not remove your place; check My waitlists for offers and expiry times.</p>
        </fieldset>
        <Button type="submit" disabled={pending !== null}>{pending === "profile" ? "Saving…" : "Save changes"}</Button>
      </form>
      {profile.passwordLoginEnabled === false ? <section className="account-form"><h2>Sign-in security</h2><p>{profile.firebaseProvider === "password" ? "Your password is managed by Firebase. Reset it by verified email." : "You use Google sign-in. Manage your Google password in your Google Account."}</p>{profile.firebaseProvider === "password" ? <Button variant="secondary" disabled={pending !== null} onClick={resetProviderPassword}>Send password reset email</Button> : <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">Google Account security ↗</a>}</section> : <form className="account-form" onSubmit={changePassword} aria-busy={pending === "password"}><h2>Change password</h2><p>Keep your existing CineBook password access secure.</p><label>Current password<input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} required /></label><label>New password<input type="password" autoComplete="new-password" minLength={8} value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} required /><small>Use 8–128 characters with at least one letter and one number.</small></label><Button type="submit" variant="secondary" disabled={pending !== null}>{pending === "password" ? "Changing…" : "Change password"}</Button></form>}
      {!profile.firebaseLinked && <section className="account-form" id="account-google-sign-in"><h2>Optional Google sign-in</h2><p>Link Google using your saved email to verify this address. Your existing password, bookings and role are preserved.</p><FirebaseSignIn mode="link" onComplete={() => { api<{ user: CustomerProfileDto }>("/api/account").then(({ user }) => { setProfile(user); setSavedEmail(user.email); setMessage("Google account linked and email verified. Your existing login still works."); setMessageError(false); }).catch(() => { setMessage("Account linked. Reload to refresh your profile."); }); }} /></section>}
      <form className="account-form danger-zone" onSubmit={(event) => { event.preventDefault(); setMessage(""); setDeleteRequested(true); }}><h2>Delete account</h2><p>This permanently removes your profile, tickets, favourites, and waitlists.</p>{profile.passwordLoginEnabled !== false || profile.firebaseProvider === "password" ? <label>Confirm password<input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required /></label> : <p>Google will ask you to sign in again when you confirm deletion.</p>}<Button type="submit" variant="danger" disabled={pending !== null}>Delete my account</Button></form>
    </div>}
    {deleteRequested && <AccessibleDialog labelledBy="delete-account-title" className="customer-dialog" locked={pending === "delete"} onClose={() => setDeleteRequested(false)}><span className="customer-dialog-icon" aria-hidden="true">!</span><h2 id="delete-account-title">Permanently delete your account?</h2><p>Your profile, bookings, favourites and waitlists will be removed. This action cannot be undone.</p>{message && <CustomerFeedback error={messageError}>{message}</CustomerFeedback>}<div className="customer-dialog-actions"><Button variant="secondary" disabled={pending === "delete"} onClick={() => setDeleteRequested(false)}>Keep my account</Button><Button variant="danger" disabled={pending === "delete"} aria-busy={pending === "delete"} onClick={deleteAccount}>{pending === "delete" ? "Deleting…" : "Delete my account"}</Button></div></AccessibleDialog>}
  </section>;
}
