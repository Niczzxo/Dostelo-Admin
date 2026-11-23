# API Client

Typed client for the Dostelo API. `createApiClient({ baseUrl })`
returns methods for catalog, customers, carts, checkout, orders
and inventory. Request payloads use the Zod-inferred types from
@dostelo/validation and responses use the domain types from
@dostelo/types, so contract drift fails typecheck on both sides.
Non-2xx responses throw `ApiError` with the status and parsed body.

The base URL is configurable per client instance (production:
https://api.dostelo.com). A fetch implementation can be injected
for tests or non-browser runtimes. Auth/session headers arrive
with the Phase 4 authentication work. Never expose server secrets
in client code.

The package builds to both ESM (dist, for bundlers) and CommonJS
(dist-cjs, for Node runtimes), like @dostelo/types.
