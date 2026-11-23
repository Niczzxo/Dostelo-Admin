import { z } from 'zod';
import { PAYMENT_GATEWAYS } from '@dostelo/types';
import { bdPhoneSchema } from './cart';

/** Starts (or retries) a payment attempt for an existing order.
 * The amount is never accepted from the client; it comes from the
 * order total the server computed at checkout. */
export const paymentInitiateSchema = z.object({
  orderId: z.string().min(1),
  gateway: z.enum(PAYMENT_GATEWAYS),
});
export type PaymentInitiate = z.infer<typeof paymentInitiateSchema>;

/** Manual mobile banking: the customer reports the number they
 * sent money from and the transaction id the provider gave them.
 * Nothing is marked paid on this step; staff verification does
 * that. */
export const manualPaymentConfirmSchema = z.object({
  senderNumber: bdPhoneSchema,
  transactionId: z.string().trim().min(4).max(64),
});
export type ManualPaymentConfirm = z.infer<
  typeof manualPaymentConfirmSchema
>;

/** Staff decision on a manual payment awaiting verification.
 * Staff-facing shape; the Phase 4 RBAC guard (payments.verify)
 * will protect the route. */
export const paymentVerifySchema = z.object({
  decision: z.enum(['paid', 'rejected']),
  note: z.string().trim().max(300).optional(),
  actorId: z.string().min(1).optional(),
});
export type PaymentVerify = z.infer<typeof paymentVerifySchema>;

/** Refund request against a paid payment. The amount defaults to
 * the still-unrefunded remainder of the payment. Staff-facing
 * shape; the Phase 4 RBAC guard (payments.refund) will protect
 * the route. */
export const refundRequestSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().trim().max(300).optional(),
  actorId: z.string().min(1).optional(),
});
export type RefundRequest = z.infer<typeof refundRequestSchema>;

/** Staff confirmation that a manual refund (COD cash or a mobile
 * banking send-back) has actually been handed over. */
export const refundConfirmSchema = z.object({
  actorId: z.string().min(1).optional(),
  note: z.string().trim().max(300).optional(),
});
export type RefundConfirm = z.infer<typeof refundConfirmSchema>;
