import type { AuthUserDto, CustomerProfileDto } from "@cinebook/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { Button } from "../components/ui/Button";
import { CustomerEmptyState, CustomerFeedback, CustomerLoading, CustomerPageHeading } from "./CustomerPageUI";

export function AccountPage() {
  const { logout, updateSession } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CustomerProfileDto | null>(null);
  const [message, setMessage] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [pending, setPending] = useState<"profile" | "password" | "verify" | "delete" | null>(null);
  const [messageError, setMessageError] = useState(false);

  useEffect(() => { api<{ user: CustomerProfileDto }>("/api/account").then(({ user }) => setProfile(user)).catch((reason) => { setMessage(reason instanceof Error ? reason.message : "Account could not be loaded"); setMessageError(true); }); }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setPending("profile"); setMessage(""); setMessageError(false);
    try {
      const result = await api<{ user: CustomerProfileDto; token: string }>("/api/account", { method: "PATCH", body: JSON.stringify(profile) });
      setProfile(result.user);
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
      const result = await api<{ queued: boolean; verified: boolean }>("/api/account/email-verification/resend", { method: "POST" });
      setMessage(result.verified ? "Your email is already verified." : "Verification email queued. Open the local preview in the administrator job monitor.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Verification email could not be queued"); setMessageError(true); }
    finally { setPending(null); }
  }

  async function deleteAccount() {
    setPending("delete"); setMessage(""); setMessageError(false);
    try {
      await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) });
      logout();
      navigate("/");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Account deletion failed"); setMessageError(true); }
    finally { setPending(null); }
  }

  return <section className="customer-space profile-page">
    <CustomerPageHeading eyebrow="Customer account" title="Profile & preferences" description="Manage identity, reminders, security, and account access." />
    {message && !deleteRequested && <CustomerFeedback error={messageError} focus>{message}</CustomerFeedback>}
    {!profile ? message ? <CustomerEmptyState error title="Account unavailable" description="Your account details could not be loaded. Please try again later." /> : <CustomerLoading label="Loading your account…" /> : <div className="profile-grid">
      <form className="account-form customer-profile-main" onSubmit={saveProfile} aria-busy={pending === "profile"}><h2>Personal details</h2><p>Update your contact details and choose the emails you want to receive.</p><label>Full name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label><label>Email address<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></label><div className={`verification-state ${profile.emailVerifiedAt ? "verified" : "pending"}`}><strong>{profile.emailVerifiedAt ? "Email verified" : "Email verification pending"}</strong>{profile.emailVerifiedAt ? <span>Verified {new Date(profile.emailVerifiedAt).toLocaleDateString("en-IN")}</span> : <Button variant="secondary" size="small" disabled={pending !== null} onClick={resendVerification}>{pending === "verify" ? "Sending…" : "Send verification email"}</Button>}</div><fieldset><legend>Email preferences</legend><label className="check-row"><input type="checkbox" checked={profile.reminderEmails} onChange={(event) => setProfile({ ...profile, reminderEmails: event.target.checked })} /> Booking and event reminders</label><label className="check-row"><input type="checkbox" checked={profile.waitlistAlerts} onChange={(event) => setProfile({ ...profile, waitlistAlerts: event.target.checked })} /> Waitlist offer alerts</label></fieldset><Button type="submit" disabled={pending !== null}>{pending === "profile" ? "Saving…" : "Save changes"}</Button></form>
      <form className="account-form" onSubmit={changePassword} aria-busy={pending === "password"}><h2>Change password</h2><p>Keep your account access secure.</p><label>Current password<input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} required /></label><label>New password<input type="password" autoComplete="new-password" minLength={8} value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} required /><small>Use 8–128 characters with at least one letter and one number.</small></label><Button type="submit" variant="secondary" disabled={pending !== null}>{pending === "password" ? "Changing…" : "Change password"}</Button></form>
      <form className="account-form danger-zone" onSubmit={(event) => { event.preventDefault(); setMessage(""); setDeleteRequested(true); }}><h2>Delete account</h2><p>This permanently removes your profile, tickets, favourites, and waitlists.</p><label>Confirm password<input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required /></label><Button type="submit" variant="danger" disabled={pending !== null}>Delete my account</Button></form>
    </div>}
    {deleteRequested && <AccessibleDialog labelledBy="delete-account-title" className="customer-dialog" locked={pending === "delete"} onClose={() => setDeleteRequested(false)}><span className="customer-dialog-icon" aria-hidden="true">!</span><h2 id="delete-account-title">Permanently delete your account?</h2><p>Your profile, bookings, favourites and waitlists will be removed. This action cannot be undone.</p>{message && <CustomerFeedback error={messageError}>{message}</CustomerFeedback>}<div className="customer-dialog-actions"><Button variant="secondary" disabled={pending === "delete"} onClick={() => setDeleteRequested(false)}>Keep my account</Button><Button variant="danger" disabled={pending === "delete"} aria-busy={pending === "delete"} onClick={deleteAccount}>{pending === "delete" ? "Deleting…" : "Delete my account"}</Button></div></AccessibleDialog>}
  </section>;
}
