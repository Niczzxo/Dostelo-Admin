import type { Cart, CartItem } from './cart';
import type { Money } from './money';
import type { DeliveryZone } from './order';
import type { PaymentGateway } from './payment';

/** A cart line with its computed line total, as the API returns it. */
export interface CartLineView extends CartItem {
  productName: string;
  variantName: string;
  lineTotal: Money;
}

/** A cart with computed line totals and subtotal, as the API returns it. */
export interface CartView extends Omit<Cart, 'items'> {
  items: CartLineView[];
  subtotal: Money;
}

export interface CheckoutQuoteLine {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}

/**
 * A server-computed checkout quote. The client never supplies prices
 * or totals; it renders what this returns. All amounts are integer
 * minor units (paisa) in BDT.
 */
export interface CheckoutQuote {
  zone: DeliveryZone | null;
  zoneLabel: string | null;
  paymentMethod: PaymentGateway;
  lines: CheckoutQuoteLine[];
  subtotal: Money;
  deliveryFee: Money;
  codFee: Money;
  discount: Money;
  total: Money;
  /** True when the delivery fee was waived for this order. */
  freeDelivery: boolean;
  /** Why delivery is free: the first-order offer, the admin offer
   * switch, or null when delivery is charged. */
  freeDeliveryReason: 'first-order' | 'admin-offer' | null;
  /** True specifically when the first-order offer applied, matching
   * the flag recorded on the placed order. */
  firstOrderFreeDelivery: boolean;
}
