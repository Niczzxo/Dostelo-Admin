import { z } from 'zod';
import { CAMPAIGN_CHANNELS, CAMPAIGN_STATUSES } from '@dostelo/types';

/**
 * Campaign schemas. Scheduling is a status change plus a future
 * time; the service enforces that a scheduled campaign carries a
 * scheduledFor, and that it lies in the future.
 */
export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    channel: z.enum(CAMPAIGN_CHANNELS),
    audienceNote: z.string().trim().min(1).max(1000),
    scheduledFor: z.string().datetime().optional(),
  })
  .strict();
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    audienceNote: z.string().trim().min(1).max(1000).optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
  })
  .strict();
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;
