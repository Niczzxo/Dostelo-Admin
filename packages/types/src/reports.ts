import type { DeliveryZone } from './order';

/**
 * Business reports (admin master structure module 18: Reports &
 * Business Analytics). Every figure here is an aggregation over
 * the platform's existing records (orders, payments, abandoned
 * carts) computed at read time; reports own no stored data.
 */
export interface SalesByDay {
  /** Calendar date (YYYY-MM-DD) in Asia/Dhaka, the store
   * timezone the Reports definitions use for day boundaries. */
  date: string;
  orders: number;
  revenueMinor: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  quantity: number;
  revenueMinor: number;
}

export interface ZoneSplit {
  zone: DeliveryZone;
  orders: number;
  revenueMinor: number;
}

export interface PaymentMethodSplit {
  /** The payment method key from the payment record (cod, bkash,
   * sslcommerz, card, ...). */
  method: string;
  payments: number;
  amountMinor: number;
}

export interface RecoveryPerformance {
  detected: number;
  recovered: number;
  cancelled: number;
  inProgress: number;
  /** Recovered divided by detected, as a percentage with one
   * decimal. Zero when nothing was detected. */
  recoveryRatePercent: number;
  /** Value of the carts that were recovered, in minor units. */
  recoveredValueMinor: number;
}

export interface ReportsSummary {
  from: string;
  to: string;
  orderCount: number;
  revenueMinor: number;
  salesByDay: SalesByDay[];
  topProducts: TopProduct[];
  zoneSplit: ZoneSplit[];
  paymentSplit: PaymentMethodSplit[];
  recovery: RecoveryPerformance;
}
