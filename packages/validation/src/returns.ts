import { z } from 'zod';
import { RETURN_KINDS } from '@dostelo/types';

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
    reason: z.string().trim().max(500).optional(),
    note: z.string().trim().max(1000).optional(),
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
