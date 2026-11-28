# Dostelo Admin Portal

Fresh rebuild, 2026-11-28, ordered by the owner. The previous
sources were deleted on the owner's instruction and this app was
recreated new with the same structure: the same 25 modules in the
same sidebar order, the same routes (including the detail routes
for buyer intelligence, cart recovery, CRM, leads, orders,
payments and shipping), plus /login and /accept-invite.

## Colour system

The admin adopts the public storefront colour system, per the
owner's clarification of 2026-11-28 17:54. Off-white #F4F2ED is
the workspace, Warm Black #1C1B17 is the ink and the sidebar, and
every other neutral is a tint or shade of those two. The only hue
exception is the Dostelo logo red, used for the brand mark and
destructive or error states. The earlier dark navy sidebar,
purple gradient and lavender workspace are gone. Light theme
only. Tokens live in src/app/globals.css and tailwind.config.ts
maps utilities onto them.

## Honesty rules

- Metrics come from the real API only. Nothing is hardcoded as a
  live number, and no reference name or ID is used as data.
- Anonymous visitors are never shown as verified buyers.
- Do Not Contact records are excluded from marketing, and the
  API refusal (403) is shown, not hidden.
- Messages are marked sent or delivered only on real provider
  confirmation. Providers are not configured yet, so sends record
  not-configured.
- Orders are never marked paid without a verified payment, and
  client-side totals are never trusted; server totals are shown.
- Credentials appear only as variable names with set or missing
  state. Secret values are never requested or rendered.
- Where an additive endpoint is not yet on the running API
  (warehouses, loyalty catalogue, marketing tracking, workflow
  storage, restore, saved reports, settlements, and similar), the
  page shows an honest unavailable state naming the missing
  contract instead of fake data.

## Expanded scope wired in this rebuild

- Inventory & Warehouse: warehouses, per-warehouse stock,
  transfers, complete movement history.
- Loyalty & Rewards: rewards catalogue, redemptions, tiers,
  referral codes, expiration visibility. The four seeded points
  rules stay inactive until activated in the UI.
- Marketing: delivery, read and click tracking, attribution,
  scheduled dispatch with honest dispatch state.
- Automation: a workflow builder (custom triggers, branching
  steps, stored scoring thresholds), execution log with retry.
  Recovery completion and COD payment sync are shown as
  non-pausable correctness rules.
- Customer Support: attachments, public intake in the same queue
  with source shown, business-hours SLA indicators, reopening
  state and history.
- Backup & Maintenance: restore with checksum verification shown
  before proceeding, a three-step confirmation with a typed
  phrase, super admin only, a safety backup taken first, and job
  status reporting. There is no one-click restore.
- Reports & Analytics: saved custom reports (create, save,
  schedule, run and download) and profit from real cost and order
  data with coverage notes where cost is missing.
- Products: real image upload (drag or pick, preview, ordering)
  with the image URL kept as a secondary option, and a cost price
  field feeding profit reporting.
- Payments & Finance: settlements, gateway reconciliation and
  fee tracking from real records.
- Shipping & Courier: automatic booking actions (honest
  not-configured until a courier account exists), exception task
  queue, courier COD settlements.
- Returns & Refunds: evidence viewing and attach, and an exchange
  flow that shows the linked replacement order once approved.
- Reviews & Reputation: moderation of storefront-submitted
  reviews and review request link management.
- System Integrations: complete provider configuration UI
  showing variable names and set or missing state only.

## Running

```bash
pnpm --filter @dostelo/admin dev    # http://localhost:3200 in this rebuild's scripts
pnpm --filter @dostelo/admin build
pnpm --filter @dostelo/admin typecheck
```

The API base URL is NEXT_PUBLIC_API_URL, defaulting to
http://localhost:4000. Session handling: the access token lives
only in memory; the refresh token lives in sessionStorage and
rotates on every use (see src/lib/session.ts).

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS (preflight
disabled, utilities mapped to the Dostelo tokens), Lucide icons.
The portal talks to the API through the typed REST client in
src/lib/api.ts, whose paths and payloads follow API.md and
docs/BACKEND_AND_DATABASE.md.
