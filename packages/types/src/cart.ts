import type { Money } from './money';

export type CartStatus = 'active' | 'converted' | 'abandoned';

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId: string;
  quantity: number;
  /** Unit price snapshot at the time the item was added. */
  unitPrice: Money;
  addedAt: string;
}

export interface Cart {
  id: string;
  /** Null for guest carts that belong to a browser session only. */
  customerId: string | null;
  sessionToken: string | null;
  status: CartStatus;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}
