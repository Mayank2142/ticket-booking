import type { UserRole } from "@cinebook/shared";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import loginCinema from "../assets/cinebook-login-cinema.png";
import { clearFieldError, FieldError, fieldErrorProps, validateForm, type FieldErrors } from "../components/FormValidation";

type RegistrationRole = Extract<UserRole, "CUSTOMER" | "ORGANISER">;

export function RegisterPage() {
  const { user, loading, register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  if (loading) return <div className="route-loader" role="status"><span /><p>Restoring your session…</p></div>;
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const nextErrors = validateForm(event.currentTarget, {
      password: (value) => /[A-Za-z]/.test(value) && /\d/.test(value) ? null : "Password must include at least one letter and one number.",
    });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const createdUser = await register({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        role: String(form.get("role") ?? "CUSTOMER") as RegistrationRole
      });
      navigate(createdUser.role === "ORGANISER" ? "/organiser/events" : "/", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-page auth-page-reversed" aria-labelledby="register-title">
      <div className="auth-panel">
        <p className="kicker">Join CineBook</p>
        <h1 id="register-title">Create your account</h1>
        <p className="auth-intro">Reserve exact seats, receive QR passes, and never miss a cancellation.</p>
        <form className="auth-form" onSubmit={onSubmit} onInput={(event) => clearFieldError(event, setFieldErrors)} noValidate>
          <label><span>Full name</span><input className="form-control" name="name" required minLength={2} maxLength={80} autoComplete="name" placeholder="Your name" {...fieldErrorProps(fieldErrors, "name")} /><FieldError errors={fieldErrors} name="name" /></label>
          <label><span>Email address</span><input className="form-control" name="email" type="email" required autoComplete="email" placeholder="you@example.com" {...fieldErrorProps(fieldErrors, "email")} /><FieldError errors={fieldErrors} name="email" /></label>
          <label><span>Password</span><div className="password-field"><input className="form-control" name="password" type={showPassword ? "text" : "password"} minLength={8} maxLength={128} required autoComplete="new-password" placeholder="At least 8 characters" {...fieldErrorProps(fieldErrors, "password")} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div><small>Use at least 8 characters with a letter and a number.</small><FieldError errors={fieldErrors} name="password" /></label>
          <label><span>I want to</span><select className="form-control" name="role" defaultValue="CUSTOMER" {...fieldErrorProps(fieldErrors, "role")}><option value="CUSTOMER">Book tickets</option><option value="ORGANISER">Create and manage events</option></select><FieldError errors={fieldErrors} name="role" /></label>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button className="button button-primary submit-button" type="submit" disabled={submitting}>{submitting ? "Creating account…" : "Create account"}</button>
        </form>
        <p className="auth-switch">Already a member? <Link to="/login">Log in</Link></p>
      </div>
      <div className="auth-art auth-art-mirrored">
        <img src={loginCinema} alt="Premium cinema auditorium with a digital ticket entrance" />
        <div className="auth-art-overlay" />
        <div className="auth-art-copy"><p className="kicker">Live availability</p><h2>Pick the view. Own the moment.</h2><p>Secure holds and fair waitlists make every seat count.</p></div>
      </div>
    </section>
  );
}
