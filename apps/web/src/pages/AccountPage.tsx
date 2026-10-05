import type { AuthUserDto, CustomerProfileDto } from "@cinebook/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";

export function AccountPage() {
  const { logout, updateSession } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CustomerProfileDto | null>(null);
  const [message, setMessage] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "" });
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => { api<{ user: CustomerProfileDto }>("/api/account").then(({ user }) => setProfile(user)).catch((reason) => setMessage(reason instanceof Error ? reason.message : "Account could not be loaded")); }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    try {
      const result = await api<{ user: CustomerProfileDto; token: string }>("/api/account", { method: "PATCH", body: JSON.stringify(profile) });
      setProfile(result.user);
      updateSession(result.token, result.user as AuthUserDto);
      setMessage("Profile and notification preferences saved.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Profile update failed"); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/account/password", { method: "POST", body: JSON.stringify(passwords) });
      setPasswords({ currentPassword: "", newPassword: "" });
      setMessage("Password changed successfully.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Password change failed"); }
  }

  async function resendVerification() {
    try {
      const result = await api<{ queued: boolean; verified: boolean }>("/api/account/email-verification/resend", { method: "POST" });
      setMessage(result.verified ? "Your email is already verified." : "Verification email queued. Open the local preview in the administrator job monitor.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Verification email could not be queued"); }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm("Permanently delete your account, bookings, favourites and waitlists?")) return;
    try {
      await api("/api/account", { method: "DELETE", body: JSON.stringify({ password: deletePassword }) });
      logout();
      navigate("/");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Account deletion failed"); }
  }

  return <section className="account-page profile-page">
    <header className="page-heading"><div><p className="kicker">Customer account</p><h1>Profile & preferences</h1><p>Manage identity, reminders, security, and account access.</p></div></header>
    {message && <p className="inline-notice" role="status">{message}</p>}
    {!profile ? <div className="booking-skeleton" /> : <div className="profile-grid">
      <form className="account-form" onSubmit={saveProfile}><h2>Personal details</h2><label>Full name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label><label>Email address<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></label><div className={`verification-state ${profile.emailVerifiedAt ? "verified" : "pending"}`}><strong>{profile.emailVerifiedAt ? "Email verified" : "Email verification pending"}</strong>{profile.emailVerifiedAt ? <span>Verified {new Date(profile.emailVerifiedAt).toLocaleDateString("en-IN")}</span> : <button type="button" onClick={resendVerification}>Send verification email</button>}</div><fieldset><legend>Email preferences</legend><label className="check-row"><input type="checkbox" checked={profile.reminderEmails} onChange={(event) => setProfile({ ...profile, reminderEmails: event.target.checked })} /> Booking and event reminders</label><label className="check-row"><input type="checkbox" checked={profile.waitlistAlerts} onChange={(event) => setProfile({ ...profile, waitlistAlerts: event.target.checked })} /> Waitlist offer alerts</label></fieldset><button className="button button-primary">Save changes</button></form>
      <form className="account-form" onSubmit={changePassword}><h2>Change password</h2><label>Current password<input type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} required /></label><label>New password<input type="password" autoComplete="new-password" minLength={8} value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} required /><small>Use 8–128 characters with at least one letter and one number.</small></label><button className="button button-ghost">Change password</button></form>
      <form className="account-form danger-zone" onSubmit={deleteAccount}><h2>Delete account</h2><p>This permanently removes your profile, tickets, favourites, and waitlists.</p><label>Confirm password<input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required /></label><button className="button danger-button">Delete my account</button></form>
    </div>}
  </section>;
}
