import { z } from 'zod';
import {
  INSPECTION_OUTCOMES,
  RETURN_KINDS,
  RETURN_REASONS,
  RETURN_RESOLUTION_TYPES,
} from '@dostelo/types';

/**
 * Returns schemas. Creating a request quotes the order number
 * and the order's own line ids with quantities; the service
 * snapshots names and prices from the order, so the client never
 * supplies them.
 */
export const createReturnSchema = z
  .object({
    orderNumber: z.string().trim().min(1).max(40),
    kind: z.enum(RETURN_KINDS),
    reason: z.enum(RETURN_REASONS).optional(),
    note: z.string().trim().max(1000).optional(),
    resolutionType: z.enum(RETURN_RESOLUTION_TYPES).optional(),
    condition: z.string().trim().max(200).optional(),
    items: z
      .array(
        z
          .object({
            orderItemId: z.string().trim().min(1).max(80),
            quantity: z.number().int().positive().max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type CreateReturn = z.infer<typeof createReturnSchema>;

/** A staff note action on a return (request more information). */
export const returnNoteSchema = z
  .object({ note: z.string().trim().min(1).max(1000) })
  .strict();
export type ReturnNote = z.infer<typeof returnNoteSchema>;

/** Assigning the staff member who will inspect the goods. */
export const returnAssignSchema = z
  .object({ assigneeId: z.string().trim().min(1).max(80) })
  .strict();
export type ReturnAssign = z.infer<typeof returnAssignSchema>;

/** Scheduling a pickup. This records the schedule only; no
 * courier pickup is booked by it. */
export const returnPickupSchema = z
  .object({ pickupAt: z.string().datetime() })
  .strict();
export type ReturnPickup = z.infer<typeof returnPickupSchema>;

/** Completing the inspection of the received goods. Only the
 * resellable outcome restocks, and only up to the quantity
 * actually received. */
export const returnInspectionSchema = z
  .object({
    condition: z.string().trim().min(1).max(200),
    packaging: z.string().trim().max(200).optional(),
    accessories: z.string().trim().max(200).optional(),
    quantityReceived: z.number().int().min(0).max(1000),
    outcome: z.enum(INSPECTION_OUTCOMES),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();
export type ReturnInspectionInput = z.infer<
  typeof returnInspectionSchema
>;
