import { z } from 'zod';
import {
  SUPPORT_CHANNELS,
  SUPPORT_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
} from '@dostelo/types';

/**
 * Support ticket schemas. Tickets are staff-created; the opening
 * message is required so a ticket never exists without the
 * customer's words recorded.
 */
export const createSupportTicketSchema = z
  .object({
    customerId: z.string().trim().min(1).max(80).optional(),
    customerName: z.string().trim().min(1).max(120),
    customerPhone: z.string().trim().min(1).max(40),
    customerEmail: z.string().trim().email().max(160).optional(),
    subject: z.string().trim().min(1).max(200),
    category: z.string().trim().max(80).optional(),
    priority: z.enum(SUPPORT_PRIORITIES).optional(),
    channel: z.enum(SUPPORT_CHANNELS).optional(),
    orderNumber: z.string().trim().max(40).optional(),
    message: z.string().trim().min(1).max(5000),
  })
  .strict();
export type CreateSupportTicket = z.infer<typeof createSupportTicketSchema>;

export const supportTicketReplySchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    internal: z.boolean().optional(),
  })
  .strict();
export type SupportTicketReply = z.infer<typeof supportTicketReplySchema>;

export const supportTicketStatusSchema = z
  .object({
    status: z.enum(SUPPORT_TICKET_STATUSES),
  })
  .strict();
export type SupportTicketStatusUpdate = z.infer<
  typeof supportTicketStatusSchema
>;

export const supportTicketAssignSchema = z
  .object({
    /** Null unassigns the ticket. */
    assignedToId: z.string().trim().min(1).max(80).nullable(),
  })
  .strict();
export type SupportTicketAssign = z.infer<typeof supportTicketAssignSchema>;
