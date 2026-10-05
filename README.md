# CineBook

A React + Node.js booking application for movies and live events, with visual seat selection, temporary holds, fair waitlists and QR tickets.

[Screenshots](#product-preview) · [Start locally](#local-setup) · [Project structure](#project-structure) · [Tests](#testing) · [Architecture](#architecture)

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

These ten photos are earlier local UI snapshots, retained as documentation—not fresh captures of every latest redesign. Current frontend source is in `apps/web/src`.

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
| Frontend | React 18, Vite, React Router, TypeScript and shared CSS tokens |
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

## Commands

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
