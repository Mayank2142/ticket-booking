# CineBook security

## Deployment status and limits

This repository is a demo, not a security certification. The public administrator and organiser demo logins remain enabled at the owner's explicit request. **Anyone with those documented credentials can access the customer emails, bookings, reports and administrative actions that those roles permit. Do not store real customer data in this deployment.** Application hardening cannot make public administrator credentials private.

Before accepting real customers, disable public privileged demo access, provision a private administrator, require MFA for privileged identities, restrict organiser registration, and separate any public demo from production data. Keep recovery access private. Do not change or delete existing accounts without the owner's approval.

## Authentication and credentials

- Local passwords use salted bcrypt hashes, not plaintext. New passwords are limited to 72 UTF-8 bytes to avoid silent bcrypt truncation. Existing password hashes remain compatible; accounts created with longer passwords should reset them.
- Google/Firebase credentials are verified server-side with Firebase Admin, including revocation checks. The application does not store a customer's Google/Firebase password. New Firebase identities cannot self-assign administrator privileges or silently merge with existing email accounts.
- Browser sessions use host-only `HttpOnly`, `SameSite=Strict` cookies, with `Secure` and the `__Host-` prefix in production. Bearer credentials are no longer saved to local storage or returned in browser-mode login responses. Legacy non-browser bearer API clients remain supported.
- JWTs expire after eight hours, pin HS256, and validate issuer/audience. A keyed account-security stamp makes old sessions invalid after password, email, role or linked Firebase identity changes. Upgrading to these tokens signs out older sessions once, without changing accounts or bookings.
- Signing out expires the browser cookie. A separately copied bearer token is not individually revoked by logout; it remains valid until expiry or an account-security change. Per-device server-side session revocation is a remaining production-hardening item.
- The backend checks the current database role and resource owner, not client-supplied roles. Booking creation responses use an explicit public customer-field selection and never return password hashes, verification token hashes or Firebase identifiers.

## HTTP and abuse protection

- Unsafe browser requests require the protected custom header and are checked against request origins. Untrusted cross-site writes are rejected before route handlers run. Cookie-authenticated reads bypass shared response caches; sensitive responses use `no-store`.
- Request bodies are limited to 64 KiB for both declared-length and streamed requests. HTTP timeouts and concurrent-request limits remain enabled.
- Login throttling includes an account-based bucket, so merely changing a forwarded IP header cannot bypass that account's limit. Without Redis, limits are process-local and reset on restart. Configure the existing Redis support before scaling to multiple instances; CAPTCHA and distributed abuse monitoring remain advisable.
- CSP, frame protection, MIME-sniffing protection and production HSTS remain enabled. Google sign-in retains the popup-compatible opener policy; security headers are not disabled to hide browser warnings.
- CSV exports escape spreadsheet-formula prefixes. Access logs omit query strings, avoiding verification/offer/cron-token leakage through URLs.
- Avoid putting cron credentials in query strings. Use `Authorization: Bearer ...` or `X-Cron-Secret`; legacy query support remains for compatibility.

## Secrets and delivery

Keep database passwords, JWT/cron secrets, Firebase service-account keys and email-provider credentials only in private deployment variables. JWT and cron secrets must be independent random values of at least 32 bytes; production refuses short/default values. Never commit `.env`, private keys or service-account JSON. Firebase web-app configuration is public configuration, not a service-account secret.

Email verification proves address ownership, not delivery-provider permission or inbox receipt. Provider failures do not cancel confirmed bookings. Fix sender configuration before promising transactional email delivery. Do not use public demo email previews for real customer messages: administrators can view those previews and their action links.

## Checks and ongoing work

Run `npm run build`, `npm run lint`, `npm test`, `npm run test:postgres` against a dedicated `_test` database, `npm run test:e2e`, and `npm audit`. CI runs the dependency audit and blocks high/critical advisories. An audit showing zero known dependency advisories is not proof that application logic is free of vulnerabilities.

The October 2026 hardening pass included source review, automated regression tests, dependency checks and a pattern scan of currently tracked text files. It was not a full penetration test, a forensic breach investigation, a complete Git-history secret scan, a Firebase Console rules audit, or a database/backup encryption audit. No claim is made that a breach did or did not occur.

Before a real launch, verify private database networking/backups and retention, Firebase/Google Cloud IAM and authorised domains, MFA and least privilege, distributed rate limits, dependency updates, and incident response. Rotate any credential that may have been exposed; deleting it from the latest source does not remove it from Git history.

## Reporting a vulnerability

Contact the repository owner privately through an available private security-reporting channel. Do not publish passwords, keys, bearer tokens, verification links, QR tickets, customer email addresses or a working exploit against customer data in a public issue. Include the affected route, prerequisites, impact and a minimal non-destructive reproduction using test data.
