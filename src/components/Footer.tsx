import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-white/[0.07] bg-black/30">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-12 md:grid-cols-[1.3fr_repeat(3,1fr)] lg:px-6">
        <div className="max-w-sm">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-black">C</span>
            CineBook
          </Link>
          <p className="mt-4 text-sm leading-6 text-white/50">
            Discover films and live events, reserve your favourite seats, and carry every ticket securely on your phone.
          </p>
        </div>
        <FooterGroup title="Explore" links={["Now showing", "Live events", "Coming soon"]} />
        <FooterGroup title="Support" links={["Help centre", "Contact", "Booking guide"]} />
        <FooterGroup title="Legal" links={["Terms", "Privacy", "Refund policy"]} />
      </div>
      <div className="border-t border-white/[0.06] px-4 py-5 text-center text-xs text-white/35">
        © {new Date().getFullYear()} CineBook. Built for unforgettable nights out.
      </div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm text-white/45">
        {links.map((link) => <li key={link}><span className="cursor-default transition hover:text-white/80">{link}</span></li>)}
      </ul>
    </div>
  );
}
