import { z } from 'zod';
import {
  CALL_OUTCOMES,
  COMMUNICATION_CHANNELS,
} from '@dostelo/types';
import { bdPhoneSchema } from './cart';

/**
 * Cart Recovery and Communication Center schemas (Phase 6).
 * The sequence settings are staff-edited data; the manual call
 * log is how a call a staff member placed themselves enters the
 * communication log.
 */

export const recoveryStepSchema = z
  .object({
    stepNumber: z.number().int().min(1).max(10),
    /** Wait after the previous step ran (after detection for
     * step 1), in minutes. Zero is allowed so operations can run
     * a step immediately in tests and pilots. */
    delayMinutes: z.number().int().min(0).max(60 * 24 * 30),
    channel: z.enum(COMMUNICATION_CHANNELS),
    templateKey: z.string().trim().min(1).max(80),
  })
  .strict();
export type RecoveryStepInput = z.infer<typeof recoveryStepSchema>;

export const recoverySettingsUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    sequenceEnabled: z.boolean().optional(),
    abandonedAfterMinutes: z.number().int().min(1).max(60 * 24 * 7).optional(),
    tokenTtlDays: z.number().int().min(1).max(365).optional(),
    steps: z.array(recoveryStepSchema).min(1).max(10).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.enabled !== undefined ||
      data.sequenceEnabled !== undefined ||
      data.abandonedAfterMinutes !== undefined ||
      data.tokenTtlDays !== undefined ||
      data.steps !== undefined,
    { message: 'Provide at least one setting to update' },
  );
export type RecoverySettingsUpdate = z.infer<
  typeof recoverySettingsUpdateSchema
>;

/**
 * A call a staff member placed on their own phone, logged after
 * the fact. The phone is required because suppression and the
 * contact record key off it; the outcome 'opted-out' writes a
 * suppression record, exactly as a lead opt-out does.
 */
export const manualCallLogSchema = z
  .object({
    phone: bdPhoneSchema,
    outcome: z.enum(CALL_OUTCOMES),
    notes: z.string().trim().max(1000).optional(),
    customerId: z.string().min(1).optional(),
    leadId: z.string().min(1).optional(),
    abandonedCartId: z.string().min(1).optional(),
  })
  .strict();
export type ManualCallLog = z.infer<typeof manualCallLogSchema>;

/**
 * Staff-edited message template (Communication Center and Cart
 * Recovery). The key comes from the route; the body is validated
 * again in the service, which rejects placeholders outside the
 * known variable set the send flows actually supply.
 */
export const messageTemplateUpsertSchema = z
  .object({
    channel: z.enum(COMMUNICATION_CHANNELS),
    subject: z.string().trim().max(200).nullable().optional(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();
export type MessageTemplateUpsert = z.infer<
  typeof messageTemplateUpsertSchema
>;

/**
 * A staff-initiated message from the Communication Center. The
 * send goes through the same CommunicationsService path as the
 * automated flows: suppression and consent are checked first and
 * an unconfigured provider records not-configured. Either a
 * template or an explicit body is required.
 */
export const staffSendSchema = z
  .object({
    channel: z.enum(['whatsapp', 'email', 'sms']),
    to: z.string().trim().min(3).max(200),
    customerId: z.string().min(1).optional(),
    leadId: z.string().min(1).optional(),
    abandonedCartId: z.string().min(1).optional(),
    templateKey: z.string().trim().min(1).max(80).optional(),
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().min(1).max(4000).optional(),
    purpose: z.string().trim().min(2).max(80),
  })
  .strict()
  .refine((data) => Boolean(data.templateKey || data.body), {
    message: 'Provide a templateKey or an explicit body',
  })
  .refine(
    (data) =>
      data.channel === 'email'
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to)
        : bdPhoneSchema.safeParse(data.to).success,
    { message: 'The address does not match the channel' },
  );
export type StaffSend = z.infer<typeof staffSendSchema>;
