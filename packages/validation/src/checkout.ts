import { z } from 'zod';
import { PAYMENT_GATEWAYS } from '@dostelo/types';
import { bdPhoneSchema, cartLineCreateSchema } from './cart';

/** Delivery address as collected by the checkout form. The delivery
 * zone is never accepted from the client; the server detects it from
 * the district and address text. */
export const checkoutAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: bdPhoneSchema,
  addressLine: z.string().trim().min(4).max(300),
  area: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120),
});
export type CheckoutAddress = z.infer<typeof checkoutAddressSchema>;

/** Contact details used to find or create the customer at checkout
 * when no registered customerId is supplied. */
export const checkoutCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: bdPhoneSchema,
  email: z.string().trim().email().max(200).optional(),
});
export type CheckoutCustomer = z.infer<typeof checkoutCustomerSchema>;

/**
 * Shared by the quote and place-order endpoints. Lines come either
 * inline or from an existing cart via cartId. customerId identifies a
 * registered customer; customer carries find-or-create contact
 * details. The server recomputes every price and total; no monetary
 * field is accepted from the client.
 */
export const checkoutRequestSchema = z
  .object({
    customerId: z.string().min(1).optional(),
    customer: checkoutCustomerSchema.optional(),
    cartId: z.string().min(1).optional(),
    lines: z.array(cartLineCreateSchema).min(1).max(100).optional(),
    address: checkoutAddressSchema,
    paymentMethod: z.enum(PAYMENT_GATEWAYS),
    /**
     * Optional first-party visitor id from the storefront tracker
     * (Phase 5). When present, placing the order links the guest's
     * visitor id to the customer as a Guest Checkout identity. It
     * is an anonymous random id, never an identity by itself.
     */
    visitorId: z.string().trim().min(8).max(100).optional(),
  })
  .refine((data) => Boolean(data.cartId || data.lines), {
    message: 'Provide either cartId or lines',
    path: ['lines'],
  });
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
