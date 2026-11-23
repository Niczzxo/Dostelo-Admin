# Admin Portal

Next.js App Router + React + TypeScript. Staff-only application,
wired to the NestJS API through `@dostelo/api-client`. It shares
the Dostelo brand design tokens with the storefront but uses a
compact operations layout and hand-written CSS (no UI framework).

Status: Phase 6, chunk 2. The portal is functional against the
real API: staff sign in with JWT access tokens and rotating
refresh tokens, the sidebar and pages respect the RBAC roles
matrix from `@dostelo/types`, and the working modules read and
write live API data. No seed or demo data exists in this app;
when the API has no data, the pages say so. Phase 5 added the
Buyer Intelligence and Lead Management modules and the CRM
timeline on the customer profile. Phase 6 added Cart Recovery,
the Communication Center and Shipping & Courier.

This app supersedes the separate Vite admin panel at
`~/workspace/dostelo-admin` (repo Niczzxo/Dostelo-Admin), which
was the Phase 1 stand-in. That panel stays untouched for
reference but is no longer the admin portal under development.

## Running it

The portal needs the API running first:

```bash
# Terminal 1: the API, with a seeded admin account
pnpm --filter @dostelo/api build
ADMIN_SEED_EMAIL=owner@dostelo.example \
ADMIN_SEED_PASSWORD='choose-a-strong-password' \
API_PORT=4000 pnpm --filter @dostelo/api start

# Terminal 2: the portal
pnpm --filter @dostelo/admin dev     # http://localhost:3001
# or, from a production build:
pnpm --filter @dostelo/admin build
pnpm --filter @dostelo/admin start   # http://localhost:3001
```

Environment variables:

- `NEXT_PUBLIC_API_URL`: API origin the browser should call.
  Defaults to `http://localhost:4000`, matching the API's default
  `API_PORT`. Next.js inlines it at build time, so set it before
  `pnpm build` for a deployed build. The API's CORS allowlist
  must include the portal origin (local dev origins are allowed
  by default; see `corsAllowlist` in the API).

## Session handling

Sign in is the API's admin login. When the account has MFA
enabled, the API answers with an `mfaRequired` challenge and the
login page shows the TOTP step, completed through the MFA
exchange endpoint.

Token storage choice and trade-off:

- The access token is kept only in memory (a module-level store
  in `src/lib/session.ts`). It is never written to storage or a
  cookie, so nothing persistent can be stolen from disk, at the
  cost of a refresh round-trip on every full page load.
- The refresh token is kept in `sessionStorage`: it survives
  reloads in the same tab, disappears when the tab closes, and
  is never placed in `localStorage`. On load, the portal
  exchanges it once for a fresh pair. The API stores only a
  SHA-256 hash of each refresh token, rotates it on every use,
  and revokes the whole session family when a rotated token is
  reused.
- Any API answer of 401 expires the session locally and
  redirects to the login page. Sign out revokes the refresh
  token server-side (best effort) and clears everything locally.

The sidebar shows the signed-in admin's name and roles in the
top bar, and hides every module whose view permission the role
does not hold (ROLE_PERMISSIONS in `@dostelo/types`). Hiding is
presentation only: the API enforces the same permissions
server-side on every route the portal calls.

## Functional modules

- Dashboard: live payment summary (counts and totals by status),
  order counts, recent orders, product and category counts, and
  a low-stock list (available 5 or less) from inventory reads.
  Each widget degrades on its own when a read fails or the role
  lacks the permission.
- Products: catalogue list with category filter and search
  (name or SKU). The detail drawer shows variants and live
  stock, and inventory adjustments through the guarded endpoint
  for roles holding `inventory.adjust`.
- Orders: list with a status filter; detail with lines, delivery
  address, totals, payment attempts, the recorded status event
  history, and transition controls limited to the legal next
  states the API returns. Controls render only with
  `orders.edit`.
- Payments & Finance: reconciliation summary header, gateway and
  status filters, payment detail with its event trail and
  refunds. Manual payment verification (`payments.verify`) and
  refund request plus manual confirm (`payments.refund`) are
  wired, each behind a confirm dialog.
- CRM: staff customer list with search across name, email and
  phone; profiles with addresses, order counts, lifetime value
  and the customer's orders. The profile also carries the CRM
  timeline (Phase 5): the visitor activity linked to the
  customer through an authenticated or consented flow (session
  count, identity statuses, event counts, best lead score),
  staff notes (append-only, behind `customers.edit`) and tags
  (add and remove, behind `customers.edit`).
- Buyer Intelligence (Phase 5): tracked storefront sessions
  with the recorded identity status (Anonymous, Known Customer,
  Guest Checkout, Unverified Contact), the transparent lead
  score and band, event counts, latest cart value and last
  activity, filterable by identity status and minimum score.
  The session detail shows the full event timeline and the
  score breakdown, signal by signal. Sessions whose visitor
  denied marketing consent are flagged operational only.
  Behind `buyers.read`.
- Lead Management (Phase 5): the lead pipeline grouped by the
  nine statuses with counts. The lead detail shows contact
  details and the recorded contact basis, the score and the
  source; assignment to a sales agent (behind `leads.assign`;
  there is no staff directory endpoint yet, so the assignee is
  entered by admin id), status moves limited to the legal
  transitions the API enforces, follow-up tasks (create, list,
  complete; behind `leads.edit`), contact attempts with
  channel, purpose and result (behind `leads.contact`), and
  opt-out recording. An opted-out lead is shown as do not
  contact, its contact actions are disabled, and the API
  refuses further attempts.
- Security & Access: the live roles and permissions matrix (the
  same ROLE_PERMISSIONS data the API guards enforce), the audit
  log viewer with action, actor type and limit filters (behind
  `audit.read`), and MFA enrol, enable and disable for the
  signed-in admin.
- Cart Recovery (Phase 6): abandoned carts with a status
  filter, a detection scan action, and the stored sequence
  settings editor (inactivity threshold, token lifetime, and
  each step's channel, delay and template). The detail shows
  the sequence attempts with their honest outcomes and the
  communications the steps produced, plus run-next-step and
  cancel actions. Reads behind `recovery.read`, actions behind
  `recovery.edit`.
- Communication Center (Phase 6): the append-only communication
  log with channel and status filters. Entries read sent only
  on provider confirmation; refusals and not-configured
  providers are entries in their own right. The manual call log
  form records a call a staff member placed (number, outcome,
  notes); an opted-out outcome writes a suppression record.
  Behind `communications.read`; logging a call needs
  `recovery.edit`.
- Shipping & Courier (Phase 6): shipments with courier and
  status filters, booking from an order number (recipient and
  COD amount come from the order), and a detail with the full
  status history and a refresh-from-courier action. A courier
  without merchant credentials records the shipment as not
  configured with the missing variables named and no tracking
  id. Reads behind `shipping.read`, booking and refresh behind
  `shipping.edit`.

## Structure-only modules

The remaining sidebar modules from the admin master structure
(Inventory & Warehouse,
Returns & Refunds, Marketing, Automation, Customer Support,
Reviews & Reputation, Loyalty & Rewards, Reports & Analytics,
Website Management, Notifications, Staff Management, System
Integrations, Legal & Compliance, Backup & Maintenance) render
honest structure pages: the module's purpose and the roadmap
phase that builds it. They hold no fake data and no dead
controls.

## Error handling

Every page handles the API being unreachable (a plain message
naming the configured API URL), 401 (session expiry redirect),
403 (a clear permission message) and ordinary API errors (the
API's own message), with retry where a retry makes sense.
Loading states are plain text notes, consistent across pages.

## Tailwind CSS configuration

Tailwind CSS v3.4.19 is installed in this app (devDependencies:
`tailwindcss`, `postcss`, `autoprefixer`), wired through
`postcss.config.mjs` and configured in `tailwind.config.ts`.
The storefront uses the same version and the same approach,
so the monorepo has one shared Tailwind setup. v3 was chosen
over v4 because it exposes an explicit `content` list and
`corePlugins.preflight`: the storefront needs that guarantee
for its legacy stylesheet, and the admin follows the same
setup for consistency.

Preflight decision: preflight is OFF here too
(`corePlugins: { preflight: false }`), and `src/app/globals.css`
imports only `@tailwind utilities` after the design tokens.
The admin has no legacy design constraint, but its current look
must not change, so the existing hand-written CSS stays as the
base, exactly as written, and Tailwind utilities are added
alongside it instead of resetting anything.

Theme mapping: every value in `tailwind.config.ts` resolves
to an existing CSS variable. The colours, radii and shadow
map to the Dostelo design tokens from
`@dostelo/design-tokens` (`tokens.css`), the same variables
this app's globals.css already used (`bg`, `panel`, `surface`,
`surface2`, `ink`, `body`, `muted`, `line`, `dark`, `dark2`,
`on-dark`, `on-dark-mut`, `chip`, `--r-lg`, `--r-md`,
`--r-sm`, `--shadow`), and `fontFamily.sans` is the admin
body font stack from globals.css verbatim (system-ui,
-apple-system, "Segoe UI", Roboto, sans-serif). No colour,
spacing, radius or font value is hard-coded in the config.

What was converted, and what was not:

- The shared primitives in `src/components/ui.tsx`
  (PageHeader, the note components, ErrorNote with its retry
  button, StatCard and Badge) are now written in utility
  classes that reproduce their previous classes value for
  value.
- In `src/app/globals.css`, the reusable primitive classes
  that the pages still use (`.page-head`, `.card`, `.grid`,
  `.stat-card` parts, `.note`, `.muted`, `.error-note`,
  `.badge`, `.table-wrap`, `table.data`, `.field`, `.input`,
  `.select`, `.toolbar`, `.btn` and its variants) are now
  expressed with `@apply` over the token-mapped utilities, so
  their computed values are identical and every page renders
  as before.
- Left on plain CSS, deliberately: `font: inherit` inside
  `.btn`, `.input` and `.select` (kept as a plain declaration
  beside the `@apply`, since no utility expresses it in a
  class definition; the ui.tsx retry button uses the
  arbitrary property `[font:inherit]` instead); the
  `border-bottom` shorthand on `table.data` cells (a
  border-width plus border-style utility pair would, with
  preflight off, also paint the other three sides, whose
  widths are otherwise unset); the `.grid` template columns;
  and the `.form-error` colour `#9c2b1b`, which has no design
  token. Mapping it to the nearest token would change its
  value, so the original hex stays in place and only its
  size, line-height and margin were converted.
- Everything else in globals.css (shell, sidebar, topbar,
  detail layouts, timeline, drawer) is untouched hand-written
  CSS and remains the base layer of the admin's look.
