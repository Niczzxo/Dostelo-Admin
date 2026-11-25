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
  'in-progress',
  'pending',
  'waiting-customer',
  'waiting-staff',
  'resolved',
  'closed',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_STATUS_LABELS: Record<
  SupportTicketStatus,
  string
> = {
  open: 'Open',
  'in-progress': 'In Progress',
  pending: 'Pending',
  'waiting-customer': 'Waiting for Customer',
  'waiting-staff': 'Waiting for Staff',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** Legal ticket status transitions, enforced server-side.
 * Closed is terminal; a closed ticket is never reopened by a
 * status change (staff create a new ticket instead). */
export const SUPPORT_TICKET_TRANSITIONS: Record<
  SupportTicketStatus,
  SupportTicketStatus[]
> = {
  open: ['in-progress', 'pending', 'waiting-customer', 'waiting-staff', 'resolved', 'closed'],
  'in-progress': ['pending', 'waiting-customer', 'waiting-staff', 'resolved', 'closed'],
  pending: ['open', 'in-progress', 'waiting-customer', 'waiting-staff', 'resolved', 'closed'],
  'waiting-customer': ['open', 'in-progress', 'waiting-staff', 'resolved', 'closed'],
  'waiting-staff': ['open', 'in-progress', 'waiting-customer', 'resolved', 'closed'],
  resolved: ['open', 'in-progress', 'closed'],
  closed: [],
};

/** How the ticket reached the store, recorded honestly at
 * creation. 'admin' means staff created it in the portal; the
 * other values are the channel the customer actually used. */
export const SUPPORT_CHANNELS = [
  'admin',
  'phone',
  'website',
  'whatsapp',
  'email',
  'messenger',
  'in-person',
] as const;
export type SupportChannel = (typeof SUPPORT_CHANNELS)[number];

export const SUPPORT_CHANNEL_LABELS: Record<SupportChannel, string> = {
  admin: 'Admin created',
  phone: 'Phone',
  website: 'Website form',
  whatsapp: 'WhatsApp',
  email: 'Email',
  messenger: 'Messenger',
  'in-person': 'In person',
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
  /** The channel the ticket actually arrived through. */
  channel: SupportChannel;
  /** When staff first sent a customer-facing reply. */
  firstRespondedAt: string | null;
  /** When the ticket was resolved; cleared if it reopens. */
  resolvedAt: string | null;
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
