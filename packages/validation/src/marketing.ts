import { z } from 'zod';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_SEGMENTS,
  CAMPAIGN_STATUSES,
} from '@dostelo/types';

/**
 * Campaign schemas. Scheduling is a status change plus a future
 * time; the service enforces that a scheduled campaign carries a
 * scheduledFor, and that it lies in the future. A campaign
 * carries either a template key from the shared template store
 * or its own subject and body; the service checks the content
 * matches the channel at send time, through the same rendering
 * path as every other send.
 */
const segmentRulesSchema = z
  .object({
    minOrders: z.number().int().min(0).max(100000).optional(),
    minSpendMinor: z.number().int().min(0).max(100_000_000).optional(),
    registeredWithinDays: z.number().int().min(1).max(3650).optional(),
    tag: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    channel: z.enum(CAMPAIGN_CHANNELS),
    audienceNote: z.string().trim().min(1).max(1000),
    segmentKey: z.enum(CAMPAIGN_SEGMENTS).optional(),
    segmentRules: segmentRulesSchema.nullable().optional(),
    templateKey: z.string().trim().min(1).max(80).nullable().optional(),
    subject: z.string().trim().max(200).nullable().optional(),
    body: z.string().trim().min(1).max(4000).nullable().optional(),
    scheduledFor: z.string().datetime().optional(),
  })
  .strict();
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    audienceNote: z.string().trim().min(1).max(1000).optional(),
    segmentKey: z.enum(CAMPAIGN_SEGMENTS).optional(),
    segmentRules: segmentRulesSchema.nullable().optional(),
    templateKey: z.string().trim().min(1).max(80).nullable().optional(),
    subject: z.string().trim().max(200).nullable().optional(),
    body: z.string().trim().min(1).max(4000).nullable().optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    scheduledFor: z.string().datetime().nullable().optional(),
  })
  .strict();
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;
