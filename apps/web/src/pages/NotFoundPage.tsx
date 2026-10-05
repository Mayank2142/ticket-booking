import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="status-card not-found">
      <span>404</span>
      <h1>This page could not be found.</h1>
      <p>The existing CineBook application remains available while each route is migrated safely.</p>
      <Link className="button button-primary" to="/">Return to discovery</Link>
    </section>
  );
}
