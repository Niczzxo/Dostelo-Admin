/**
 * Money is always stored and transported as integer minor units
 * (paisa for BDT) plus an ISO currency code. Never use floating point
 * for money anywhere in Dostelo.
 */
export type CurrencyCode = 'BDT';

export interface Money {
  /** Integer amount in minor units, for example 185000 means 1850.00 BDT. */
  amountMinor: number;
  currency: CurrencyCode;
}

export function money(amountMinor: number, currency: CurrencyCode = 'BDT'): Money {
  return { amountMinor, currency };
}
