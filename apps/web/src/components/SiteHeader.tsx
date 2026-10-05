import type { AuthUserDto } from "@cinebook/shared";
import { Link, NavLink } from "react-router-dom";
import { CitySelector, PrimaryNavigation } from "./AppNavigation";
import { CineBookLogo } from "./CineBookLogo";
import { Button, ButtonLink, MoonIcon, SunIcon } from "./ui";

export function SiteHeader({ user, loading, cities, city, theme, workspace, onCityChange, onThemeChange, onLogout }: {
  user: AuthUserDto | null;
  loading: boolean;
  cities: string[];
  city: string;
  theme: "dark" | "light";
  workspace: string;
  onCityChange: (city: string) => void;
  onThemeChange: () => void;
  onLogout: () => void;
}) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <header className="site-header">
      <NavLink to="/" className="brand site-header__brand" aria-label="CineBook home">
        <CineBookLogo />
      </NavLink>
      <PrimaryNavigation user={user} />
      <div className="nav-actions">
        <CitySelector cities={cities} city={city} onCityChange={onCityChange} />
        <button
          type="button"
          className="theme-toggle"
          onClick={onThemeChange}
          aria-label={`Switch to ${nextTheme} mode`}
          title={`Switch to ${nextTheme} mode`}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        {loading ? <span className="nav-auth-skeleton" aria-label="Loading account" /> : user ? (
          <>
            <Link className="text-link nav-user-name" to={user.role === "CUSTOMER" ? "/account" : workspace}>Hi, {user.name.split(" ")[0]}</Link>
            <Button variant="secondary" size="small" onClick={onLogout}>Log out</Button>
          </>
        ) : (
          <>
            <Link className="text-link" to="/login">Log in</Link>
            <ButtonLink to="/register" size="small">Create account</ButtonLink>
          </>
        )}
      </div>
    </header>
  );
}
