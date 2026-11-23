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
  'recovery-detected',
] as const;
export type StaffNotificationKind =
  (typeof STAFF_NOTIFICATION_KINDS)[number];

export const STAFF_NOTIFICATION_KIND_LABELS: Record<
  StaffNotificationKind,
  string
> = {
  'new-order': 'New order',
  'low-stock': 'Low stock',
  'recovery-detected': 'Cart recovery',
};

export interface StaffNotification {
  /** Deterministic key derived from the underlying record, for
   * example 'order:BP-123456' or 'low-stock:<variantId>'. Read
   * state is stored against this key. */
  key: string;
  kind: StaffNotificationKind;
  title: string;
  detail: string;
  /** Admin route the notification points at, when one exists. */
  href: string | null;
  createdAt: string;
  read: boolean;
}
