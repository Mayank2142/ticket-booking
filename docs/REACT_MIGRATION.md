# CineBook React Migration

## Goal

Move CineBook from a combined Next.js application to a framework-independent React client and an Express API without losing any booking, waitlist, authorization, email, or concurrency guarantees. Payments are intentionally out of scope.

Google Stitch is not part of this migration. The product UI will be designed and implemented directly in the repository using reusable React components and the existing CineBook visual language.

## Non-negotiable guarantees

- Two customers cannot hold or book the same seat.
- Checkout holds expire automatically.
- Waitlist offers are atomic, ordered, token-protected, and time limited.
- Cancellation is idempotent.
- Customer, organiser, and administrator permissions remain server enforced.
- QR tickets and delivery tracking remain intact.
- Every phase ends with type checking, automated tests, and a working deployable application.

## Target architecture

```text
Browser
  |
  +-- apps/web         React + TypeScript + Vite
  |      React Router, query/cache layer, feature-based UI
  |
  +-- apps/api         Node.js + Express + TypeScript
  |      auth, events, venues, bookings, waitlist, reporting
  |
  +-- apps/worker      scheduled cleanup and email retries
  |
  +-- packages/shared API contracts and validation schemas
  +-- packages/ui     CineBook design-system components
         |
         +-- PostgreSQL (system of record)
         +-- Redis (coordination, cache, and event fan-out)
```

The first migration release can run the API and worker together on Railway. They should become separate services only when load or operational needs justify it.

## Phase 0 — Baseline and migration contract (complete)

- [x] Preserve the current working application as the behavioral reference.
- [x] Verify TypeScript and all six booking lifecycle/concurrency tests.
- [x] Pin the supported local Node.js runtime to Node 22.
- [x] Add framework-independent API contracts under `src/contracts`.
- [x] Inventory all pages and endpoints in this document.
- [x] Define phase gates and rollback rules before changing frameworks.
- [x] Exclude Google Stitch and payments from scope.

Phase gate: the current Next.js app must still type-check, pass all lifecycle tests, and serve its event API successfully.

## Existing page parity checklist

| Current route | React route | Required behavior |
| --- | --- | --- |
| `/` | `/` | discovery, filters, featured content, movie/concert sections |
| `/login` | `/login` | login, immediate global auth update, role-aware redirect |
| `/register` | `/register` | customer/organiser registration and validation |
| `/events/:id` | `/events/:id` | details, live seat map, hold timer, checkout, waitlist offer |
| `/bookings` | `/bookings` | history, QR ticket, idempotent cancellation |
| `/organiser/events` | `/organiser/events` | owned events and aggregate metrics |
| `/organiser/events/new` | `/organiser/events/new` | venue selection and per-category prices |
| `/organiser/events/:id` | `/organiser/events/:id` | booking and revenue summary |
| `/admin/venues` | `/admin/venues` | flexible category/row layout CRUD |

## Existing API parity checklist

| Method | Endpoint | Owner |
| --- | --- | --- |
| `POST` | `/api/auth/register` | auth |
| `POST` | `/api/auth/login` | auth |
| `GET` | `/api/auth/me` | auth |
| `GET`, `POST` | `/api/events` | events |
| `GET` | `/api/events/:id` | events |
| `GET`, `POST` | `/api/events/:id/seats` | inventory |
| `POST` | `/api/events/:id/book` | bookings |
| `GET`, `POST` | `/api/events/:id/waitlist` | waitlist |
| `GET` | `/api/events/:id/waitlist/offer` | waitlist |
| `GET` | `/api/bookings` | bookings |
| `DELETE` | `/api/bookings/:id` | bookings |
| `GET`, `POST` | `/api/venues` | venues |
| `GET`, `PUT`, `DELETE` | `/api/venues/:id` | venues |
| `GET` | `/api/organiser/events/:id/summary` | reporting |
| `GET` | `/api/health` | operations |
| `GET` | `/api/ready` | operations |
| `GET`, `POST` | `/api/cron/release-holds` | worker |

## Phase 1 — React shell and discovery migration (complete)

Progress:

- [x] Create the npm workspace and `apps/web` React application.
- [x] Add Vite, TypeScript, React Router, and the shared contracts workspace.
- [x] Connect the React development server to the existing `/api` and `/images` routes.
- [x] Migrate the discovery homepage, event search, and type filters.
- [x] Add a responsive React application shell and production build.

Phase 7 subsequently added city/language filters, richer catalogue metadata, grouped showtimes, favourites, and recommendations.

The React frontend runs beside the legacy app and proxies `/api` and `/images` to port 3000. Customer-facing links now stay inside React; only organiser and administrator destinations use the working legacy app until Phase 4.

Gate: the React production build passes, API health and event listing work, and discovery has no dependency on Next.js UI components.

## Phase 2 — React authentication (complete)

- [x] Migrate login and registration pages to React Router.
- [x] Add a central authentication provider.
- [x] Attach JWT credentials to authenticated API requests.
- [x] Restore sessions through `/api/auth/me` after page reloads.
- [x] Update the navigation immediately after login and logout.
- [x] Add safe post-login redirects and role-ready protected routes.
- [x] Clear invalid or expired sessions on unauthorized responses.

Gate: customer login succeeds in the React UI, the navbar changes without a reload, refresh restores the session, and logout immediately returns the anonymous navigation.

## Phase 3 — Customer experience (complete)

- [x] Migrate event details and per-category pricing.
- [x] Render the venue layout as an accessible visual seat map.
- [x] Refresh available, held, booked, and customer-held states automatically.
- [x] Add selection limits, transactional holds, and a visible hold countdown.
- [x] Add the no-payment checkout review and confirmed QR ticket screen.
- [x] Migrate booking history and idempotent cancellation UI.
- [x] Migrate sold-out category waitlist joining and queue-position display.
- [x] Support token-protected, time-limited waitlist offer redemption.
- [x] Preserve the requested event and seat-map destination through login.

The customer routes use one typed API client and shared contracts. Phase 6 later replaced the initial three-second polling implementation with SSE invalidation and a slower recovery poll without changing the tested inventory state machine.

Gate: a customer can complete the full no-payment booking journey in React, including QR confirmation and cancellation.

## Phase 4 — Organiser and admin experience (complete)

- [x] Migrate the organiser event dashboard and aggregate metrics.
- [x] Migrate movie/concert creation with future scheduling and dynamic per-category pricing.
- [x] Migrate per-event booking, ticket-sales, and revenue reporting.
- [x] Migrate flexible venue creation, editing, deletion, and live row-coverage preview.
- [x] Keep used venue layouts visibly locked to protect show inventory and sold tickets.
- [x] Add role-aware login, registration, navigation, and protected React routes.
- [x] Verify organiser and administrator workflows against the live local API.

All user-facing routes now have React parity. The legacy Next.js pages remain in the repository only as a rollback reference while the backend is extracted; the React application no longer links to them.

Gate: all three roles have route and API parity with the current application.

## Phase 5 — PostgreSQL and production concurrency (implementation complete; environment verification pending)

- [x] Make PostgreSQL the production Prisma provider and add a committed baseline migration.
- [x] Use Prisma's `pg` driver adapter with bounded connection-pool settings.
- [x] Add serializable transactions with bounded `P2034` retries around seat and waitlist state transitions.
- [x] Add a one-time SQLite → PostgreSQL copier that preserves IDs, booking references, timestamps, and relationships.
- [x] Retain SQLite only as a separate generated client for fast, isolated local regression tests.
- [x] Add a guarded PostgreSQL lifecycle runner that refuses databases not ending in `_test`.
- [x] Add GitHub Actions PostgreSQL 16 service coverage for the full lifecycle suite.
- [ ] Observe a successful PostgreSQL lifecycle run in CI or an available local Docker/Railway environment.

The current execution environment has Docker installed but its privileged service cannot be started, so the real PostgreSQL gate cannot be honestly marked complete here. Prisma generation, the PostgreSQL schema diff, TypeScript, production builds, and the complete SQLite regression suite remain locally verifiable.

Gate: the full lifecycle suite passes repeatedly against the production database engine.

## Phase 6 — Real-time inventory and workers (implementation complete; environment verification pending)

- [x] Publish inventory invalidations after committed holds, releases, bookings, cancellations, and waitlist transitions.
- [x] Add optional Redis Pub/Sub fan-out without moving authoritative state out of PostgreSQL.
- [x] Add a public Server-Sent Events stream per event with heartbeat and duplicate suppression.
- [x] Replace three-second polling with debounced live refresh plus a 30-second safety poll.
- [x] Extract one idempotent maintenance cycle shared by the worker and protected cron endpoint.
- [x] Add an always-on worker with structured outcomes, overlap prevention, and graceful shutdown.
- [x] Add Railway worker configuration and local coordination regression tests.
- [ ] Observe cross-instance Redis delivery and worker restart recovery in Railway.

Gate: two deployed browser sessions see holds, releases, bookings, and cancellations without manual refresh, and an observed worker restart loses no durable work.

## Phase 7 — BookMyShow-scale product model (foundation complete; deployment verification pending)

Evolve the domain from one event/one venue time to:

```text
City -> Venue -> Auditorium -> Seat layout
Content (movie/concert) -> Show -> Show prices -> Show seats
Customer -> Booking / Waitlist / Notification preferences
```

- [x] Add reusable `Content` records while retaining `Event` as the scheduled show and booking inventory boundary.
- [x] Add city, address, and auditorium identity to managed venue layouts.
- [x] Add language, format, genre, duration, certificate, and optional poster metadata.
- [x] Group equivalent organiser listings into one content identity with multiple showtimes.
- [x] Add city/language discovery filters and showtime comparison in React.
- [x] Add customer favourites shared across every showtime for that content.
- [x] Add recommendations using favourite/booking genre and language signals with popularity fallback.
- [x] Add backward-compatible PostgreSQL and SQLite migrations plus catalogue validation tests.
- [ ] Run the production migration and validate recommendation quality with real catalogue data.

The existing `Venue` layout record is the auditorium-level inventory boundary; its `name`, `city`, and `auditorium` fields expose the customer-facing hierarchy without rewriting stable seat foreign keys. A future multi-auditorium administration release may split the venue brand into a separate parent table once production data requires shared venue-level metadata.

Payments remain excluded; booking confirmation is the terminal checkout action.

## Phase 8 — Quality, security, and delivery (local implementation complete; deployment verification pending)

- [x] Expand the local suite to 16 lifecycle, concurrency, catalogue, real-time, and security tests.
- [x] Add Playwright production-build journeys for discovery/seat map, immediate login state and favourites, and keyboard skip navigation.
- [x] Run SQLite tests locally and the same database suite against PostgreSQL 16 in GitHub Actions.
- [x] Add scoped rate limits to registration, login, holds, booking, cancellation, waitlists, and favourites with Redis coordination and memory fallback.
- [x] Add structured JSON logs, safe error fields, request IDs, allowlisted CORS, and security response headers.
- [x] Split lightweight `/api/health` liveness from dependency-aware `/api/ready` readiness.
- [x] Add CSP/HSTS policy, visible keyboard focus, a skip link, responsive visual QA, and CI failure traces.
- [x] Upgrade the API runtime and email library away from known critical direct-dependency advisories.
- [ ] Add a hosted error-monitoring provider and enforce measured performance budgets.
- [ ] Recreate the public React/API deployment and observe Railway PostgreSQL, Redis, worker, SMTP, and cron behavior.

Local gate: ESLint, TypeScript, 16 API/domain tests, both production builds, and three Chromium journeys pass. The former Railway domain returns `Application not found`, so this phase is not production-complete until a new public domain passes `/api/ready` and the full booking/email/waitlist smoke test.

## Migration rules

- Do not delete the Next.js implementation until React reaches complete route parity.
- Do not change the database engine and frontend framework in the same phase.
- Do not duplicate booking logic in route handlers; routes call shared services.
- Do not trust client-side role checks, totals, prices, hold ownership, or offer state.
- Merge only when the current phase gate passes and rollback remains possible.
