import type { LoyaltyRules } from './loyalty';
import {
  COD_FEE_MINOR,
  DELIVERY_ZONE_FEE_MINOR,
} from './order';

/**
 * Store settings (admin master structure module 19: Website &
 * Storefront Management). One settings record holds the store
 * profile, the delivery fee table checkout charges, the free
 * delivery offer switch, the manual mobile-banking receiving
 * instructions and the loyalty rules. The defaults below are the
 * live store values: the fee defaults are exactly the constants
 * checkout charged before the settings seam carried them.
 */
export interface DeliveryFeeSettings {
  dhakaCityMinor: number;
  dhakaSubCityMinor: number;
  outsideDhakaMinor: number;
  codFeeMinor: number;
}

export const DEFAULT_DELIVERY_FEES: DeliveryFeeSettings = {
  dhakaCityMinor: DELIVERY_ZONE_FEE_MINOR['dhaka-city'],
  dhakaSubCityMinor: DELIVERY_ZONE_FEE_MINOR['dhaka-sub-city'],
  outsideDhakaMinor: DELIVERY_ZONE_FEE_MINOR['outside-dhaka'],
  codFeeMinor: COD_FEE_MINOR,
};

export type ManualInstructionsMap = Record<
  'bkash' | 'nagad' | 'rocket' | 'upay',
  string
>;

export interface StoreSettingsView {
  storeName: string;
  contactEmail: string;
  contactPhone: string;
  freeDeliveryOffer: boolean;
  deliveryFees: DeliveryFeeSettings;
  manualInstructions: ManualInstructionsMap;
  loyaltyRules: LoyaltyRules;
  /** Days after delivery during which a return can be opened
   * (Returns module). Enforced server-side at creation. */
  returnWindowDays: number;
  /** Enable flag for the lead candidate evaluation automation.
   * When off, visitor evaluation creates no new lead candidates
   * (existing leads are untouched). */
  automationLeadEvaluationEnabled: boolean;
  /** Whether Cash on Delivery is accepted at checkout. When
   * off, the checkout path refuses COD orders server-side. */
  allowCod: boolean;
  /** Whether the store is live. When off, the public catalogue
   * and checkout endpoints return a store-closed response. */
  storeLive: boolean;
  /** Support SLA targets by priority, in hours (Support
   * redesign). Elapsed-time math only: no business-hours or
   * holiday calendar exists. */
  slaTargets: SlaTargets;
}

/** First response and resolution targets per ticket priority. */
export interface SlaTargets {
  urgent: { firstResponseHours: number; resolutionHours: number };
  high: { firstResponseHours: number; resolutionHours: number };
  normal: { firstResponseHours: number; resolutionHours: number };
  low: { firstResponseHours: number; resolutionHours: number };
}

export const DEFAULT_SLA_TARGETS: SlaTargets = {
  urgent: { firstResponseHours: 1, resolutionHours: 4 },
  high: { firstResponseHours: 4, resolutionHours: 24 },
  normal: { firstResponseHours: 8, resolutionHours: 48 },
  low: { firstResponseHours: 24, resolutionHours: 72 },
};

export const DEFAULT_STORE_PROFILE = {
  storeName: 'Dostelo',
  contactEmail: 'hello@dostelo.example',
  contactPhone: '',
} as const;
