# 🎟️ CineBook

### Discover the show. Choose your seat. Keep your place.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black) ![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)

A React + Node.js booking application for movies and live events, with visual seat selection, temporary holds, fair waitlists and QR tickets.

## Live demo

**[Open CineBook on Railway](https://ticket-booking-production-dd12.up.railway.app)**

The deployed demo includes sample movies/events and demo accounts. It is not a real paid-ticket service. Email delivery is not enabled yet; Railway Trial blocks outbound SMTP.

[Screenshots](#product-preview) · [What makes it different](#what-makes-cinebook-different) · [Start locally](#local-setup) · [Project structure](#project-structure) · [Tech stack](#architecture) · [Tests](#testing) · [Routes](#application-routes)

## Features

| Area | Workflows |
|---|---|
| Discovery | Movies and Live Events, search, city/date/language/format/genre/venue filters, sorting, pagination, favourites and recommendations |
| Booking | Showtimes, category pricing, accessible seats, live inventory, expiring holds, review, confirmation and QR tickets |
| Customer | Upcoming/previous/cancelled tickets, booking details, cancellation, saved content, waitlist history/offers, profile, preferences and account security |
| Organiser | Owned content/show management, batch shows, lifecycle controls, inventory, attendees, filtered reports and confirmed-booking CSV export |
| Administrator | Cities, venues, auditoriums, users/roles, platform shows/bookings, statistics, jobs, email previews/retries and audit history |

The frontend shares light/dark tokens and reusable components. Movies and Live Events share the same discovery layout. Checkout confirms reservations: no real payment gateway, ticket transfer or mobile-wallet integration is provided.

## Product preview

The gallery contains ten committed screenshots across both themes and all three roles. Local demo posters and artwork are in `public/images`. Titles, venues and screenings are sample content—not real cinema inventory. Check artwork rights before public use.

### Customer discovery in dark and light mode

| Dark mode | Light mode |
|---|---|
| <img src="output/playwright/readme/01-home-dark.jpg" alt="CineBook home and discovery experience in dark mode" width="100%" /> | <img src="output/playwright/readme/02-home-light.jpg" alt="CineBook home and discovery experience in light mode" width="100%" /> |
| **Movie discovery** — poster-led cards and live availability | **Live-event catalogue** — searchable, filterable event browsing |
| <img src="output/playwright/readme/03-movies-dark.jpg" alt="CineBook movie discovery cards in dark mode" width="100%" /> | <img src="output/playwright/readme/04-live-events-light.jpg" alt="CineBook live-events catalogue in light mode" width="100%" /> |

### Event booking journey

| Event details | Accessible seat selection |
|---|---|
| <img src="output/playwright/readme/05-event-detail-dark.jpg" alt="Dune event details with realtime inventory in dark mode" width="100%" /> | <img src="output/playwright/readme/06-seat-map-light.jpg" alt="Keyboard-accessible auditorium seat map in light mode" width="100%" /> |
| Rich metadata, ticket categories, realtime availability and booking CTA | Category pricing, hold status, fare summary, accessible and unavailable seats |

### Customer account

| My Tickets | Profile and preferences |
|---|---|
| <img src="output/playwright/readme/07-my-tickets-light.jpg" alt="Customer My Tickets page with QR pass in light mode" width="100%" /> | <img src="output/playwright/readme/08-account-dark.jpg" alt="Customer profile, preferences and security controls in dark mode" width="100%" /> |
| Upcoming, previous and cancelled bookings with QR access | Identity, email verification, reminders, password and account controls |

### Organiser and administrator workspaces

| Organiser studio | Administrator operations |
|---|---|
| <img src="output/playwright/readme/09-organiser-dark.jpg" alt="Organiser performance and listing dashboard in dark mode" width="100%" /> | <img src="output/playwright/readme/10-admin-light.jpg" alt="Administrator operations dashboard in light mode" width="100%" /> |
| Owned listings, lifecycle controls, confirmed bookings and revenue | Platform statistics, users, venues, shows, jobs, email and audit operations |

These ten photos were freshly captured from the current local application at a 1440 × 1000 desktop viewport on 6 October 2026 (Asia/Kolkata), using demo accounts and data. Current frontend source is in `apps/web/src`.

## What makes CineBook different

The novelty is the combination of a coherent customer experience with failure-aware ticket allocation—not a claim that seat locking or queues are new inventions.

| Design choice | Why it matters |
|---|---|
| **Per-show inventory snapshots** | One venue layout supports many screenings without sharing their seat availability or prices. |
| **Atomic holds and confirmation** | Database conditions validate ownership, hold expiry and seat state; two competing customers cannot both win the same seat. |
| **Fair, single-use waitlist offers** | Cancellation can reserve a seat for the next eligible category queue member rather than exposing it to a free-for-all. |
| **Expiry with recovery** | A worker releases abandoned holds and expired offers; reads also enforce expiry. Durable jobs recover interrupted work. |
| **Live updates without Redis dependency** | SSE refreshes inventory; optional Redis fans invalidations across instances while the database remains authoritative. Safety polling provides recovery. |
| **Inspectable notifications** | HTML/text templates, local previews, delivery attempts and retries let developers verify emails without a real email account. |
| **Operational visibility** | Organisers manage only their owned listings; admins inspect jobs, retries, inventory and audit history without opening the database. |
| **Shared visual language** | Theme tokens, reusable controls and customer-page patterns keep discovery, seats, tickets and settings consistent. |

### From discovery to admission

```mermaid
flowchart LR
    A[Discover a show] --> B[Choose seats]
    B --> C[Atomic temporary hold]
    C --> D[Review before expiry]
    D --> E[Confirm booking]
    E --> F[QR ticket and notification]
    C -->|Expires| G[Release inventory]
    E -->|Customer cancels| H[Eligible waitlist offer]
    H -->|Single-use token| D
```

## Local setup

Requirements: **Node.js 22.x**, npm and Git. The easiest local demo uses SQLite; PostgreSQL, Docker, Redis and a real email account are optional.

### 1. Download and install

```bash
git clone https://github.com/Mayank2142/ticket-booking.git
cd ticket-booking
npm ci
```

Copy the environment template. Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

### 2. Configure the local demo

Edit these entries in `.env`, retaining the remaining defaults:

```dotenv
DATABASE_URL="file:./dev.db"
JWT_SECRET="replace-with-a-long-unique-local-secret"
CRON_SECRET="replace-with-another-unique-local-secret"
APP_URL="http://localhost:5173"
WEB_URL="http://localhost:5173"
ALLOWED_ORIGINS="http://localhost:5173"
REDIS_URL=
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
READINESS_REQUIRE_SMTP=false
```

Replace the secret placeholders. Never commit `.env`, credentials or database files. Blank SMTP credentials enable **local email previews**, not external delivery.

### 3. Create the demo database and start

Run from the repository root:

```bash
npm run db:generate
npm run db:deploy:sqlite
npm run db:seed
npm run demo:movies
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)**. Keep this terminal running: it starts React/Vite on **5173** and the API on **3000**.

Use `db:seed` for the initial **demo database**, not a live database with customer bookings. `demo:movies` adds future screenings for seeded Interstellar, Kalki 2898 AD, Dune: Part Two and Oppenheimer when older screenings have passed. It leaves historical bookings and existing seat locks unchanged.

### 4. Start background work

Open a second terminal in the same project directory:

```bash
npm run worker:start
```

Keep it running for proactive hold/offer expiry, notifications and retries. Both processes read the root `.env`. Stop each with `Ctrl+C` in its terminal.

API checks: [health](http://localhost:3000/api/health) and [readiness](http://localhost:3000/api/ready).

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Customer | `customer@demo.com` | `password123` |
| Organiser | `organiser@demo.com` | `password123` |
| Administrator | `admin@demo.com` | `password123` |

Browse publicly, then log in as a customer to select seats, review and confirm. Open My Tickets for the QR ticket or cancellation. Use organiser/admin accounts to explore their portals. These are **local demo credentials only**: never expose them on a production deployment.

### Optional: PostgreSQL

Install PostgreSQL 16+, create an empty `cinebook` database and update `.env` with your credentials:

```dotenv
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/cinebook?schema=public"
```

Use the PostgreSQL migration command instead of SQLite:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm run demo:movies
npm run dev
```

Start the worker separately. Use PostgreSQL for production or multi-worker booking traffic; SQLite is a local/test convenience.

### Optional: Redis and real email

- With Docker running, `npm run redis:up` starts Redis. Set `REDIS_URL=redis://127.0.0.1:6379`, restart API/worker and run `npm run redis:diagnostics`. Stop with `npm run redis:down`.
- Without SMTP, branded HTML/text emails are saved in the database. Sign in as the administrator and inspect Operations for previews and jobs.
- For external delivery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and a verified `SMTP_FROM`. Run `npm run email:verify`, then restart services. No email account or SMTP credentials are bundled.

### Run the compiled application

After database setup:

```bash
npm run build
npm start
```

Stop the development API first to free port 3000. Open [http://localhost:3000](http://localhost:3000): the API serves the compiled React SPA. Keep the worker running separately. Startup does not automatically migrate or seed the database.

### Troubleshooting

| Problem | Check |
|---|---|
| “Failed to fetch” / catalogue cannot load | Keep `npm run dev` running and check API health on 3000. Vite proxies `/api` to that port; remove stale custom `VITE_API_URL` overrides. |
| Movies list is empty | Clear filters, check API readiness, then run `npm run demo:movies` after the initial seed. |
| Missing Prisma client or tables | Run `db:generate`, then migrations for the chosen database profile. |
| Port 3000 or 5173 is occupied | Stop your previous project instance in its own terminal before starting another. |
| Emails are not delivered | Blank SMTP means local previews only. Inspect the admin inbox or configure/verify SMTP. |
| Expiry/jobs do not run proactively | Start `npm run worker:start` in the second terminal with the same `.env`. |

## Project structure

```text
ticket-booking/
├── apps/
│   ├── api/src/
│   │   ├── server.ts             # HTTP entry; API and compiled SPA serving
│   │   ├── router.ts             # API route dispatch
│   │   ├── cluster.ts            # Optional multi-process API
│   │   └── routes/               # Auth, events, bookings, account and role APIs
│   ├── web/
│   │   ├── index.html            # Browser entry and favicon
│   │   ├── vite.config.ts        # Build and development API proxy
│   │   └── src/
│   │       ├── App.tsx           # React routes
│   │       ├── main.tsx          # Bootstrap and shared stylesheet imports
│   │       ├── auth/             # Session context and protected routes
│   │       ├── components/       # Header, footer, logo, seats and posters
│   │       │   └── ui/           # Shared buttons, cards, badges and inputs
│   │       ├── design-system/    # Light/dark tokens and foundation styles
│   │       ├── pages/            # Customer, organiser and admin screens
│   │       └── lib/              # Browser API client and presentation helpers
│   └── worker/src/index.ts       # Expiry, durable jobs and delivery retries
├── packages/shared/src/         # Shared TypeScript contracts
├── src/lib/                     # Database, auth, seats, jobs, email and services
├── prisma/
│   ├── schema.prisma            # PostgreSQL model
│   ├── schema.test.prisma       # SQLite local/test model
│   ├── migrations-postgresql/   # PostgreSQL migrations
│   ├── migrations/              # SQLite migrations
│   └── seed.ts                  # Demo users, content, venues and inventory
├── scripts/
│   ├── dev-local.mjs            # Start API + React together
│   ├── refresh-demo-movies.ts   # Add upcoming seeded movie screenings
│   ├── run-tests.mjs            # Disposable SQLite test runner
│   ├── run-postgres-tests.mjs   # Guarded PostgreSQL tests
│   ├── load-test.mjs            # Public-read capacity harness
│   ├── check-redis.ts           # Redis diagnostics
│   ├── verify-email.ts          # SMTP connectivity check
│   └── migrate-sqlite-to-postgres.ts # One-time data migration
├── public/images/               # Local posters, heroes and branding
├── output/playwright/readme/    # Ten documentation screenshots
├── tests/
│   ├── booking-lifecycle.test.ts
│   ├── catalog.test.ts
│   ├── realtime.test.ts
│   ├── security.test.ts
│   ├── jobs-notifications.test.ts
│   ├── scaling.test.ts
│   └── e2e/                    # Customer, management and quality journeys
├── prisma.config.ts             # PostgreSQL CLI configuration
├── prisma.test.config.ts        # SQLite CLI configuration
├── playwright.config.ts         # Browser-test orchestration
├── compose.redis.yml            # Optional local Redis container
├── .env.example                 # Copy to ignored .env
├── package.json                 # Workspace scripts and dependencies
├── SYSTEM_DESIGN.md
└── docs/LOCAL_IMPLEMENTATION_PLAN.md
```

### Key files

| File | Responsibility |
|---|---|
| [App.tsx](apps/web/src/App.tsx) | Browser routes |
| [tokens.css](apps/web/src/design-system/tokens.css), [foundation.css](apps/web/src/design-system/foundation.css) | Shared themes, colours, spacing and base styles |
| [SiteHeader.tsx](apps/web/src/components/SiteHeader.tsx), [SiteFooter.tsx](apps/web/src/components/SiteFooter.tsx) | Shared navigation and footer |
| [HomePage.tsx](apps/web/src/pages/HomePage.tsx) | Home discovery and recommendations |
| [CataloguePage.tsx](apps/web/src/pages/CataloguePage.tsx), [MoviesDiscoveryView.tsx](apps/web/src/pages/MoviesDiscoveryView.tsx) | Catalogue behaviour and Movies/Live Events presentation |
| [EventPage.tsx](apps/web/src/pages/EventPage.tsx) | Details, showtimes and seat/checkout orchestration |
| [seats.ts](src/lib/seats.ts) | Transactional holds, booking and waitlist allocation |
| [email.ts](src/lib/email.ts), [email-templates.ts](src/lib/email-templates.ts) | Transport, previews and notification templates |
| [schema.prisma](prisma/schema.prisma) | Data model; keep SQLite schema/migrations in sync when changing it |
| [.env.example](.env.example) | Runtime configuration template |

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 7, React Router 7, TypeScript 5 and shared CSS tokens |
| API | Node.js HTTP service with JSON APIs and Server-Sent Events |
| Database | Prisma 7 + PostgreSQL; optional SQLite local/test profile |
| Coordination | Optional Redis Pub/Sub and rate-limit counters |
| Identity | JWT sessions, bcrypt hashing and server-side role checks |
| Jobs | Independent worker and durable database job records |
| Notifications | Nodemailer, HTML/text templates, previews and QR attachments |
| Tests | Node test runner and Playwright |

React owns browser routes; the API owns `/api` and can serve the compiled SPA. Inventory uses **SSE, not WebSockets**. Redis carries invalidations, not authoritative booking state.

```mermaid
flowchart LR
    WEB[React frontend] --> API[Node HTTP API]
    API -- SSE --> WEB
    API --> DB[(Prisma database)]
    API -. optional fan-out .-> REDIS[(Redis)]
    WORKER[Maintenance worker] --> DB
    WORKER --> MAIL[SMTP or local preview]
```

Content groups reusable metadata; Show records own scheduled inventory/prices. Public endpoints retain `/api/events` naming. Conditional updates within transactions check seat ownership, expiry and offer tokens. PostgreSQL serializable transactions and bounded conflict retries protect competing requests.

Cancellation reallocates eligible inventory to category waitlists. Offers expire and cascade; customers cannot bypass another customer's token. Jobs persist attempts, next-run times and failure reasons to recover after restart. Email failures do not undo confirmed bookings.

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) and [the implementation plan](docs/LOCAL_IMPLEMENTATION_PLAN.md) for deeper context.

## Application routes

| Route | Who uses it | Purpose |
|---|---|---|
| `/` | Everyone | Home, recommendations and discovery |
| `/movies`, `/live-events`, `/search` | Everyone | Filtered, paginated catalogue |
| `/events/:eventId` | Everyone; customer for booking | Details, showtimes, seat map and review/confirmation |
| `/login`, `/register`, `/verify-email` | Everyone | Identity and email verification |
| `/bookings`, `/bookings/:bookingId` | Customer | Ticket history, QR details and cancellation |
| `/saved`, `/waitlist`, `/account` | Customer | Favourites, offers/history and settings |
| `/organiser/events` | Organiser/Admin | Owned show dashboard |
| `/organiser/events/new`, `/organiser/events/:eventId/edit` | Organiser/Admin | Creation and safe editing |
| `/organiser/reports`, `/organiser/events/:eventId` | Organiser/Admin | Filtered reports and show performance |
| `/admin`, `/admin/venues` | Administrator | Platform operations and layout management |

### API overview

The frontend uses the existing `/api` service. Representative endpoints include:

| Endpoint | Responsibility |
|---|---|
| `/api/auth/register`, `/api/auth/login`, `/api/auth/me` | Identity and session restoration |
| `/api/events`, `/api/events/:id` | Catalogue and show details |
| `/api/events/:id/seats` | Inventory reads and temporary holds |
| `/api/events/:id/stream` | Server-Sent Events inventory invalidations |
| `/api/events/:id/book` | Confirm seats held by the authenticated customer |
| `/api/bookings`, `/api/bookings/:id` | Customer bookings and cancellation |
| `/api/events/:id/waitlist` | Category queue access |
| `/api/favourites`, `/api/recommendations` | Saved content and recommendation signals |
| `/api/health`, `/api/ready` | Liveness and dependency readiness |

Consult [API route implementations](apps/api/src/routes) for exact methods, query parameters, payloads and permissions. Browser protection does not replace server-side ownership and role checks.

### Data model at a glance

- City, Venue and Auditorium model managed locations; category/seat layouts become protected after shows use them.
- Content groups metadata across many scheduled Show records and independent category prices.
- ShowSeat stores per-show availability, hold ownership, expiry and unavailable reasons.
- Booking and BookingSeat retain references, selected seats, status and totals.
- Favourite and WaitlistEntry store customer taste and queue/offer state.
- BackgroundJob, EmailPreview and administrator audit records expose durable work and operational history.

PostgreSQL and SQLite schemas/migration histories are committed separately. Do not replace either with a raw local database file.

## Commands

### Configuration reference

Copy `.env.example` rather than creating a partial configuration from scratch. Important groups:

| Variables | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection or local SQLite file |
| `JWT_SECRET`, `CRON_SECRET` | Unique signing/maintenance secrets |
| `APP_URL`, `WEB_URL`, `ALLOWED_ORIGINS` | Browser links and permitted CORS origins |
| `SEAT_HOLD_TTL_MINUTES`, `WAITLIST_OFFER_TTL_MINUTES` | Checkout and offer expiry durations |
| `WORKER_INTERVAL_MS`, `WORKER_BATCH_SIZE` | Maintenance interval and job batch size |
| `JOB_RETRY_BASE_MS`, `JOB_RETRY_MAX_MS`, `JOB_STALE_AFTER_MS` | Backoff scheduling and interrupted-job recovery |
| `REDIS_URL` | Optional cross-instance invalidation/rate-limit coordination |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional real email delivery |
| `READINESS_REQUIRE_SMTP` | Require SMTP configuration for readiness when enabled |
| `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS` | PostgreSQL pool limits/timeouts |
| `API_WORKERS`, `API_MAX_IN_FLIGHT`, `PUBLIC_CACHE_TTL_MS` | Multi-process runtime, overload bounds and public-read caching |
| `TEST_DATABASE_URL` | Separate PostgreSQL test database, never a live database |

For a browser origin change (for example production API-hosted SPA), update `APP_URL`, `WEB_URL` and allowed origins together. Pool limits are per API worker, so account for the total across all instances.

### Script reference

| Command | Purpose |
|---|---|
| `npm run dev` | Start API + Vite together |
| `npm run dev:api` / `npm run dev:web` | Start either service separately |
| `npm run worker:start` | Background maintenance and delivery |
| `npm run db:generate` | Generate PostgreSQL and SQLite Prisma clients |
| `npm run db:deploy` / `npm run db:deploy:sqlite` | Migrate the chosen database profile |
| `npm run db:seed` | Initialise local demo data |
| `npm run demo:movies` | Add future movie screenings without rewriting history |
| `npm run build` | Generate clients, build React and check TypeScript |
| `npm start` | Serve API + compiled SPA |
| `npm run typecheck` | Backend/shared and frontend TypeScript checks |
| `npm run lint` | ESLint checks |
| `npm test` | Isolated API/domain regression suite |
| `npm run test:e2e` | Chromium role/quality journeys |
| `npm run test:postgres` | Suite against a separate PostgreSQL test database |
| `npm run test:load` | Public-read capacity harness |
| `npm run start:scale` | Optional multi-process API |
| `npm run redis:up`, `npm run redis:down`, `npm run redis:diagnostics` | Optional Redis setup/diagnostics |
| `npm run email:verify` | Check configured SMTP |

## Testing

```bash
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The build includes frontend and backend/shared TypeScript validation. Core tests create a disposable SQLite database. Playwright starts the API and React preview and uses role fixtures; do not point tests at live customer databases.

Coverage includes competing holds/bookings, expiry, cancellation/offer races, token ownership, pagination/query validation, SSE framing, security, job recovery/retries and notification previews. Browser checks cover customer/organiser/admin journeys, mobile city selection, themes, keyboard/focus behaviour, image fallbacks and responsive layouts.

For PostgreSQL testing, configure a separate `TEST_DATABASE_URL`; the runner refuses database names that do not end in `_test`.

### Capacity testing

Build first, start `npm run start:scale` against a local PostgreSQL database, then run `npm run test:load` in another terminal. The harness models 10,000 arrivals through a bounded socket pool against public catalogue/health reads. Configure `LOAD_TEST_URL`, `LOAD_TEST_USERS`, `LOAD_TEST_SOCKETS`, `LOAD_TEST_MAX_P95_MS` and `LOAD_TEST_MAX_ERROR_RATE` for your machine.

This is **not a guarantee of 10,000 simultaneous authenticated booking users or zero lag**. Capacity depends on hardware, database and traffic mix; booking correctness is tested separately. Do not load test external systems without permission.

## Deployment notes

No hosted demo URL is promised here. Production needs PostgreSQL, strong secrets, HTTPS, correct `APP_URL`/`WEB_URL`/CORS origins, migrations and a separately running worker. Add Redis for cross-instance coordination and verified SMTP for external delivery. Remove public demo credentials and review artwork rights before launch.

Readiness is `/api/ready`; liveness is `/api/health`. Configured Redis and optional `READINESS_REQUIRE_SMTP` affect readiness. `.env.example` documents pooling, hold/offer durations, retry scheduling and scaling. Never publish `.env`, database files, tokens or SMTP secrets.

### Security and production boundaries

- Server-side role and ownership checks protect customer, organiser and administrator operations.
- Passwords are hashed; request IDs, security headers, allowlisted CORS and scoped rate limits support safer operations.
- QR codes encode booking references, not payment details. Treat real tickets and email previews as customer data; the gallery uses local demo tickets only.
- Real SMTP delivery, hosted deployment and production-scale capacity must be verified in the target environment. Local passing tests do not establish production capacity.
- The repository contains source, migrations, seed scripts, assets and tests. Dependencies, generated Prisma clients, compiled bundles, browser-session files, databases and secrets are intentionally excluded and recreated locally.

### Working on the project

1. Install and configure a local database with the setup above.
2. Keep API/React and worker processes in separate terminals.
3. Make frontend changes in `apps/web/src`; keep API/domain changes in `apps/api/src` and `src/lib`.
4. When changing shared data models, update both database profiles/migrations and the shared contracts as appropriate.
5. Run build/type checks and regression tests before publishing changes. Review the staged files for secrets and temporary artifacts.

No project-wide license is declared here; verify repository licensing and third-party asset rights before redistribution.
