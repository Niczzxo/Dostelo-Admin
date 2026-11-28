import type { Money } from './money';

/**
 * Returns, exchanges and refund hand-off (admin master structure
 * module 12: Returns, Refunds & Exchanges). A return request is
 * tied to a delivered order and quotes its lines; received
 * units restock only after a resellable inspection, and the
 * money side is handed off to Payments as a refund request on
 * the order's payment rather than being settled inside this
 * module.
 */
export const RETURN_KINDS = ['return', 'exchange'] as const;
export type ReturnKind = (typeof RETURN_KINDS)[number];

export const RETURN_KIND_LABELS: Record<ReturnKind, string> = {
  return: 'Return',
  exchange: 'Exchange',
};

export const RETURN_STATUSES = [
  'requested',
  'under-review',
  'approved',
  'rejected',
  'awaiting-pickup',
  'in-transit',
  'received',
  'inspection',
  'refund-pending',
  'refunded',
  'exchange-processing',
  'completed',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: 'Requested',
  'under-review': 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  'awaiting-pickup': 'Awaiting Pickup',
  'in-transit': 'In Transit',
  received: 'Received',
  inspection: 'Inspection',
  'refund-pending': 'Refund Pending',
  refunded: 'Refunded',
  'exchange-processing': 'Exchange Processing',
  completed: 'Completed',
};

/** The legal state machine for a return. Every transition is
 * validated server-side and recorded as a ReturnEvent. */
export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ['under-review', 'approved', 'rejected'],
  'under-review': ['approved', 'rejected'],
  approved: ['awaiting-pickup', 'received'],
  rejected: [],
  'awaiting-pickup': ['in-transit', 'received'],
  'in-transit': ['received'],
  received: ['inspection'],
  inspection: ['refund-pending', 'exchange-processing', 'completed'],
  'refund-pending': ['refunded'],
  refunded: ['completed'],
  'exchange-processing': ['completed'],
  completed: [],
};

/** Reason categories, shared by the request form and the
 * analytics breakdown. Free-text reasons recorded before this
 * list existed group under 'other' in analytics. */
export const RETURN_REASONS = [
  'defective',
  'wrong-item',
  'wrong-size',
  'damaged-in-delivery',
  'not-as-described',
  'changed-mind',
  'other',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  defective: 'Defective',
  'wrong-item': 'Wrong Item',
  'wrong-size': 'Wrong Size',
  'damaged-in-delivery': 'Damaged During Delivery',
  'not-as-described': 'Not as Described',
  'changed-mind': 'Changed Mind',
  other: 'Other',
};

/** What the customer asked for: their money back, a swap, or a
 * like-for-like replacement. */
export const RETURN_RESOLUTION_TYPES = [
  'refund',
  'exchange',
  'replacement',
] as const;
export type ReturnResolutionType =
  (typeof RETURN_RESOLUTION_TYPES)[number];

export const RETURN_RESOLUTION_LABELS: Record<
  ReturnResolutionType,
  string
> = {
  refund: 'Refund',
  exchange: 'Exchange',
  replacement: 'Replacement',
};

export const INSPECTION_OUTCOMES = [
  'resellable',
  'damaged',
  'defective',
  'incomplete',
  'needs-review',
] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];

export const INSPECTION_OUTCOME_LABELS: Record<
  InspectionOutcome,
  string
> = {
  resellable: 'Resellable',
  damaged: 'Damaged',
  defective: 'Defective',
  incomplete: 'Incomplete',
  'needs-review': 'Needs Review',
};

/** The recorded inspection of the received goods. Only the
 * 'resellable' outcome returns units to sellable stock, through
 * an audited inventory adjustment; every other outcome leaves
 * stock untouched. */
export interface ReturnInspection {
  condition: string;
  packaging: string | null;
  accessories: string | null;
  quantityReceived: number;
  outcome: InspectionOutcome;
  notes: string | null;
  inspectedById: string | null;
  inspectedAt: string;
}

/** One recorded step in a return's life: a status transition or
 * a staff note action (information requested, inspector
 * assigned, pickup scheduled). The details timeline is built
 * from these records only. */
export interface ReturnEvent {
  id: string;
  returnId: string;
  status: ReturnStatus;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

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
  /** What the customer asked for (refund, exchange,
   * replacement), recorded at creation. */
  resolutionType: ReturnResolutionType;
  /** The customer-stated condition of the goods, when given. */
  condition: string | null;
  /** Staff member assigned to inspect the received goods. */
  assigneeId: string | null;
  /** When a pickup was scheduled. Scheduling is a record only:
   * no courier pickup is booked by it (courier accounts are not
   * configured), and the UI says so. */
  pickupScheduledAt: string | null;
  /** When the goods were recorded as received. */
  receivedAt: string | null;
  /** The recorded inspection, once completed. */
  inspection: ReturnInspection | null;
  items: ReturnLine[];
  /** Total value of the returned lines, at order prices. */
  total: Money;
  refundState: ReturnRefundState;
  /** The Payments refund created by the hand-off, when handed off. */
  refundId: string | null;
  /** True once a resellable inspection has put received units
   * back into sellable stock through an audited adjustment.
   * Received goods never restock before inspection. */
  restocked: boolean;
  /** Replacement order created for an approved exchange, when
   * one is created. The current flow ends exchanges at
   * exchange-processing, so this stays null today; the field is
   * part of the customer-facing contract the storefront reads. */
  replacementOrderId?: string | null;
  createdById: string | null;
  decidedById: string | null;
  createdAt: string;
  updatedAt: string;
}
