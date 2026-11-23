import { z } from 'zod';
import {
  CONTACT_ATTEMPT_RESULTS,
  CONTACT_CHANNELS,
  LEAD_SOURCES,
  LEAD_STATUSES,
} from '@dostelo/types';
import { bdPhoneSchema } from './cart';

/**
 * Lead Management schemas (Phase 5). Manual lead creation is how
 * staff record a submitted contact form or an offline enquiry;
 * contact details are accepted here (and only here, plus checkout)
 * because this is a consented flow: the person provided them.
 */
export const leadCreateSchema = z
  .object({
    visitorId: z.string().trim().min(8).max(100).optional(),
    sessionId: z.string().trim().min(8).max(100).optional(),
    customerId: z.string().min(1).optional(),
    fullName: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(200).optional(),
    phone: bdPhoneSchema.optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine(
    (data) =>
      Boolean(
        data.visitorId || data.customerId || data.email || data.phone,
      ),
    {
      message:
        'A lead needs at least one identifier: visitorId, customerId, email or phone',
    },
  );
export type LeadCreate = z.infer<typeof leadCreateSchema>;

export const leadStatusChangeSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
  })
  .strict();
export type LeadStatusChange = z.infer<typeof leadStatusChangeSchema>;

export const leadAssignSchema = z
  .object({
    /** Admin user id of the sales agent taking the lead. */
    assigneeId: z.string().min(1),
  })
  .strict();
export type LeadAssign = z.infer<typeof leadAssignSchema>;

export const followUpTaskCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    dueAt: z.string().datetime().optional(),
  })
  .strict();
export type FollowUpTaskCreate = z.infer<
  typeof followUpTaskCreateSchema
>;

/**
 * One contact attempt. Recording an attempt is itself the audit
 * trail: channel, purpose and result are all required, and
 * optOut (or a result of 'opted-out') records the lead's opt-out,
 * after which the API refuses further attempts.
 */
export const contactAttemptSchema = z
  .object({
    channel: z.enum(CONTACT_CHANNELS),
    purpose: z.string().trim().min(2).max(300),
    result: z.enum(CONTACT_ATTEMPT_RESULTS),
    note: z.string().trim().max(1000).optional(),
    optOut: z.boolean().optional(),
  })
  .strict();
export type ContactAttemptCreate = z.infer<typeof contactAttemptSchema>;
