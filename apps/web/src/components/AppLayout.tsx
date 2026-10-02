import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AppLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate("/");
  }

  const workspace = user?.role === "ADMIN" ? "/admin/venues" : "/organiser/events";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <NavLink to="/" className="brand" aria-label="CineBook home">
          <span className="brand-mark">C</span><span>CineBook</span>
        </NavLink>
        <nav className="primary-nav" aria-label="Primary navigation">
          <NavLink to="/" end>Discover</NavLink>
          <Link to="/#movies">Movies</Link>
          <Link to="/#live-events">Live events</Link>
        </nav>
        <div className="nav-actions">
          {loading ? <span className="nav-auth-skeleton" aria-label="Loading account" /> : user ? (
            <>
              <Link className="text-link nav-user-name" to={user.role === "CUSTOMER" ? "/bookings" : workspace}>Hi, {user.name.split(" ")[0]}</Link>
              <button type="button" className="button button-ghost compact" onClick={onLogout}>Log out</button>
            </>
          ) : (
            <>
              <Link className="text-link" to="/login">Log in</Link>
              <Link className="button button-primary compact" to="/register">Create account</Link>
            </>
          )}
        </div>
      </header>
      <main id="main-content" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer">
        <div><strong>CineBook</strong><p>Fair seats. Live availability. Memorable nights.</p></div>
        <p>React application · Payments intentionally excluded</p>
      </footer>
    </div>
  );
}
