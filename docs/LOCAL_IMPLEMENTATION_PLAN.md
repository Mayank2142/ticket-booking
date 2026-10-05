# CineBook Local Implementation Plan

This plan covers local product development only.

## Delivery overview

| Order | Workstream | Current status | Priority | Estimate | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | Project structure and local runtime | Complete | — | Complete | — |
| 2 | Discovery and browsing | Complete | — | Complete | Existing catalogue API |
| 3 | Content, venues, auditoriums, and shows | Complete | — | Complete | Phase 2 query model |
| 4 | Seat booking and confirmation | Core complete | P0 | 3–5 days | Phase 3 entities |
| 5 | Customer account and waitlist | Partial | P0 | 4–6 days | Booking and waitlist APIs |
| 6 | Organiser portal | Complete | — | Complete | Phase 3 show lifecycle |
| 7 | Administrator portal | Complete | — | Complete | Organiser and job models |
| 8 | Local data and concurrency | Partial | P1 | 3–5 days | Stable database schema |
| 9 | Realtime updates and background work | Partial | P1 | 4–6 days | Phase 8 database profiles |
| 10 | Email and notifications | Partial | P2 | 3–4 days | Durable background jobs |
| 11 | Local quality and product polish | Partial | P0 throughout | 5–7 days | All customer journeys |

Estimated remaining implementation time: **43–62 focused development days** for one developer. Work can be shortened by delivering the P0 customer experience first and treating P1/P2 operations features as later local milestones.

Priority meanings:

- **P0** — needed for a polished customer booking experience.
- **P1** — needed for complete organiser/administrator operation and production-shaped local architecture.
- **P2** — valuable notification and convenience work after core workflows are reliable.

## Working rules

- Keep the browser application in React + Vite and the backend in the Node HTTP API.
- Keep shared request and response contracts framework-independent.
- Make schema changes through Prisma migrations and update seed data in the same phase.
- Finish one vertical journey at a time: interface, API, data model, permissions, loading/error/empty states, and responsive behavior.
- Use local services only and keep every setup command runnable on a developer machine.
- Do not mark a phase complete until its gate is satisfied from a fresh local setup.

## Status key

- **Complete** — implemented and connected in the local application.
- **Partial** — the foundation works, but important product behavior is still missing.
- **Not started** — no complete customer-facing implementation exists yet.

## Current local architecture — Complete

```text
apps/
  web/       React + TypeScript + Vite customer and operations UI
  api/       Node.js HTTP API and static React build server
  worker/    Hold expiry, waitlist expiry, and email retry worker
packages/
  shared/    Framework-independent API contracts
src/
  contracts/ Shared DTO definitions
  lib/       Booking, auth, database, validation, email, and realtime services
prisma/      Schema, migrations, and seed data
tests/       Domain, concurrency, security, realtime, and browser tests
```

Local startup:

```bash
npm install
npm run db:generate
npm run db:setup:sqlite
npm run db:seed
npm run dev
```

`npm run dev` starts the API on port `3000` and React on port `5173`.

## Phase 1 — Project structure and local runtime — Complete

- [x] React/Vite owns every browser route.
- [x] The Node HTTP service owns every `/api` route.
- [x] The API can serve the compiled React single-page application.
- [x] Shared DTOs are isolated from browser and database code.
- [x] Background maintenance runs separately from the API.
- [x] One command starts the React app and API together.
- [x] Root environment, SQLite, public assets, and compiled web paths resolve correctly from workspace scripts.

Gate passed locally on 3 October 2026: type checking and the production build complete; health is `ok`; readiness reports the database as connected; eight seeded events are returned; and both `/` and a deep React route serve the compiled application.

## Phase 2 — Discovery and browsing — Complete

Complete:

- [x] Desktop city selector.
- [x] Search by title, venue, and genre/category text.
- [x] Separate Movies and Live Events routes.
- [x] Date, language, city, and format filtering.
- [x] Database-backed event cards and local poster assets.
- [x] Content favourites, recommendation scoring, and multiple showtimes.

Completed in this phase:

- [x] City selection remains available in mobile navigation.
- [x] Search, city, date, language, format, genre, venue, sort, and page filters use the URL.
- [x] Dedicated genre and venue filters.
- [x] Price-low/high and recent-booking trending sorts.
- [x] Separate upcoming-releases section.
- [x] Trending ranking from recent confirmed bookings.
- [x] Persisted customer recently-viewed history.
- [x] Personalised recommendations rendered in React.
- [x] Dedicated paginated `/search` route.
- [x] Validated API-side filtering, sorting, and pagination.

Gate passed locally on 3 October 2026: a combined movie, city, genre, price-sort, and page query reproduced two correctly ordered pages; the same URL model is used by desktop and mobile discovery.

## Phase 3 — Content, venues, auditoriums, and shows — Complete

Complete:

- [x] Reusable Content records group scheduled listings.
- [x] Movie and concert types.
- [x] Venue city and auditorium labels.
- [x] Flexible seat categories and independent show inventory/prices.
- [x] Language, format, genre, runtime, certificate, and poster metadata.

Completed in this phase:

- [x] City is a managed database entity linked to venues.
- [x] Auditorium is a separate managed entity linked to its venue.
- [x] Scheduled records are exposed as Prisma `Show` while safely mapping to the existing `Event` table.
- [x] Movie release date, cast, crew, trailer, and multiple-format metadata.
- [x] Live performer, age-rule, and entry-rule metadata.
- [x] Draft, published, cancelled, and archived lifecycle states with protected transitions.
- [x] Additive SQLite and PostgreSQL migrations plus refreshed seed/migration-copy logic.

Gate passed locally on 3 October 2026: content owns reusable metadata, seeded shows reference managed City/Auditorium records, and existing booking identifiers remain intact through the compatibility table mapping.

## Phase 4 — Seat booking and confirmation — Complete

- [x] Visual auditorium layout and category prices.
- [x] Available, selected, held, and booked states.
- [x] Multiple-seat selection and server-calculated totals.
- [x] Configurable holds, expiry, review, confirmation, and QR ticket.
- [x] Atomic ownership and waitlist-token checks.

Enhancements:

- [x] Model wheelchair-accessible and companion seats.
- [x] Model aisles, blocked spaces, and unavailable positions.
- [x] Add seat-view metadata where available.
- [x] Add a final-minute hold warning.
- [x] Add reusable fallbacks for failed poster URLs.

Gate passed locally on 3 October 2026: booking works with arrow-key and native button controls, a 320 px mobile viewport, expired holds, blocked positions, and simultaneous customers.

## Phase 5 — Customer account and waitlist — Complete

Complete:

- [x] Registration, login, session restoration, and logout.
- [x] Booking history with seats, poster, total, status, and QR code.
- [x] Cancellation, favourites, waitlist joining, queue position, and single-use offers.

Completed enhancements:

- [x] Separate upcoming, previous, and cancelled booking tabs.
- [x] Add a booking-details route.
- [x] Add full waitlist history and active-offers pages.
- [x] Add profile editing and stored email/reminder preferences.
- [x] Add password-change and account-deletion flows.

Gate passed locally on 3 October 2026: customers manage identity, tickets, favourites, preferences, security, and waitlists through the protected account area.

## Phase 6 — Organiser portal — Complete

Complete:

- [x] Protected organiser routes and event creation.
- [x] Venue assignment and per-category prices.
- [x] Owned listings, confirmed bookings, ticket totals, revenue, and category performance.

Completed in this phase:

- [x] Edit content and future show details with booked-show schedule and price locks.
- [x] Create several shows for one content item in one workflow.
- [x] Publish, unpublish, cancel, and archive shows through protected transitions.
- [x] Show booked, held, available, unavailable, and waitlisted inventory totals.
- [x] Add attendee and booking lists.
- [x] Export confirmed booking reports as CSV.
- [x] Add date-range and show filters to reports.

Gate passed locally on 4 October 2026: organiser mutations and reports enforce content ownership, lifecycle changes preserve booking inventory, and multi-show creation, filtered reports, attendee lists, and CSV export are available in React.

## Phase 7 — Administrator portal — Complete

Complete:

- [x] Create, edit, and remove unused venue layouts.
- [x] Lock layouts after a show uses them.
- [x] Flexible seat categories and row-coverage preview.

Completed in this phase:

- [x] Manage cities, venues, and auditoriums separately.
- [x] Archive and restore venues without deleting historical inventory.
- [x] Manage users and roles with last-admin and self-demotion protection.
- [x] Inspect shows and bookings across organisers.
- [x] Monitor cleanup, waitlist, and email retry jobs.
- [x] View and retry failed email deliveries.
- [x] Add platform statistics and a persisted administrator audit log.

Gate passed locally on 4 October 2026: administrators can operate users, roles, locations, shows, bookings, maintenance, failed email delivery, statistics, and audit history through protected React screens without direct database access.

## Phase 8 — Local data and concurrency — Partial

Complete:

- [x] Prisma schema, migrations, and SQLite local profile.
- [x] PostgreSQL-shaped schema and adapter.
- [x] Conditional seat transitions and serializable transaction retries.
- [x] Booking/waitlist indexes and connection-pool configuration.

Remaining locally:

- [ ] Provide a simple local PostgreSQL setup option.
- [ ] Repeat the lifecycle suite against local PostgreSQL.
- [ ] Verify the SQLite-to-PostgreSQL copy with realistic data.
- [ ] Add clear local database reset and demo-data refresh commands.

Gate: a new developer can create either database profile and run every concurrency scenario locally.

## Phase 9 — Realtime updates and background work — Complete

Complete:

- [x] Server-Sent Events, automatic reconnect, and safety polling.
- [x] Optional Redis fan-out and rate-limit coordination.
- [x] Worker for hold expiry, offer expiry/cascade, and email retry.
- [x] Database remains authoritative when Redis is unavailable.

Remaining locally:

- [x] Add a simple local Redis setup option and diagnostics.
- [x] Add durable job records with attempts and failure reasons.
- [x] Add exponential retry scheduling.
- [x] Add an administrator job-monitor screen.

Gate: two local browsers update without refresh and worker restarts lose no durable work.

## Phase 10 — Email and notifications — Complete locally

Complete:

- [x] Booking confirmation with QR attachment.
- [x] Waitlist-offer email, delivery timestamps, and retry counts.
- [x] API success remains independent from temporary email failure.

Remaining:

- [x] Email verification.
- [x] Cancellation, waitlist-joined, offer-expired, and reminder emails.
- [x] Reusable branded HTML and plain-text templates.
- [x] Local email preview without a real email account.

Gate: every notification can be previewed and verified locally.

## Phase 11 — Local quality and product polish — Complete

Complete:

- [x] TypeScript validation, React production build, and core automated tests.
- [x] Request IDs, CORS, rate limits, security headers, and role protection.
- [x] Dark/light themes and loading, empty, error, and protected-route states.
- [x] Remove obsolete CSS selectors and duplicate style rules.
- [x] Complete light-mode contrast review for every role and route.
- [x] Finish mobile navigation and city selection.
- [x] Add image loading and failure states.
- [x] Standardise field-level and form-level validation messages.
- [x] Check contrast, focus order, dialogs, and seat-map accessibility.
- [x] Add API pagination/query-validation coverage.
- [x] Add local customer, organiser, and administrator browser journeys.
- [x] Clean temporary screenshots and retain only intentional documentation assets.

Gate passed locally: the production build, 30 API/domain tests, and 12 Chromium customer/organiser/administrator journeys pass with no critical accessibility or responsive-layout defects.

## Recommended implementation order

### Milestone 1 — Customer discovery foundation

1. Finish mobile navigation and mobile city selection.
2. Move search, city, date, language, format, genre, venue, sort, and page state into the URL.
3. Add API-side validation, filtering, sorting, and pagination.
4. Add the paginated search-results route, upcoming section, and image fallbacks.
5. Render trending, recently viewed, and personalised recommendations.

Exit result: customers can reliably find movies or live events on desktop and mobile, and a copied URL recreates the same result set.

### Milestone 2 — Complete customer journey

1. Add booking-detail, upcoming, previous, and cancelled views.
2. Add the account hub, profile editing, preferences, and password change.
3. Add waitlist history and active-offer views.
4. Improve hold warnings, expired-hold recovery, and seat-map keyboard behavior.
5. Add accessible/companion seats, blocked positions, aisles, and reusable poster states.

Exit result: a customer can discover, select, hold, confirm, inspect, and cancel a booking without an incomplete screen.

### Milestone 3 — Stable show and venue model

1. Add City, Venue, and Auditorium as separate managed entities.
2. Add movie and live-event metadata required by their respective detail pages.
3. Add show lifecycle states and safe local migrations.
4. Update seed data and existing APIs to use the new model.
5. Rename Event to Show only after every dependent route and service is mapped.

Exit result: content metadata is stored once and can schedule many shows in different auditoriums.

### Milestone 4 — Organiser operations

1. Add content/show editing and multi-show creation.
2. Add publish, unpublish, cancel, and archive actions.
3. Add inventory summaries, attendee lists, and booking lists.
4. Add report filtering and CSV export.
5. Enforce ownership checks for every organiser mutation and report.

Exit result: an organiser can manage the entire lifecycle of their own listings without direct database edits.

### Milestone 5 — Administrator operations

1. Add city, venue, auditorium, user, and role management.
2. Add archiving and cross-organiser booking/show inspection.
3. Add job and failed-email monitoring with safe retry actions.
4. Add platform statistics and an audit log.

Exit result: administrators can operate and inspect all local platform data through protected screens.

### Milestone 6 — Durable local services

1. Add simple local PostgreSQL and Redis profiles with health diagnostics.
2. Add durable job records, attempts, failure reasons, and exponential retries.
3. Add local email previews and the remaining notification types.
4. Add database reset and demo-data refresh commands.
5. Verify concurrency and restart recovery against the PostgreSQL profile.

Exit result: local services can restart without losing authoritative booking or background-job state.

### Milestone 7 — Final product polish

1. Remove obsolete and duplicated CSS.
2. Complete light/dark contrast, responsive, focus, dialog, and reduced-motion reviews.
3. Standardise validation, loading, empty, and error states.
4. Complete customer, organiser, and administrator browser journeys.
5. Remove temporary screenshots and document the final local setup commands.

Exit result: the application has no critical responsive or accessibility defects and all three roles complete their primary journeys locally.

## Definition of done for every task

- The feature uses the correct role and ownership checks.
- API input is validated and returns consistent error responses.
- Database writes are safe against duplicate submissions and concurrency where relevant.
- React includes loading, empty, success, and error states.
- The interface works in both light and dark themes and at mobile and desktop widths.
- Keyboard focus and labels are usable for interactive controls.
- Seed/demo data demonstrates the feature locally.
- Related documentation and local commands are updated.

## Immediate next implementation batch

Start with this batch before opening later phases:

- [x] Mobile city selector and responsive navigation.
- [x] URL-backed filters for search, city, date, language, format, genre, venue, sort, and page.
- [x] API pagination, sorting, and query validation.
- [x] Dedicated search-results page.
- [ ] Poster loading, missing-image, and broken-image fallbacks.
- [ ] Light/dark visual review of the discovery pages.

Batch completion gate: Movies and Live Events remain separate, filters survive refresh and link sharing, pagination works from the API, and all discovery screens are usable on mobile in both themes.
