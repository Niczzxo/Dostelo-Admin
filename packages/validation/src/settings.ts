import { z } from 'zod';

/**
 * Store settings update (Website Management). Every field is
 * optional: the service merges the update over the stored
 * settings, so a page can save one section at a time. Delivery
 * fees are integer minor units and take effect in checkout
 * immediately, which is why the bounds stay tight.
 */
const fee = z.number().int().min(0).max(1000000);

export const storeSettingsUpdateSchema = z
  .object({
    storeName: z.string().trim().min(1).max(120).optional(),
    contactEmail: z.string().trim().email().max(160).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    freeDeliveryOffer: z.boolean().optional(),
    returnWindowDays: z.number().int().min(0).max(365).optional(),
    automationLeadEvaluationEnabled: z.boolean().optional(),
    allowCod: z.boolean().optional(),
    storeLive: z.boolean().optional(),
    slaTargets: z
      .object({
        urgent: z.object({ firstResponseHours: z.number().min(0).max(720), resolutionHours: z.number().min(0).max(2160) }),
        high: z.object({ firstResponseHours: z.number().min(0).max(720), resolutionHours: z.number().min(0).max(2160) }),
        normal: z.object({ firstResponseHours: z.number().min(0).max(720), resolutionHours: z.number().min(0).max(2160) }),
        low: z.object({ firstResponseHours: z.number().min(0).max(720), resolutionHours: z.number().min(0).max(2160) }),
      })
      .optional(),
    deliveryFees: z
      .object({
        dhakaCityMinor: fee,
        dhakaSubCityMinor: fee,
        outsideDhakaMinor: fee,
        codFeeMinor: fee,
      })
      .strict()
      .optional(),
    manualInstructions: z
      .object({
        bkash: z.string().trim().max(2000),
        nagad: z.string().trim().max(2000),
        rocket: z.string().trim().max(2000),
        upay: z.string().trim().max(2000),
      })
      .strict()
      .optional(),
  })
  .strict();
export type StoreSettingsUpdate = z.infer<typeof storeSettingsUpdateSchema>;
