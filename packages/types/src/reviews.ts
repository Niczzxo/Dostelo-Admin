/**
 * Product reviews and moderation (admin master structure module
 * 16: Reviews & Reputation Management). The migrated storefront
 * has no review submission surface, so in this build reviews are
 * staff-entered (for example from a phone or in-person comment)
 * with the source recorded honestly, and moderation approves or
 * hides them. A 'verified-purchase' source is only recorded when
 * the review is tied to a customer with a delivered order for
 * the product, checked server-side at creation.
 */
export const REVIEW_STATUSES = ['pending', 'approved', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  hidden: 'Hidden',
};

export const REVIEW_SOURCES = ['staff-entered', 'verified-purchase'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const REVIEW_SOURCE_LABELS: Record<ReviewSource, string> = {
  'staff-entered': 'Staff entered',
  'verified-purchase': 'Verified purchase',
};

export interface ProductReview {
  id: string;
  productId: string;
  /** Customer the review is attributed to, when known. */
  customerId: string | null;
  authorName: string;
  /** Star rating, 1 to 5. */
  rating: number;
  title: string | null;
  body: string;
  status: ReviewStatus;
  source: ReviewSource;
  createdAt: string;
  updatedAt: string;
}
