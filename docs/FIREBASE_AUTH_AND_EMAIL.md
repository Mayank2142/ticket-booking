# Firebase sign-in and ticket email setup

## What changes and what stays

- Existing customer, administrator and organiser password logins are retained.
- Google and Firebase email/password sign-in are additional options, enabled only when all required server configuration is present.
- New Firebase identities always create **CUSTOMER** accounts. Client-supplied roles and Firebase custom roles are not used to grant CineBook privileges.
- Existing email accounts are not merged automatically. Sign in using the original password, then use **Account → Optional Google sign-in** with the same email to link them. Existing bookings, favourites, passwords and roles remain on the original account.
- Firebase email/password users must verify their email before receiving a CineBook session. Firebase sends verification/reset emails; CineBook does not need SMTP for those messages.
- The server checks Firebase signatures, project, expiry and revocation with the Admin SDK before issuing the existing CineBook JWT session. Firebase passwords and Google access tokens are never stored in the booking database.
- Linked email addresses are read-only in the profile form. Firebase-only accounts use provider password recovery and recent Firebase authentication to confirm account deletion.
- Deletion removes CineBook data using the existing workflow, records a durable Firebase identity-deletion job, and prevents that UID from signing back in while cleanup is pending. The worker needs the same Firebase Admin configuration.

## 1. Firebase Console

Use project **cinebook-4cc4b**.

1. Open **Authentication**, click **Get started** if prompted, then under **Sign-in method** enable **Google** and **Email/Password**. Choose the appropriate support email for Google. A read-only check returning `auth/configuration-not-found` means this project still needs its Auth configuration completed.
2. In **Authentication → Settings → Authorised domains**, add `ticket-booking-production-dd12.up.railway.app`. For local testing, authorise `localhost` and `127.0.0.1` as needed; do not assume new projects include them automatically.
3. Check the verification/password-reset templates under **Authentication → Templates**.
4. In **Project settings → General → Your apps**, use the web app configuration. Its API key is a public browser identifier, not an Admin private key. Apply appropriate API-key restrictions without blocking Firebase Authentication.
5. In **Project settings → Service accounts**, generate a private key for a suitable Firebase Admin service account. Keep the JSON file and private key out of Git, screenshots and chat. Configure server-side permissions needed to verify/revoke and delete Auth identities.

## 2. Runtime variables

Set on **both ticket-booking and cinebook-worker** in Railway, and locally in the ignored `.env` when testing:

```dotenv
FIREBASE_PROJECT_ID=cinebook-4cc4b
FIREBASE_WEB_API_KEY=<public web API key>
FIREBASE_AUTH_DOMAIN=cinebook-4cc4b.firebaseapp.com
FIREBASE_APP_ID=1:14981435885:web:c57aab7944b3ff858257e4
FIREBASE_CLIENT_EMAIL=<client_email from service-account JSON>
FIREBASE_PRIVATE_KEY=<private_key from service-account JSON>
```

Never prefix the Admin credentials with `VITE_` or place them in frontend files. The API exposes only the four public web settings at `/api/auth/providers`; browser authentication SDK modules load only when enabled. Changing these values requires a service restart, not rebuilding the frontend. The production verifier deliberately rejects the Auth emulator.

Run `npm run firebase:verify` in the service console to check Admin credentials and Firebase Auth read access without creating users or printing credential values. This is not a substitute for completing Google sign-in and email verification with your own test account.

## 3. Apply the additive database migration

The migration adds nullable identity fields and enables password login for all existing accounts by default. It does not reset or seed customer data.

PostgreSQL:

```bash
npm run db:generate
npm run db:deploy
```

SQLite local demo:

```bash
npm run db:generate
npm run db:deploy:sqlite
```

Apply migrations before starting the updated API and worker. Do not run `db:seed` to add authentication.

## 4. Booking and QR ticket emails

Firebase Authentication sends identity emails, not arbitrary booking attachments. Booking/cancellation/waitlist/reminder emails use the existing durable worker with a separate delivery transport.

For Railway Trial, use the Resend HTTPS API rather than Gmail SMTP:

```dotenv
RESEND_API_KEY=<private sending API key>
EMAIL_FROM=CineBook <tickets@your-verified-domain.example>
```

Add both variables to API and worker. Verify the sender domain in Resend. Provider test senders can restrict recipients to the account owner's address; they do not enable unrestricted customer delivery. Do not claim delivery until an actual booking arrives in the intended recipient inbox and the provider dashboard confirms its state.

### Resend setup, step by step

1. Create a Resend account and open **Domains → Add domain**. Use a domain you own, or a sending subdomain such as `mail.yourdomain.com`. A Gmail address or the Railway-provided `up.railway.app` hostname is not a domain whose DNS you control.
2. Copy the DNS records shown by Resend into your domain provider's DNS settings. Use the exact record names and values provided for your domain, then wait until Resend marks it **Verified**. Do not replace unrelated website or mailbox records.
3. Open **API Keys → Create API key**. Give it a descriptive name, choose sending access restricted to your verified domain when available, and copy the key into Railway directly. Do not put it in Git or chat.
4. On **both** Railway services, `ticket-booking` and `cinebook-worker`, add `RESEND_API_KEY` and `EMAIL_FROM`. For example, use `EMAIL_FROM=CineBook <tickets@mail.yourdomain.com>` when `mail.yourdomain.com` is the verified sending domain. Save and deploy the changes on both services.
5. Sign in with a real customer email address you control and make one test booking. Confirm that the booking still appears in **My Tickets**, then check the recipient inbox and Resend's email dashboard. Open the attached `ticket.png` and confirm that the booking reference and seat details match.
6. If you do not own a domain yet, Resend's test sender is only suitable for restricted testing with your own account email. It does not activate delivery to arbitrary customers. Buying a domain or upgrading a service is your choice, not an automatic deployment step.

Official references: [domain verification](https://resend.com/docs/dashboard/domains/introduction), [API key management](https://resend.com/docs/dashboard/api-keys/introduction), and [current account limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits).

When configured, Resend is preferred over the existing SMTP transport. With neither configured, local previews remain available. API success remains independent of email-provider failure; the worker records failures and retries with backoff. HTTPS requests use a bounded timeout and a payload-derived idempotency key; provider retention limits mean this is not an unlimited exactly-once guarantee.

Confirmation emails include event, venue, local show date/time, seats, total, booking reference, an authenticated booking-details link and a `ticket.png` QR attachment. Nothing is removed from **My Tickets**. Provider acceptance is not proof of inbox delivery. Failed delivery does not cancel a confirmed booking.

`npm run email:verify` checks SMTP connectivity when using SMTP. For Resend it reports configuration only and intentionally does not send a message; perform the controlled booking test below.

## 5. Verification checklist

1. Confirm original customer/admin/organiser credentials still log in and reach their existing routes.
2. Use Google with a new real email: expect a CUSTOMER account, then logout and login again.
3. Register a Firebase email/password account: expect a verification email and no CineBook session until verified. Check spam and configured template URLs.
4. Log in with an unverified email: expect verification guidance, not access.
5. Try Google with an existing local account's email: expect an explicit link requirement, never a new privileged account.
6. Link from the existing account, then verify old password and Google login both access the same tickets.
7. Confirm forged/expired/wrong-project/revoked tokens are rejected; client role fields cannot elevate privileges.
8. Confirm Google popup and authorised-domain errors produce clear messages.
9. Book with your own real customer email. Verify My Tickets, booking details, the email contents and QR attachment. Do not use `@demo.com` to test delivery.
10. Simulate email failure: booking remains confirmed and a retry/failure reason appears in admin jobs.
11. Confirm Firebase-only deletion requires recent matching-provider proof and cleanup is queued durably.

Automated tests exercise application-side mapping/linking, role preservation, missing configuration, template contents, mocked HTTPS delivery and existing booking/security flows. Real Google consent, Firebase inbox verification and provider delivery require live project configuration and a real test mailbox; they cannot be certified by mock tests.
