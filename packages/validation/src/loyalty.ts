import { z } from 'zod';

/**
 * Loyalty schemas. An adjustment is a signed, non-zero point
 * change with a reason a second staff member can audit later.
 * Rules are the earn rate and the point value.
 */
export const loyaltyAdjustSchema = z
  .object({
    delta: z
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .refine((value) => value !== 0, 'delta must not be zero'),
    reason: z.string().trim().min(1).max(500),
    orderId: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
export type LoyaltyAdjust = z.infer<typeof loyaltyAdjustSchema>;

export const loyaltyRulesSchema = z
  .object({
    takaPerPoint: z.number().int().positive().max(100000),
    pointValueMinor: z.number().int().min(0).max(1000000),
  })
  .strict();
export type LoyaltyRulesUpdate = z.infer<typeof loyaltyRulesSchema>;

export const pointsRuleSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    activity: z.enum([
      'completed-order',
      'registration',
      'verified-review',
      'referral-purchase',
    ]),
    calculation: z.enum(['per-amount', 'fixed', 'one-time']),
    points: z.number().int().min(0).max(100000),
    perAmountTaka: z.number().int().positive().max(1000000).nullable().optional(),
    minOrderMinor: z.number().int().min(0).nullable().optional(),
    maxPointsPerOrder: z.number().int().positive().nullable().optional(),
    active: z.boolean(),
  })
  .strict();
export type PointsRuleUpsert = z.infer<typeof pointsRuleSchema>;
