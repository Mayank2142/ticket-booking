import type { DiscoveryOptionsDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { CineBookLogo } from "./CineBookLogo";

export function AppLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [cities, setCities] = useState<string[]>([]);
  const [city, setCity] = useState(() => window.localStorage.getItem("cinebook:city") || "ALL");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = window.localStorage.getItem("cinebook:theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("cinebook:theme", theme);
  }, [theme]);

  useEffect(() => {
    api<DiscoveryOptionsDto>("/api/discovery/options")
      .then((result) => setCities(result.cities))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (location.pathname !== "/" && location.pathname !== "/movies" && location.pathname !== "/live-events") return;
    setCity(new URLSearchParams(location.search).get("city") || "ALL");
  }, [location.pathname, location.search]);

  function onLogout() {
    logout();
    navigate("/");
  }

  function changeCity(nextCity: string) {
    setCity(nextCity);
    window.localStorage.setItem("cinebook:city", nextCity);
    const params = new URLSearchParams(location.search);
    if (nextCity === "ALL") params.delete("city");
    else params.set("city", nextCity);
    const destination = location.pathname === "/movies" || location.pathname === "/live-events" || location.pathname === "/search" ? location.pathname : "/";
    navigate({ pathname: destination, search: params.toString(), hash: destination === "/" ? "#discover" : "" });
  }

  const workspace = user?.role === "ADMIN" ? "/admin" : "/organiser/events";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <NavLink to="/" className="brand" aria-label="CineBook home">
          <CineBookLogo />
        </NavLink>
        <nav className="primary-nav" aria-label="Primary navigation">
          <NavLink to="/" end>Explore</NavLink>
          <NavLink to="/movies">Movies</NavLink>
          <NavLink to="/live-events">Live Events</NavLink>
          {user?.role === "CUSTOMER" && <Link to="/bookings">My Tickets</Link>}
          {user?.role === "CUSTOMER" && <Link to="/saved">Saved</Link>}
          {user?.role === "CUSTOMER" && <Link to="/waitlist">Waitlist</Link>}
          {user?.role === "ORGANISER" && <NavLink to="/organiser/events">Organiser</NavLink>}
          {user?.role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="nav-actions">
          <label className="header-location"><span aria-hidden="true">⌖</span><span className="sr-only">Select city</span><select aria-label="Select city" value={city} onChange={(event) => changeCity(event.target.value)}><option value="ALL">All cities</option>{cities.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <button type="button" className="theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span></button>
          {loading ? <span className="nav-auth-skeleton" aria-label="Loading account" /> : user ? (
            <>
              <Link className="text-link nav-user-name" to={user.role === "CUSTOMER" ? "/account" : workspace}>Hi, {user.name.split(" ")[0]}</Link>
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
      <nav className="mobile-discovery-nav" aria-label="Mobile discovery navigation">
        <NavLink to="/" end>Explore</NavLink>
        <NavLink to="/movies">Movies</NavLink>
        <NavLink to="/live-events">Live Events</NavLink>
        <NavLink to="/search">Search</NavLink>
        {user?.role === "CUSTOMER" && <NavLink to="/bookings">Tickets</NavLink>}
        {user?.role === "CUSTOMER" && <NavLink to="/saved">Saved</NavLink>}
        {user?.role === "CUSTOMER" && <NavLink to="/waitlist">Waitlist</NavLink>}
        {user?.role === "CUSTOMER" && <NavLink to="/account">Profile</NavLink>}
        {user?.role === "ORGANISER" && <NavLink to="/organiser/events">Workspace</NavLink>}
        {user?.role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
        {!loading && !user && <NavLink to="/login">Log in</NavLink>}
        <label><span aria-hidden="true">⌖</span><span className="sr-only">Select city</span><select aria-label="Select city on mobile" value={city} onChange={(event) => changeCity(event.target.value)}><option value="ALL">All cities</option>{cities.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      </nav>
      <main id="main-content" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer">
        <div className="footer-brand"><CineBookLogo /><p>Fair seats. Live availability. Memorable nights.</p></div>
        <div className="footer-status"><span>All booking services operational</span><p>Secure reservations · Instant QR tickets</p></div>
      </footer>
    </div>
  );
}
