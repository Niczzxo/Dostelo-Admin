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

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  /** Signed point change: positive grants, negative redeems or
   * corrects. */
  delta: number;
  reason: string;
  /** Order the adjustment relates to, when it quotes one. */
  orderId: string | null;
  createdById: string | null;
  createdAt: string;
}

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
