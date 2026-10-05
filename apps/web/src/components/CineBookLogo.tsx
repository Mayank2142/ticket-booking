import { useId } from "react";

export function CineBookLogo({ compact = false }: { compact?: boolean }) {
  const instanceId = useId().replace(/:/g, "");
  const violetId = `cinebook-violet-${instanceId}`;
  const cyanId = `cinebook-cyan-${instanceId}`;
  return (
    <span className={`cinebook-logo ${compact ? "cinebook-logo-compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" role="img">
        <defs>
          <linearGradient id={violetId} x1="8" y1="8" x2="31" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c7bfff" />
            <stop offset="1" stopColor="#8b7cff" />
          </linearGradient>
          <linearGradient id={cyanId} x1="25" y1="8" x2="31" y2="15" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5de6ff" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect x="2.5" y="2.5" width="35" height="35" rx="10" fill="#141a2a" stroke="#293249" />
        <path d="M24 11.5c-6.3 0-11.5 3.8-11.5 8.5S17.7 28.5 24 28.5" stroke={`url(#${violetId})`} strokeWidth="2.6" strokeLinecap="round" />
        <path d="m18.2 15.3 8.2 4.7-8.2 4.7v-9.4Z" fill={`url(#${violetId})`} />
        <circle cx="29" cy="12" r="2.5" fill={`url(#${cyanId})`} />
      </svg>
      {!compact && <span className="cinebook-wordmark">Cine<span>Book</span><i /></span>}
    </span>
  );
}
