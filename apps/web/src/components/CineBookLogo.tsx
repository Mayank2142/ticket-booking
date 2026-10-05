export function CineBookLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`cinebook-logo ${compact ? "cinebook-logo-compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <rect x="1" y="1" width="38" height="38" rx="9" fill="#7c3aed" />
        <path d="M12 13h16v4a3 3 0 0 0 0 6v4H12v-4a3 3 0 0 0 0-6v-4Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        <path d="M20 15v2m0 2v2m0 2v2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {!compact && <span className="cinebook-wordmark">Cine<span>Book</span></span>}
    </span>
  );
}
