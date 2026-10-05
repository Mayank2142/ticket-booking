import { useState, type FormEvent } from "react";
import type { UserRole } from "@cinebook/shared";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import loginCinema from "../assets/cinebook-login-cinema.png";
import { clearFieldError, FieldError, fieldErrorProps, validateForm, type FieldErrors } from "../components/FormValidation";

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
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  if (loading) return <div className="route-loader" role="status"><span /><p>Restoring your session…</p></div>;
  if (user) return <Navigate to={safeDestination(searchParams.get("next"), roleDestination(user.role))} replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const nextErrors = validateForm(event.currentTarget);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const loggedInUser = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      navigate(safeDestination(searchParams.get("next"), roleDestination(loggedInUser.role)), { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
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
        <form className="auth-form" onSubmit={onSubmit} onInput={(event) => clearFieldError(event, setFieldErrors)} noValidate>
          <label><span>Email address</span><input className="form-control" name="email" type="email" required autoComplete="email" placeholder="you@example.com" {...fieldErrorProps(fieldErrors, "email")} /><FieldError errors={fieldErrors} name="email" /></label>
          <label><span>Password</span><div className="password-field"><input className="form-control" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Enter your password" {...fieldErrorProps(fieldErrors, "password")} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div><FieldError errors={fieldErrors} name="password" /></label>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button className="button button-primary submit-button" type="submit" disabled={submitting}>{submitting ? "Logging in…" : "Log in securely"}</button>
        </form>
        <p className="auth-switch">New to CineBook? <Link to="/register">Create an account</Link></p>
        <div className="demo-hint"><strong>Demo customer</strong><span>customer@demo.com · password123</span></div>
      </div>
    </section>
  );
}
