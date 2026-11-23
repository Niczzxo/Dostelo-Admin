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
}

export const DEFAULT_STORE_PROFILE = {
  storeName: 'Dostelo',
  contactEmail: 'hello@dostelo.example',
  contactPhone: '',
} as const;
