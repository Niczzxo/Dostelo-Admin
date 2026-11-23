import { z } from 'zod';
import { ORDER_STATUSES } from '@dostelo/types';

/** Requested order status change. Whether the move is legal from the
 * order's current status is a service rule, not a schema rule. */
export const orderStatusTransitionSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
  actorId: z.string().min(1).optional(),
});
export type OrderStatusTransition = z.infer<
  typeof orderStatusTransitionSchema
>;

/** Admin-facing stock adjustment. No authentication in this phase;
 * the endpoint shape is final, the guard arrives with Phase 4. */
export const inventoryAdjustSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((value) => value !== 0, { message: 'delta must not be 0' }),
  reason: z.string().trim().max(300).optional(),
});
export type InventoryAdjust = z.infer<typeof inventoryAdjustSchema>;
