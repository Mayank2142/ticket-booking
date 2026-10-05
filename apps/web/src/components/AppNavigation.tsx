import type { AuthUserDto } from "@cinebook/shared";
import { NavLink } from "react-router-dom";
import { MapPinIcon } from "./ui";

function CitySelector({ cities, city, onCityChange, mobile = false }: {
  cities: string[];
  city: string;
  onCityChange: (city: string) => void;
  mobile?: boolean;
}) {
  return (
    <label className={mobile ? undefined : "header-location"}>
      <MapPinIcon />
      <span className="sr-only">Select city</span>
      <select
        aria-label={mobile ? "Select city on mobile" : "Select city"}
        value={city}
        onChange={(event) => onCityChange(event.target.value)}
      >
        <option value="ALL">All cities</option>
        {cities.map((item) => <option value={item} key={item}>{item}</option>)}
      </select>
    </label>
  );
}

export function PrimaryNavigation({ user }: { user: AuthUserDto | null }) {
  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      <NavLink to="/" end>Explore</NavLink>
      <NavLink to="/movies">Movies</NavLink>
      <NavLink to="/live-events">Live Events</NavLink>
      {user?.role === "CUSTOMER" && <NavLink to="/bookings">My Tickets</NavLink>}
      {user?.role === "CUSTOMER" && <NavLink to="/saved">Saved</NavLink>}
      {user?.role === "CUSTOMER" && <NavLink to="/waitlist">Waitlist</NavLink>}
      {user?.role === "ORGANISER" && <NavLink to="/organiser/events">Organiser</NavLink>}
      {user?.role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
    </nav>
  );
}

export function MobileNavigation({ user, loading, cities, city, onCityChange }: {
  user: AuthUserDto | null;
  loading: boolean;
  cities: string[];
  city: string;
  onCityChange: (city: string) => void;
}) {
  return (
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
      <CitySelector cities={cities} city={city} onCityChange={onCityChange} mobile />
    </nav>
  );
}

export { CitySelector };
