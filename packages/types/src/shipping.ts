import type { Money } from './money';

/**
 * Shipping and Courier types (Phase 6, chunk 2): courier booking
 * and tracking for Pathao, Steadfast and RedX, following the
 * honesty pattern of the payment gateways and the communication
 * providers.
 *
 * - A shipment is only ever in a courier-confirmed state when a
 *   configured courier adapter confirmed it. A courier without
 *   merchant credentials produces a Shipment in the
 *   'not-configured' status with the reason recorded and no
 *   tracking id: nothing is ever shown as booked that was not
 *   booked.
 * - Courier raw statuses are mapped onto one canonical
 *   vocabulary; the raw string is preserved on the shipment and
 *   on every status event, so nothing the courier said is lost.
 * - A courier reporting 'delivered' moves the order only through
 *   the orders service's legal status transitions, never by a
 *   direct write from the shipping module.
 */

export const COURIERS = ['pathao', 'steadfast', 'redx'] as const;

export type Courier = (typeof COURIERS)[number];

export const COURIER_LABELS: Record<Courier, string> = {
  pathao: 'Pathao',
  steadfast: 'Steadfast',
  redx: 'RedX',
};

/**
 * Canonical shipment statuses. 'not-configured' is the honest
 * pre-booking state (the courier has no merchant credentials in
 * this environment); the rest are the mapped courier lifecycle.
 * 'cancelled' is part of the vocabulary because all three
 * couriers report parcel cancellations.
 */
export const SHIPMENT_STATUSES = [
  'not-configured',
  'created',
  'picked-up',
  'in-transit',
  'delivered',
  'returned',
  'failed',
  'cancelled',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  'not-configured': 'Not configured',
  created: 'Created',
  'picked-up': 'Picked up',
  'in-transit': 'In transit',
  delivered: 'Delivered',
  returned: 'Returned',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** Where a shipment status change came from. */
export type ShipmentEventSource =
  | 'create'
  | 'refresh'
  | 'webhook'
  | 'staff';

export interface Shipment {
  id: string;
  orderId: string;
  /** Denormalised order number: the identifier staff and
   * couriers quote, and the merchant invoice id sent to the
   * courier. */
  orderNumber: string;
  courier: Courier;
  status: ShipmentStatus;
  /**
   * The courier's consignment or tracking id. Null until a
   * configured courier confirms the booking; a not-configured or
   * failed creation never invents one.
   */
  trackingId: string | null;
  recipientName: string;
  recipientPhone: string;
  /** Recipient address as one string, the shape couriers take:
   * address line, area, city and district joined at creation. */
  recipientAddress: string;
  /** Cash to collect on delivery, in minor units. The order
   * total for an unpaid COD order; zero for a prepaid order. */
  codAmount: Money;
  /** Parcel weight in kilograms (the adapters convert at their
   * boundary when a courier wants another unit). */
  weightKg: number;
  /** Why the courier is not configured, when status is
   * 'not-configured': the missing environment variables, named. */
  notConfiguredReason: string | null;
  /** The latest raw status string the courier reported, kept
   * verbatim next to its canonical mapping. */
  lastRawStatus: string | null;
  /** Staff member who created the shipment, when created through
   * the staff endpoint. */
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One recorded status change on a shipment: the canonical
 * status, the courier's raw wording, and where the change came
 * from. Append-only, like the payment and order event trails. */
export interface ShipmentStatusEvent {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  rawStatus: string | null;
  source: ShipmentEventSource;
  note: string | null;
  createdAt: string;
}

/** Staff shipment detail: the shipment plus its status history. */
export interface ShipmentDetail {
  shipment: Shipment;
  events: ShipmentStatusEvent[];
}

/**
 * The courier webhook answer, mirroring the payment webhook
 * shape: a redelivery of an already-recorded event returns
 * duplicate true and applies nothing a second time.
 */
export interface CourierWebhookResult {
  received: true;
  duplicate: boolean;
  applied: boolean;
  shipmentId: string | null;
  reason?: string;
}
