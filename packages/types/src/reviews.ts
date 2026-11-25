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
export const REVIEW_STATUSES = [
  'pending',
  'approved',
  'flagged',
  'rejected',
  'hidden',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  flagged: 'Flagged',
  rejected: 'Rejected',
  hidden: 'Hidden',
};

/** Legal moderation transitions, enforced server-side. */
export const REVIEW_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  pending: ['approved', 'flagged', 'rejected', 'hidden'],
  approved: ['flagged', 'hidden'],
  flagged: ['approved', 'rejected', 'hidden', 'pending'],
  rejected: ['pending'],
  hidden: ['approved', 'pending'],
};

/** One public staff reply on a review. Internal moderation
 * notes are never stored here; they live in the audit log. */
export interface ReviewReply {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

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
  /** True only when the server verified a real purchase (see
   * verificationNote). There is no manual verify toggle. */
  verified: boolean;
  /** Why the review is or is not verified, visible to staff. */
  verificationNote: string | null;
  /** Order the review was checked against, when one was given. */
  orderNumber: string | null;
  /** Reason recorded when a moderator flagged the review. */
  flagReason: string | null;
  /** Public staff replies, oldest first. */
  replies: ReviewReply[];
  createdAt: string;
  updatedAt: string;
}
