import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<"working" | "verified" | "error">("working");
  const [message, setMessage] = useState("Verifying your email address…");
  const submittedToken = useRef<string | null>(null);
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) { setState("error"); setMessage("This verification link is missing its token."); return; }
    if (submittedToken.current === token) return;
    submittedToken.current = token;
    api<{ verified: boolean }>("/api/account/email-verification/confirm", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => { setState("verified"); setMessage("Your email address is verified."); })
      .catch((reason) => { setState("error"); setMessage(reason instanceof Error ? reason.message : "Email verification failed"); });
  }, [token]);

  return <section className="account-page"><div className="empty-bookings email-verification-result"><span>{state === "working" ? "…" : state === "verified" ? "✓" : "!"}</span><h1>{state === "verified" ? "Email verified" : state === "error" ? "Verification unavailable" : "Checking verification"}</h1><p role="status">{message}</p><Link className="button button-primary" to="/account">Open account</Link></div></section>;
}
