/**
 * Staff notifications (admin master structure module 20:
 * Notification Management). The feed is derived at read time
 * from real platform events: new orders awaiting fulfilment,
 * low and out-of-stock variants, and abandoned cart detections.
 * The only stored state is which notification keys a staff
 * member has marked read.
 */
export const STAFF_NOTIFICATION_KINDS = [
  'new-order',
  'low-stock',
  'out-of-stock',
  'recovery-detected',
  'payment-failed',
  'lead-high-intent',
  'support-ticket',
  'automation-failed',
] as const;
export type StaffNotificationKind =
  (typeof STAFF_NOTIFICATION_KINDS)[number];

export const STAFF_NOTIFICATION_KIND_LABELS: Record<
  StaffNotificationKind,
  string
> = {
  'new-order': 'New order',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
  'recovery-detected': 'Cart recovery',
  'payment-failed': 'Payment failed',
  'lead-high-intent': 'High-intent lead',
  'support-ticket': 'Support ticket',
  'automation-failed': 'Automation failed',
};

/** Feed categories (Notifications redesign). Every kind belongs
 * to exactly one category, and the page's counts are computed
 * over the same classified feed it displays. */
export const NOTIFICATION_CATEGORIES = [
  'inventory',
  'orders',
  'customers',
  'marketing',
  'system',
] as const;
export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  string
> = {
  inventory: 'Inventory',
  orders: 'Orders',
  customers: 'Customers',
  marketing: 'Marketing',
  system: 'System',
};

export const NOTIFICATION_KIND_CATEGORY: Record<
  StaffNotificationKind,
  NotificationCategory
> = {
  'new-order': 'orders',
  'low-stock': 'inventory',
  'out-of-stock': 'inventory',
  'recovery-detected': 'marketing',
  'payment-failed': 'orders',
  'lead-high-intent': 'customers',
  'support-ticket': 'customers',
  'automation-failed': 'system',
};

/**
 * Per-admin notification preferences, stored server-side.
 * Categories not listed do not arrive in that admin's feed.
 * emailEnabled records the preference only: email delivery
 * itself stays not-configured until a provider exists.
 */
export interface NotificationPreference {
  adminUserId: string;
  categories: NotificationCategory[];
  emailEnabled: boolean;
}

export interface StaffNotification {
  /** Deterministic key derived from the underlying record, for
   * example 'order:BP-123456' or 'low-stock:<variantId>'. Read
   * state is stored against this key. */
  key: string;
  kind: StaffNotificationKind;
  category: NotificationCategory;
  /** Product the notification concerns, for its thumbnail. */
  productId: string | null;
  title: string;
  detail: string;
  /** Admin route the notification points at, when one exists. */
  href: string | null;
  createdAt: string;
  read: boolean;
}
