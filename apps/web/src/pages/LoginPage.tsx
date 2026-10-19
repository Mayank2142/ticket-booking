import { useEffect, useRef, useState, type FormEvent } from "react";
import type { UserRole } from "@cinebook/shared";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import loginCinema from "../assets/cinebook-login-cinema.png";
import { clearFieldError, FieldError, fieldErrorProps, validateForm, type FieldErrors } from "../components/FormValidation";
import { FirebaseSignIn } from "../components/FirebaseSignIn";
import { firebaseErrorMessage, getFirebaseConfig, resetFirebasePassword } from "../lib/firebase";

function roleDestination(role: UserRole) {
  if (role === "ADMIN") return "/admin";
  if (role === "ORGANISER") return "/organiser/events";
  return "/";
}

function safeDestination(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [firebaseEnabled, setFirebaseEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => { let active = true; getFirebaseConfig().then((config) => { if (active) setFirebaseEnabled(Boolean(config)); }); return () => { active = false; }; }, []);

  if (loading) return <div className="route-loader" role="status"><span /><p>Restoring your session…</p></div>;
  if (user) return <Navigate to={safeDestination(searchParams.get("next"), roleDestination(user.role))} replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const nextErrors = validateForm(event.currentTarget);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const loggedInUser = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      navigate(safeDestination(searchParams.get("next"), roleDestination(loggedInUser.role)), { replace: true });
    } catch (reason) {
      setError(firebaseErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword() {
    const email = String(formRef.current ? new FormData(formRef.current).get("email") ?? "" : "").trim();
    setError(""); setNotice("");
    if (!email || !formRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.validity.valid) {
      setError("Enter a valid email address above to request a password reset.");
      formRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.focus();
      return;
    }
    setSubmitting(true);
    try { await resetFirebasePassword(email); setNotice("If this email has a verified-email password account, check its inbox for a reset link."); }
    catch (reason) { setError(firebaseErrorMessage(reason)); }
    finally { setSubmitting(false); }
  }

  return (
    <section className="auth-page" aria-labelledby="login-title">
      <div className="auth-art">
        <img src={loginCinema} alt="Premium cinema auditorium with a digital ticket entrance" />
        <div className="auth-art-overlay" />
        <div className="auth-art-copy"><p className="kicker">Welcome back</p><h2>Your next great night is waiting.</h2><p>Return to your tickets, seat holds and waitlist offers.</p></div>
      </div>
      <div className="auth-panel">
        <p className="kicker">Member access</p>
        <h1 id="login-title">Log in to CineBook</h1>
        <p className="auth-intro">Use your account to continue booking securely.</p>
        <FirebaseSignIn disabled={submitting} onBusyChange={setGoogleBusy} onComplete={(signedIn) => navigate(safeDestination(searchParams.get("next"), roleDestination(signedIn.role)), { replace: true })} />
        <form ref={formRef} className="auth-form" aria-busy={submitting || googleBusy} onSubmit={onSubmit} onInput={(event) => clearFieldError(event, setFieldErrors)} noValidate>
          <fieldset className="auth-email-fields" disabled={submitting || googleBusy}>
          <label><span>Email address</span><input className="form-control" name="email" type="email" required autoComplete="email" placeholder="you@example.com" {...fieldErrorProps(fieldErrors, "email")} /><FieldError errors={fieldErrors} name="email" /></label>
          <label><span>Password</span><div className="password-field"><input className="form-control" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Enter your password" {...fieldErrorProps(fieldErrors, "password")} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div><FieldError errors={fieldErrors} name="password" /></label>
          {firebaseEnabled && <button className="auth-email-reset" type="button" onClick={resetPassword}>Reset verified-email password</button>}
          {notice && <p className="form-message" role="status">{notice}</p>}
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button className="button button-primary submit-button" type="submit" disabled={submitting}>{submitting ? "Logging in…" : "Continue with Email"}</button>
          </fieldset>
        </form>
        <p className="auth-switch">New to CineBook? <Link to="/register">Create an account</Link></p>
        <div className="demo-hint"><strong>Demo customer</strong><span>customer@demo.com · password123</span></div>
      </div>
    </section>
  );
}
