# System Design

## Overview

CineBook uses a standalone React frontend, a typed API layer, Prisma, PostgreSQL, and optional Redis fan-out. It supports admin, organiser, and customer roles. Reusable `Content` records hold movie/concert metadata and connect multiple scheduled `Event` shows. City/auditorium-labelled venues store physical layouts, while every show receives its own `ShowSeat` inventory. Favourites target content rather than one showtime; lightweight recommendations score genre/language affinity and booking popularity.

## Seat holds and TTL

A customer sends up to ten unique seat IDs to `POST /api/events/:id/seats`. Before processing, the server expires stale waitlist offers and ordinary holds. It then starts a database transaction and conditionally updates every requested `ShowSeat`:

```text
AVAILABLE -> HELD when the row is still AVAILABLE
HELD -> HELD only when held by the same customer and not expired
```

The update stores `heldById`, `heldUntil`, and increments `version`. Each update must affect exactly one row; otherwise the transaction rolls back. The default TTL is ten minutes and is configurable through `SEAT_HOLD_TTL_MINUTES`.

Abandoned holds are released in two ways. Seat-map reads perform lazy expiry before returning state. An always-on worker sweeps expired holds/offers and retries pending emails; a protected cron endpoint invokes the same idempotent service as a fallback.

After each committed inventory transition, the API publishes a small invalidation through local events and optional Redis Pub/Sub. Server-Sent Events notify browsers to re-read authoritative PostgreSQL state. Redis never stores seat ownership, and a 30-second browser poll preserves eventual refresh if Redis or SSE is unavailable.

Booking repeats the concurrency guard. Every seat must be `HELD` by that customer with `heldUntil > now`. The transaction conditionally changes the seats to `BOOKED`, calculates the category-based total, and creates the booking and booking-seat records. Thus simultaneous confirmations cannot both succeed.

## Concurrency prevention

Correctness is based on database state transitions rather than an in-memory mutex, which would fail across processes. Conditional `updateMany` operations act as compare-and-swap operations. Affected-row counts detect a lost race. Cancellation uses the same approach: `CONFIRMED -> CANCELLED` must affect one row, making duplicate or simultaneous cancellation requests idempotent.

Production uses PostgreSQL. High-contention seat, booking, cancellation, offer, and expiry flows run at serializable isolation. Prisma `P2034` conflicts are retried up to three times. Conditional row updates remain the final compare-and-swap guard, so correctness does not depend on one API process. The `pg` pool is bounded through environment variables. SQLite remains only as a fast isolated regression profile.

## Waitlist assignment

Waitlist entries belong to one event and seat category. Queue position is unique within that pair. A customer may join only when the category has no available seats.

After cancellation commits, each freed seat is offered to the earliest `WAITING` entry. One transaction conditionally claims both resources: the entry changes `WAITING -> OFFERED`, and the seat changes `AVAILABLE -> HELD` for that customer. If either conditional update loses a race, the transaction rolls back and retries the queue claim. This prevents two seats from being assigned to the same next customer or one seat from receiving multiple active offers.

The offer stores a cryptographically random token, exact seat ID, and `offerExpiresAt`. Email contains `/events/:id?offer=TOKEN`. A seat connected to an active offer cannot be held or booked without that token, even by the offered customer. An offer may book only its assigned seat.

## Offer expiry and fulfillment

When the customer confirms, token ownership, event, customer, seat, and expiry are validated again inside the booking transaction. Seat booking and `OFFERED -> FULFILLED` occur atomically. The token and assignment fields are cleared after fulfillment.

If time expires, cleanup conditionally changes `OFFERED -> EXPIRED`, releases only the matching customer’s hold, and offers the now-available seat to the next waiting entry. Conditional status checks make repeated cleanup safe.

## QR and email delivery

Bookings receive a unique `BK-...` reference. The `qrcode` library creates a PNG encoding that reference, attached through Nodemailer SMTP. Email delivery is deliberately outside the booking transaction: an SMTP outage cannot undo or disguise a confirmed booking. Bookings and offers store delivery timestamps and attempt counts. Failed or unconfigured delivery is reported as queued and retried by cleanup up to five times.

## Venue and authorization safety

JWT authentication is verified against the current database user on every protected request. APIs enforce admin, organiser, or customer roles. Venue input requires complete non-overlapping row coverage, valid colours, bounded dimensions, and unique category names. Event prices must exactly match the selected venue’s categories. Once a venue is referenced by an event, its layout cannot be edited or deleted, protecting historical and sold seat references.
