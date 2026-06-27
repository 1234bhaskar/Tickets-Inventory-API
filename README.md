# Encore Tickets — Inventory API

A ticketing inventory service that manages events, tiers, time-limited holds, and paid/refunded orders. It exposes a small REST API plus a payment-provider webhook, and is built to guarantee **no overselling** under concurrent load.

---

## Stack & Why

| Choice | Why |
|--------|-----|
| **Next.js 16 (App Router, Route Handlers)** | Single framework for API routes with zero extra server boilerplate. Each endpoint is a typed `route.ts`. Easy to deploy on Vercel. |
| **PostgreSQL** | Need real transactions and row-level locking (`SELECT ... FOR UPDATE`) to prevent overselling. Postgres gives strong ACID guarantees. |
| **Prisma 7** (with `@prisma/adapter-pg`) | Type-safe DB access and migrations. The `pg` driver adapter exposes raw SQL for the `FOR UPDATE` lock we need in the hold flow. |
| **Zod** | Runtime validation of request bodies and webhook payloads, with typed parsing via discriminated unions for the two webhook event types. |
| **TypeScript** | End-to-end type safety from request → DB → response. |

**Core design principle:** correctness over cleverness. Inventory is never stored as a mutable counter that can drift. Instead, **available inventory is always *derived*** at read time:

```
availableInventory = totalInventory − activeHolds − paidOrders
```

This makes overselling structurally impossible to "leak" through a stale counter — the truth is always recomputed from holds and orders.

---

## Schema Diagram

```
┌─────────────────┐
│      Event      │
│─────────────────│
│ id (PK)         │
│ title           │
│ venue           │
│ startsAt        │
└────────┬────────┘
         │ 1
         │
         │ N
┌────────▼────────┐
│      Tier       │
│─────────────────│
│ id (PK)         │
│ eventId (FK)    │
│ name            │
│ price           │
│ currency        │
│ totalInventory  │
└───┬─────────┬───┘
    │ 1       │ 1
    │         │
    │ N       │ N
┌───▼─────┐ ┌─▼───────────┐
│  Hold   │ │   Order     │
│─────────│ │─────────────│
│ id (PK) │ │ id (PK)     │  ← external processor order_id
│ tierId  │ │ tierId (FK) │
│ quantity│ │ quantity    │
│expiresAt│ │ status      │  ← paid | refunded
│ status  │ └─────────────┘
└─────────┘
  ↑ active | expired | converted

┌──────────────────┐
│   WebhookEvent   │   (idempotency ledger — not relational)
│──────────────────│
│ id (PK)          │  ← webhook event_id, unique per delivery
│ type             │  ← order.paid | order.refunded
│ payload (JSON)   │
│ processedAt      │
└──────────────────┘
```

**Relationships**
- `Event` 1—N `Tier` (cascade delete)
- `Tier` 1—N `Hold` (cascade delete)
- `Tier` 1—N `Order` (cascade delete)
- `WebhookEvent` is standalone — it records every processed webhook `event_id` to guarantee idempotency.

**Indexes**
- `Hold(@@index([status, expiresAt]))` — keeps the on-read expiry filter fast, since every inventory query filters on these two columns.

**Enums**
- `HoldStatus`: `active` → `converted` (paid) or `expired` (timed out / cancelled)
- `OrderStatus`: `paid` → `refunded`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/events/:eventId` | Event details with each tier's **derived** `availableInventory`. |
| `POST` | `/api/events/:eventId/holds` | Create a 10-minute hold. Body: `{ "tier_id": "...", "quantity": N }`. Uses a row lock to prevent overselling. |
| `POST` | `/api/holds/:holdId/cancel` | Release a hold early (marks it `expired`). |
| `POST` | `/api/webhooks/payments` | Payment webhook. Handles `order.paid` and `order.refunded`. Idempotent. |

---

## Running Locally

### 1. Prerequisites
- Node.js 20+
- A PostgreSQL database (local or hosted — e.g. Neon, Supabase)

### 2. Install
```bash
npm install
```
> `postinstall` runs `prisma generate` automatically to build the typed client.

### 3. Configure environment
Create a `.env` file in the project root:
```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require"
```

### 4. Apply schema & seed data
```bash
npx prisma migrate deploy   # apply migrations
npm run seed                # load sample events & tiers
```

The seed creates two events:
- `evt_001` — *Anoushka Shankar — Live in Lisbon* (3 tiers)
- `evt_002` — *Indie Devs Meetup — Berlin* (tiers `tier_002_a` Standard, `tier_002_b` Student)

### 5. Run the dev server
```bash
npm run dev
```
API is live at `http://localhost:3000`.


---

## Sending Webhooks

For SENDING WEBHOOKS I am using https://hoppscotch.io/ . The webhook endpoint accepts two event types. Both are **idempotent** — replaying the same `event_id` returns `{ "status": "already_processed" }` and changes nothing.

![alt text](image.png)

![alt text](image-1.png)


### Testing the concurrency guarantee(development only)
`test-race.js` fires two simultaneous hold requests for the last available Student ticket and asserts exactly one succeeds:
```bash
node test-race.js
# ✅ PASS: No overselling. Race condition handled correctly.
```

---

## Trade-off Notes

### 1. Derived inventory vs. a counter column
**Chosen: derive on read.** `available = totalInventory − activeHolds − paidOrders`, computed per request.
- ✅ A counter can drift or be double-decremented under races; a derived value cannot. The DB is always the single source of truth.
- ⚠️ Slightly more query work per read, mitigated by the `(status, expiresAt)` index.

### 2. Overselling prevention — `SELECT ... FOR UPDATE`
**Chosen: pessimistic row lock on the tier inside a transaction.**
- The hold flow locks the tier row, recomputes availability, then inserts the hold — all atomically. Two concurrent requests for the last ticket are serialized: one gets `201`, the other a structured `400 INSUFFICIENT_INVENTORY`.
- ⚠️ Pessimistic locking serializes writes per tier. Fine here (contention is per-tier, not global). An optimistic/CAS approach would scale writes better but adds retry complexity.

### 3. Hold expiry & inventory release
**Chosen: on-read filter (primary) — every query ignores holds where `expiresAt <= now()`.**
- ✅ Zero-lag correctness: a hold stops blocking inventory the instant it expires, with no background job required. Critical for ticketing — even a 30-second delay could wrongly block a buyer.
- ⚠️ Expired holds keep `status: 'active'` in the DB until touched. This is cosmetic only — they never count toward inventory. A periodic cleanup job could be added purely for DB hygiene if status-column accuracy is ever needed for reporting.

### 4. Webhook idempotency
**Chosen: a `WebhookEvent` ledger keyed by the provider's `event_id`.**
- Every webhook is recorded inside the same transaction that applies its effect. A duplicate delivery (same `event_id`) short-circuits to `already_processed`.
- ✅ Exactly-once processing even if the provider retries.
- ⚠️ Assumes the provider sends a globally-unique `event_id` per delivery (standard for Stripe-style webhooks).


## deployed on Vercel Link
https://tickets-inventory-msxhdxovq-bhaskarchand625gmailcoms-projects.vercel.app