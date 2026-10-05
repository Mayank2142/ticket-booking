import { Link } from "react-router-dom";
import { CineBookLogo } from "./CineBookLogo";

export function SiteFooter({ cities }: { cities: string[] }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__content">
        <div className="site-footer__about">
          <Link to="/" aria-label="CineBook home"><CineBookLogo /></Link>
          <p>Seamless cinematic and live entertainment reservations across our metropolitan venues.</p>
          <span className="site-footer__assurance"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></svg>Secure reservations · Authentic QR passes</span>
        </div>
        <nav className="site-footer__column" aria-label="Browse cities">
          <h2>Top Metros</h2>
          <ul>{cities.map((city) => <li key={city}><Link to={`/?${new URLSearchParams({ city })}#discover`}>{city}</Link></li>)}</ul>
          {!cities.length && <Link to="/search">Browse all cities</Link>}
        </nav>
        <nav className="site-footer__column" aria-label="Customer help">
          <h2>Support &amp; Help</h2>
          <ul>
            <li><Link to="/bookings">My tickets &amp; cancellations</Link></li>
            <li><Link to="/waitlist">Waitlists &amp; ticket offers</Link></li>
            <li><Link to="/account">Account &amp; preferences</Link></li>
            <li><Link to="/saved">Saved movies &amp; events</Link></li>
          </ul>
        </nav>
      </div>
      <div className="site-footer__bottom"><p>© {new Date().getFullYear()} CineBook. All rights reserved.</p><ul aria-label="Booking features"><li>Secure seat selection</li><li>QR ticket access</li><li>Live availability</li></ul></div>
    </footer>
  );
}
