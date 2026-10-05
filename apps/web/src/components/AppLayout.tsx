import type { DiscoveryOptionsDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { MobileNavigation } from "./AppNavigation";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

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
      <SiteHeader
        user={user}
        loading={loading}
        cities={cities}
        city={city}
        theme={theme}
        workspace={workspace}
        onCityChange={changeCity}
        onThemeChange={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        onLogout={onLogout}
      />
      <MobileNavigation user={user} loading={loading} cities={cities} city={city} onCityChange={changeCity} />
      <main id="main-content" tabIndex={-1}><Outlet /></main>
      <SiteFooter cities={cities} />
    </div>
  );
}
