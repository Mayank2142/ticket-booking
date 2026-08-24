"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, AUTH_CHANGED_EVENT, clearToken, getToken, User } from "@/lib/client";

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;

    function syncUser() {
      if (!getToken()) {
        if (active) setUser(null);
        return;
      }
      api<{ user: User }>("/api/auth/me")
        .then((data) => { if (active) setUser(data.user); })
        .catch(() => { if (active) setUser(null); clearToken(); });
    }

    function syncAcrossTabs(event: StorageEvent) {
      if (event.key === "token") syncUser();
    }

    syncUser();
    window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
    window.addEventListener("storage", syncAcrossTabs);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
      window.removeEventListener("storage", syncAcrossTabs);
    };
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const links = [
    { href: "/", label: "Home" },
    { href: "/#now-showing", label: "Movies" },
    { href: "/#live-events", label: "Events" },
    ...(user?.role === "CUSTOMER" ? [{ href: "/bookings", label: "My bookings" }] : []),
    ...(user?.role === "ADMIN" ? [{ href: "/admin/venues", label: "Venues" }] : []),
    ...(user?.role === "ORGANISER" || user?.role === "ADMIN"
      ? [{ href: "/organiser/events", label: "Dashboard" }]
      : []),
  ];

  function logout() {
    clearToken();
    setOpen(false);
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#020806]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-black shadow-lg shadow-emerald-500/20">C</span>
          CineBook
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={`nav-link ${pathname === link.href ? "nav-link-active" : ""}`}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/#discover" aria-label="Search events" className="icon-btn"><SearchIcon /></Link>
          {user ? (
            <div className="group relative">
              <button className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-3 text-sm">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400 font-semibold text-black">{user.name.charAt(0).toUpperCase()}</span>
                <span className="max-w-24 truncate">{user.name}</span>
              </button>
              <div className="invisible absolute right-0 top-full mt-2 w-44 translate-y-1 rounded-2xl border border-white/10 bg-[#0a1510] p-2 opacity-0 shadow-2xl transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <p className="px-3 py-2 text-xs text-white/45">{user.role.toLowerCase()}</p>
                <button onClick={logout} className="w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/[0.07]">Log out</button>
              </div>
            </div>
          ) : (
            <><Link href="/login" className="nav-link">Log in</Link><Link href="/register" className="btn btn-primary">Create account</Link></>
          )}
        </div>

        <button onClick={() => setOpen((value) => !value)} className="icon-btn md:hidden" aria-label="Toggle navigation" aria-expanded={open}>
          <span className="text-xl">{open ? "×" : "☰"}</span>
        </button>
      </div>

      {open && (
        <nav className="border-t border-white/[0.06] bg-[#020806] px-4 py-4 md:hidden" aria-label="Mobile navigation">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-1">
            {links.map((link) => <Link key={link.href} href={link.href} className="rounded-xl px-3 py-3 text-sm hover:bg-white/[0.06]">{link.label}</Link>)}
            {user ? <button onClick={logout} className="mt-2 rounded-xl border border-white/10 px-3 py-3 text-left text-sm">Log out</button> : (
              <div className="mt-3 grid grid-cols-2 gap-2"><Link href="/login" className="btn">Log in</Link><Link href="/register" className="btn btn-primary">Register</Link></div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}
