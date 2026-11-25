import { z } from 'zod';
import { REVIEW_STATUSES } from '@dostelo/types';

/**
 * Review schemas. Staff enter reviews with the reviewer name as
 * given; the source starts as staff-entered and the service
 * upgrades it to verified-purchase only when the named customer
 * has a delivered order containing the product.
 */
export const createReviewSchema = z
  .object({
    productId: z.string().trim().min(1).max(80),
    customerId: z.string().trim().min(1).max(80).optional(),
    orderNumber: z.string().trim().min(1).max(40).optional(),
    authorName: z.string().trim().min(1).max(120),
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(160).optional(),
    body: z.string().trim().min(1).max(3000),
  })
  .strict();
export type CreateReview = z.infer<typeof createReviewSchema>;

export const reviewStatusSchema = z
  .object({
    status: z.enum(REVIEW_STATUSES),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();
export type ReviewStatusUpdate = z.infer<typeof reviewStatusSchema>;

export const reviewReplySchema = z
  .object({
    body: z.string().trim().min(1).max(3000),
  })
  .strict();
export type ReviewReplyCreate = z.infer<typeof reviewReplySchema>;

export const reviewRequestSchema = z
  .object({
    customerId: z.string().trim().min(1).max(80),
    productId: z.string().trim().min(1).max(80).optional(),
    channel: z.enum(['whatsapp', 'email']),
  })
  .strict();
export type ReviewRequestCreate = z.infer<typeof reviewRequestSchema>;
