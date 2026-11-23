import type { Money } from './money';
import type { PaymentStatus } from './payment';

/**
 * The 10 order statuses from the admin master structure
 * (Order Management module), in fulfilment flow order.
 */
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'ready-to-ship',
  'shipped',
  'out-for-delivery',
  'delivered',
  'cancelled',
  'returned',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  'ready-to-ship': 'Ready to Ship',
  shipped: 'Shipped',
  'out-for-delivery': 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export type DeliveryZone = 'dhaka-city' | 'dhaka-sub-city' | 'outside-dhaka';

export const DELIVERY_ZONE_LABELS: Record<DeliveryZone, string> = {
  'dhaka-city': 'Dhaka city',
  'dhaka-sub-city': 'Dhaka sub city',
  'outside-dhaka': 'Outside Dhaka',
};

/** Live storefront delivery fees, in minor units (paisa). */
export const DELIVERY_ZONE_FEE_MINOR: Record<DeliveryZone, number> = {
  'dhaka-city': 7000,
  'dhaka-sub-city': 10000,
  'outside-dhaka': 15000,
};

/** Cash on Delivery handling fee, in minor units (paisa). */
export const COD_FEE_MINOR = 1000;

export interface OrderAddress {
  fullName: string;
  phone: string;
  addressLine: string;
  area: string | null;
  city: string;
  district: string;
  deliveryZone: DeliveryZone;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  /** Product name snapshot, so later renames never rewrite history. */
  productName: string;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  address: OrderAddress;
  items: OrderItem[];
  subtotal: Money;
  deliveryFee: Money;
  codFee: Money;
  discount: Money;
  total: Money;
  /** True when the free delivery first-order offer was applied. */
  firstOrderFreeDelivery: boolean;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}
