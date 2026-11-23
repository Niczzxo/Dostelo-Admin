import type { Money } from './money';

/**
 * Returns, exchanges and refund hand-off (admin master structure
 * module 12: Returns, Refunds & Exchanges). A return request is
 * tied to a delivered order and quotes its lines; approval
 * restocks the returned units, and the money side is handed off
 * to Payments as a refund request on the order's payment rather
 * than being settled inside this module.
 */
export const RETURN_KINDS = ['return', 'exchange'] as const;
export type ReturnKind = (typeof RETURN_KINDS)[number];

export const RETURN_KIND_LABELS: Record<ReturnKind, string> = {
  return: 'Return',
  exchange: 'Exchange',
};

export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'completed',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
};

/**
 * Where the money side of a return stands: 'none' until staff hand
 * it off, 'handed-off' once a refund has been requested in
 * Payments, and 'not-required' when no refund applies (an exchange,
 * or an order that was never paid).
 */
export type ReturnRefundState = 'none' | 'handed-off' | 'not-required';

export interface ReturnLine {
  orderItemId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: Money;
}

export interface ReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  kind: ReturnKind;
  status: ReturnStatus;
  reason: string | null;
  note: string | null;
  items: ReturnLine[];
  /** Total value of the returned lines, at order prices. */
  total: Money;
  refundState: ReturnRefundState;
  /** The Payments refund created by the hand-off, when handed off. */
  refundId: string | null;
  /** True once approval has put the returned units back in stock. */
  restocked: boolean;
  createdById: string | null;
  decidedById: string | null;
  createdAt: string;
  updatedAt: string;
}
