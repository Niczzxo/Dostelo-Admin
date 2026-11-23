import { z } from 'zod';
import { COURIERS } from '@dostelo/types';

/**
 * Shipping schemas (Phase 6, chunk 2). Creating a shipment takes
 * the order number staff quote, the courier to book with, and an
 * optional parcel weight; the recipient, address and COD amount
 * are read from the order server-side and are never accepted
 * from the client.
 */
export const createShipmentSchema = z
  .object({
    orderNumber: z.string().trim().min(1).max(40),
    courier: z.enum(COURIERS),
    /** Parcel weight in kilograms. Defaults server-side when
     * omitted (clothing parcels are light). */
    weightKg: z.number().positive().max(30).optional(),
  })
  .strict();
export type CreateShipment = z.infer<typeof createShipmentSchema>;
