import type { LeadContactBasis } from './lead';
import type { Money } from './money';
import type {
  CommunicationChannel,
  CommunicationLogStatus,
} from './communication';

/**
 * Abandoned Cart Recovery types (Phase 6), from the abandoned-cart
 * workflow in docs/ADMIN_PORTAL.md:
 *
 * - A scheduled worker (here: the scan job plus a staff-triggered
 *   scan) identifies carts inactive beyond a configured period.
 * - Carts with a completed order, no items, no contact path, or a
 *   converted status are excluded.
 * - Recovery messages go only through channels the customer has a
 *   recorded basis for, and suppression and consent refusals are
 *   enforced again at send time by the communications module.
 * - The recovery link carries an unguessable token, never a cart
 *   or customer id, and the public token read never exposes the
 *   customer's contact details.
 * - Placing an order cancels every pending step, so a customer
 *   who buys is never chased afterwards.
 */

export const ABANDONED_CART_STATUSES = [
  /** Detected as abandoned; the sequence is scheduled. */
  'detected',
  /** At least one step has run; more steps are pending. */
  'in-recovery',
  /** An order was placed; pending steps were cancelled. */
  'recovered',
  /** No longer actionable: cart emptied, sequence exhausted, or
   * the token expired before any step could help. */
  'closed',
  /** Staff cancelled the recovery. */
  'cancelled',
] as const;

export type AbandonedCartStatus =
  (typeof ABANDONED_CART_STATUSES)[number];

/**
 * One step of the recovery sequence. delayMinutes is the wait
 * after the previous step ran (after detection, for step 1). The
 * sequence is stored as data and editable by staff holding
 * recovery.edit; edits apply to carts detected afterwards and to
 * steps not yet scheduled.
 */
export interface RecoveryStep {
  stepNumber: number;
  delayMinutes: number;
  channel: CommunicationChannel;
  templateKey: string;
}

/** The stored recovery configuration (the RecoveryCampaign data
 * of docs/BACKEND_AND_DATABASE.md, kept as one settings record). */
export interface RecoverySettings {
  /** Minutes of cart inactivity before detection. */
  abandonedAfterMinutes: number;
  /** Days a recovery token stays valid after detection. */
  tokenTtlDays: number;
  steps: RecoveryStep[];
}

/** Default sequence from the Phase 6 brief: a WhatsApp reminder
 * after 1 hour, an email after 24 hours, and a staff call task
 * after 72 hours. */
export const DEFAULT_RECOVERY_SETTINGS: RecoverySettings = {
  abandonedAfterMinutes: 60,
  tokenTtlDays: 30,
  steps: [
    {
      stepNumber: 1,
      delayMinutes: 60,
      channel: 'whatsapp',
      templateKey: 'recovery-whatsapp-1',
    },
    {
      stepNumber: 2,
      delayMinutes: 1440,
      channel: 'email',
      templateKey: 'recovery-email-1',
    },
    {
      stepNumber: 3,
      delayMinutes: 4320,
      channel: 'call',
      templateKey: 'recovery-call-1',
    },
  ],
};

/**
 * A cart identified as abandoned, with the contact path resolved
 * at detection time. Contact fields live on the staff side only;
 * the public recovery-token view never carries them.
 */
export interface AbandonedCart {
  id: string;
  cartId: string;
  customerId: string | null;
  /** First-party visitor id, when the cart's session token maps
   * to a tracked visitor session. */
  visitorId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** Why the store may contact this person (account, checkout or
   * marketing consent), from the customer record at detection. */
  contactBasis: LeadContactBasis | null;
  /** Cart subtotal snapshot at detection, in minor units. */
  cartTotal: Money;
  itemCount: number;
  status: AbandonedCartStatus;
  /** Why the recovery closed, when it did: 'cart-emptied',
   * 'sequence-exhausted' or 'token-expired'. */
  closeReason: string | null;
  /** Unguessable token for the public recovery link. */
  recoveryToken: string;
  tokenExpiresAt: string;
  detectedAt: string;
  /** The cart's updatedAt at detection: the inactivity anchor. */
  lastActivityAt: string;
  /** Order number that recovered this cart, when one did. */
  recoveredOrderNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export const RECOVERY_ATTEMPT_STATUSES = [
  'scheduled',
  'executed',
  'cancelled',
  'skipped',
] as const;

export type RecoveryAttemptStatus =
  (typeof RECOVERY_ATTEMPT_STATUSES)[number];

/**
 * One scheduled or executed step of a recovery. The outcome of an
 * executed step mirrors the communication log status it produced
 * ('sent', 'not-configured', a refusal, or 'awaiting-staff' for a
 * call task), or 'skipped-no-contact' when the step's channel has
 * no address on the recovery.
 */
export interface RecoveryAttempt {
  id: string;
  abandonedCartId: string;
  stepNumber: number;
  channel: CommunicationChannel;
  templateKey: string;
  scheduledFor: string;
  executedAt: string | null;
  status: RecoveryAttemptStatus;
  outcome: CommunicationLogStatus | 'skipped-no-contact' | null;
  communicationLogId: string | null;
  /** Job id in the queue seam, for cancellation. Null once the
   * job has run or been cancelled. */
  queueJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One line of the public recovery-token view, priced from the
 * current catalog (not the cart's snapshot), as the brief asks. */
export interface RecoveryCartLineView {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}

/**
 * The public answer to GET /v1/recovery/:token. Carries no
 * contact details, no customer id and no visitor id. Recovered,
 * closed, cancelled and expired tokens answer with their honest
 * status and no items.
 */
export interface RecoveryCartView {
  status: 'active' | AbandonedCartStatus | 'expired';
  message: string | null;
  items: RecoveryCartLineView[];
  subtotal: Money;
  expiresAt: string;
}
