import { useEffect, useRef, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Card } from "../components/ui/Card";
import "./CustomerPages.css";

/** Presentation shared only by the customer account and ticket routes. */
export function CustomerPageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <>
    <header className="customer-heading"><div><p className="customer-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>
    <nav className="customer-navigation" aria-label="Customer account navigation">
      <NavLink to="/bookings" aria-label="My Tickets — account navigation">My Tickets</NavLink><NavLink to="/saved" aria-label="Saved — account navigation">Saved</NavLink><NavLink to="/waitlist" aria-label="Waitlist — account navigation">Waitlist</NavLink><NavLink to="/account" aria-label="Account & settings — account navigation">Account & settings</NavLink>
    </nav>
  </>;
}

export function CustomerFeedback({ children, error = false, focus = false }: { children: ReactNode; error?: boolean; focus?: boolean }) {
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!focus) return;
    feedback.current?.focus({ preventScroll: true });
    feedback.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [children, focus]);
  return <p ref={feedback} tabIndex={focus ? -1 : undefined} className={`customer-feedback ${error ? "customer-feedback--error" : ""}`} role={error ? "alert" : "status"}>{children}</p>;
}

export function CustomerEmptyState({ title, description, action, error = false }: { title: string; description: string; action?: ReactNode; error?: boolean }) {
  return <Card className={`customer-empty ${error ? "customer-empty--error" : ""}`}><span className="customer-empty-icon" aria-hidden="true">{error ? "!" : "◇"}</span><h2>{title}</h2><p>{description}</p>{action}</Card>;
}

export function CustomerLoading({ label }: { label: string }) {
  return <div className="customer-loading" role="status" aria-busy="true"><p>{label}</p><div className="customer-loading-grid" aria-hidden="true"><div /><div /></div></div>;
}
