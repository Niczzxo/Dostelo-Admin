import type { Money } from './money';

/**
 * Loyalty points (admin master structure module 17: Loyalty &
 * Rewards Management). Points are derived, not stored as a
 * balance: a customer earns by the rules below on the total of
 * their delivered orders, and staff adjustments (grants,
 * corrections, redemptions recorded by staff) are stored as
 * transactions. The balance is earned plus adjustments, so it
 * can always be re-derived and audited.
 */
export interface LoyaltyRules {
  /** Taka of delivered order value that earns one point. */
  takaPerPoint: number;
  /** Value of one point when redeemed, in minor units. */
  pointValueMinor: number;
}

export const DEFAULT_LOYALTY_RULES: LoyaltyRules = {
  takaPerPoint: 100,
  pointValueMinor: 100,
};

/** What kind of ledger entry a transaction is. The ledger is
 * append-only: corrections are new reversing entries, never
 * edits to old ones. */
export type LoyaltyTransactionType =
  | 'earned-order'
  | 'earned-registration'
  | 'earned-review'
  | 'earned-referral'
  | 'redeemed'
  | 'expired'
  | 'adjusted'
  | 'reversal';

export const LOYALTY_TRANSACTION_TYPE_LABELS: Record<
  LoyaltyTransactionType,
  string
> = {
  'earned-order': 'Earned: order',
  'earned-registration': 'Earned: registration',
  'earned-review': 'Earned: review',
  'earned-referral': 'Earned: referral',
  redeemed: 'Redeemed',
  expired: 'Expired',
  adjusted: 'Adjusted by staff',
  reversal: 'Reversal',
};

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  /** Signed point change: positive grants, negative redeems or
   * corrects. */
  delta: number;
  reason: string;
  /** Order the adjustment relates to, when it quotes one. */
  orderId: string | null;
  /** Ledger entry kind (Loyalty redesign). */
  type: LoyaltyTransactionType;
  /** Idempotency key for event-driven awards: one award per
   * order, per registration, per review. Null for staff
   * adjustments, which are deliberate acts. */
  referenceKey: string | null;
  createdById: string | null;
  createdAt: string;
}

/**
 * One points rule (Loyalty redesign). Rules are stored
 * server-side and only take effect while active. The four
 * seeded defaults ship inactive: the store turns each on
 * deliberately. Awards are written by the real event flows
 * (order delivered, verified review published) as ledger
 * transactions, idempotent per event.
 */
export interface PointsRule {
  id: string;
  activity: 'completed-order' | 'registration' | 'verified-review' | 'referral-purchase';
  calculation: 'per-amount' | 'fixed' | 'one-time';
  /** Points awarded (per amount step for per-amount rules). */
  points: number;
  /** For per-amount rules: taka of order value per step. */
  perAmountTaka: number | null;
  /** Minimum order total, in minor units, to qualify. */
  minOrderMinor: number | null;
  /** Cap on points from a single order. */
  maxPointsPerOrder: number | null;
  active: boolean;
}

export const DEFAULT_POINTS_RULES: PointsRule[] = [
  {
    id: 'rule-completed-order',
    activity: 'completed-order',
    calculation: 'per-amount',
    points: 1,
    perAmountTaka: 100,
    minOrderMinor: null,
    maxPointsPerOrder: null,
    active: false,
  },
  {
    id: 'rule-registration',
    activity: 'registration',
    calculation: 'one-time',
    points: 100,
    perAmountTaka: null,
    minOrderMinor: null,
    maxPointsPerOrder: null,
    active: false,
  },
  {
    id: 'rule-verified-review',
    activity: 'verified-review',
    calculation: 'fixed',
    points: 50,
    perAmountTaka: null,
    minOrderMinor: null,
    maxPointsPerOrder: null,
    active: false,
  },
  {
    id: 'rule-referral-purchase',
    activity: 'referral-purchase',
    calculation: 'fixed',
    points: 200,
    perAmountTaka: null,
    minOrderMinor: null,
    maxPointsPerOrder: null,
    active: false,
  },
];

export interface LoyaltyBalance {
  customerId: string;
  customerName: string;
  /** Delivered order value the earned points derive from. */
  deliveredSpend: Money;
  earnedPoints: number;
  /** Sum of the stored staff adjustments. */
  adjustmentPoints: number;
  balancePoints: number;
  /** What the balance is worth at the current rules. */
  balanceValue: Money;
}

/** One entry in the customer-facing loyalty activity list. */
export interface LoyaltyAccountTransactionView {
  id: string;
  points: number;
  reason: string;
  createdAt: string;
}

/** Customer-facing loyalty account (the GET /v1/loyalty/me
 * contract the storefront account panel renders). Additive
 * contract types added 2026-11-28 for the storefront rebuild:
 * the API does not serve this endpoint yet, and the storefront
 * renders its honest unavailable state until it does. */
export interface LoyaltyAccountView {
  balance: number;
  lifetimePoints: number;
  tier: { id: string; name: string };
  referralCode: string | null;
  transactions: LoyaltyAccountTransactionView[];
}

/** A points redemption reward offered to customers. */
export interface LoyaltyReward {
  id: string;
  name: string;
  pointsCost: number;
  /** Discount the reward grants, in minor units (poisha). */
  discountMinor: number;
}

/** A completed points redemption. */
export interface LoyaltyRedemption {
  id: string;
  rewardId: string;
  pointsSpent: number;
  /** Code the customer quotes to claim the reward. */
  code: string;
  createdAt: string;
}
