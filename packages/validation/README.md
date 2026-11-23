# Shared Validation

Zod schemas shared by frontends and API. The API always validates
independently at the trust boundary (see apps/api/src/common/
parse-body.ts); clients use the same schemas for form validation
and the inferred types for payloads.

Implemented schemas:

- `cart.ts`: bdPhoneSchema, cartCreateSchema, cartLineCreateSchema,
  cartLineUpdateSchema (quantity 0 removes the line).
- `customer.ts`: customerRegistrationSchema (email or phone, name,
  password of at least 8 characters).
- `checkout.ts`: checkoutAddressSchema, checkoutCustomerSchema,
  checkoutRequestSchema (cartId or inline lines, payment method
  from PAYMENT_GATEWAYS; no prices or totals are accepted, the
  server computes them, and the delivery zone is never taken from
  the client).
- `order.ts`: orderStatusTransitionSchema, inventoryAdjustSchema.

The package builds to both ESM (dist, for bundlers) and CommonJS
(dist-cjs, for the NestJS API runtime), like @dostelo/types.
