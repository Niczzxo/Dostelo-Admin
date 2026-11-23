import type { Money } from './money';

/** Payment gateways and methods configured for Dostelo in
 * Bangladesh. bkash, nagad, rocket and upay run as manual mobile
 * banking by default (the customer sends money to the store number
 * and staff verify it); bkash can switch to its tokenized gateway
 * when credentials are configured. sslcommerz (which also carries
 * card payments) and shurjopay are hosted gateways. */
export const PAYMENT_GATEWAYS = [
  'bkash',
  'nagad',
  'rocket',
  'upay',
  'sslcommerz',
  'shurjopay',
  'card',
  'cod',
] as const;

export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PAYMENT_GATEWAY_LABELS: Record<PaymentGateway, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  rocket: 'Rocket',
  upay: 'Upay',
  sslcommerz: 'SSLCommerz',
  shurjopay: 'ShurjoPay',
  card: 'Card',
  cod: 'Cash on Delivery',
};

/** How a payment is carried: cash collected on delivery, a manual
 * mobile banking transfer verified by staff, or a hosted gateway
 * session. The channel decides which flows and refunds apply. */
export type PaymentChannel = 'cod' | 'manual' | 'gateway';

export type PaymentStatus =
  | 'initiated'
  /** Manual mobile banking: waiting for the customer to send the
   * money and confirm with their transaction id. */
  | 'awaiting-customer'
  /** Manual mobile banking: the customer confirmed; staff have not
   * verified the transfer yet. */
  | 'verification-pending'
  | 'pending'
  /** COD: the cash is collected when the order is delivered. */
  | 'pending-collection'
  | 'successful'
  /** COD: the cash was collected on delivery. */
  | 'collected'
  | 'failed'
  /** Voided before any money moved (for example a COD order that
   * was cancelled before delivery). */
  | 'cancelled'
  | 'refunded';

/** Receiving instructions shown to the customer for a manual
 * mobile banking payment. The text is store-configured; the
 * reference is always the order number. */
export interface PaymentInstructions {
  method: PaymentGateway;
  text: string;
  reference: string;
}

export interface Payment {
  id: string;
  orderId: string;
  gateway: PaymentGateway;
  channel: PaymentChannel;
  status: PaymentStatus;
  amount: Money;
  /** Transaction id assigned by the provider. Unique when present.
   * For a verified manual payment this is the transaction id the
   * customer reported and staff confirmed. */
  providerTxnId: string | null;
  /** Manual payments only: the number the customer sent money
   * from, as reported at confirmation. */
  senderNumber: string | null;
  /** Manual payments only: the transaction id the customer
   * reported at confirmation, before staff verification. */
  customerTxnId: string | null;
  /** Manual payments only: the receiving instructions the attempt
   * was created with. */
  instructions: PaymentInstructions | null;
  createdAt: string;
  updatedAt: string;
}

/** One entry in a payment's audit trail. Every state change writes
 * exactly one event. */
export interface PaymentEvent {
  id: string;
  paymentId: string;
  type: string;
  status: PaymentStatus | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export type RefundStatus =
  /** Recorded against a gateway payment; the gateway step has not
   * completed (or has not been attempted yet). */
  | 'requested'
  /** COD or manual payment: the money goes back to the customer
   * outside any gateway; staff confirm when it is done. */
  | 'manual-pending'
  /** The gateway step could not run because the gateway is not
   * configured. The refund is recorded but NOT sent, and the
   * payment is never marked refunded on this path. */
  | 'gateway-not-configured'
  | 'completed'
  | 'rejected';

export interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  amount: Money;
  status: RefundStatus;
  reason: string | null;
  /** What happened at the gateway step, in plain words. Null for
   * manual refunds that never touch a gateway. */
  gatewayNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A webhook delivery as received from a gateway. The pair
 * (gateway, providerEventId) is unique: a redelivery of the same
 * event is a duplicate and must not re-apply its effects. */
export interface WebhookEvent {
  id: string;
  gateway: PaymentGateway;
  providerEventId: string;
  paymentId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}
