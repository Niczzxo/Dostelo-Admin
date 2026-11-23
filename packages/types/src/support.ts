/**
 * Customer support tickets (admin master structure module 15:
 * Customer Support & Helpdesk). Tickets are staff-created in this
 * build: the migrated storefront's contact view does not submit
 * to the API, so no customer-side intake is claimed. Replies are
 * a log on the ticket; internal notes are staff-only entries in
 * the same log, marked internal.
 */
export const SUPPORT_TICKET_STATUSES = [
  'open',
  'pending',
  'resolved',
  'closed',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_STATUS_LABELS: Record<
  SupportTicketStatus,
  string
> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const SUPPORT_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export interface SupportTicket {
  id: string;
  /** Linked customer record, when staff created the ticket from
   * a customer. Null for a walk-in contact with no record. */
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  subject: string;
  category: string | null;
  priority: SupportPriority;
  status: SupportTicketStatus;
  /** Admin user id the ticket is assigned to, when assigned. */
  assignedToId: string | null;
  /** Order the ticket is about, when it quotes one. */
  orderNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  authorType: 'staff' | 'customer';
  authorId: string | null;
  authorName: string;
  body: string;
  /** Internal notes are staff-only and are never customer replies. */
  internal: boolean;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportTicketMessage[];
}
