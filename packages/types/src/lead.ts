/**
 * Lead Management types (Phase 5), from section 04 of the admin
 * master structure. Leads and customers stay distinct concepts:
 * a lead is a potential buyer with buying intent, a customer is a
 * buyer with an account or an order. A lead converts when its
 * person places an order; the lead record is kept, not merged
 * away, so lead history survives conversion.
 */

/**
 * The lead pipeline from the master structure, in pipeline order:
 * New, Qualified, Contacted, Interested, Follow-up Required,
 * Negotiation, Converted, Lost, Do Not Contact.
 */
export const LEAD_STATUSES = [
  'new',
  'qualified',
  'contacted',
  'interested',
  'follow-up-required',
  'negotiation',
  'converted',
  'lost',
  'do-not-contact',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  qualified: 'Qualified',
  contacted: 'Contacted',
  interested: 'Interested',
  'follow-up-required': 'Follow-up Required',
  negotiation: 'Negotiation',
  converted: 'Converted',
  lost: 'Lost',
  'do-not-contact': 'Do Not Contact',
};

export const LEAD_SOURCES = [
  'buyer-intelligence',
  'guest-checkout',
  'contact-form',
  'manual',
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * Why staff may contact this lead. Contact actions require both
 * provided contact details and a recorded basis:
 * - 'account': the person linked their visitor id by logging in.
 * - 'checkout': the person submitted these details at checkout.
 * - 'contact-form': the person submitted these details on a form.
 * - 'marketing-consent': the visitor granted the marketing
 *   consent scope.
 * A null basis means the lead is not contactable, whatever its
 * score.
 */
export type LeadContactBasis =
  | 'account'
  | 'checkout'
  | 'contact-form'
  | 'marketing-consent';

export interface Lead {
  id: string;
  status: LeadStatus;
  source: LeadSource;
  /** Visitor the lead was raised from, when it came from tracking. */
  visitorId: string | null;
  /** Session that showed the buying intent, when known. */
  sessionId: string | null;
  /** Linked customer, when the person is identified. */
  customerId: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  /** Lead score snapshot from Buyer Intelligence at creation. */
  score: number | null;
  contactBasis: LeadContactBasis | null;
  /** Admin user id of the assigned sales agent, when assigned. */
  assigneeId: string | null;
  /** Set when the lead opts out; contact is refused from then on
   * and the lead is suppressed (status 'do-not-contact'). */
  optedOut: boolean;
  optedOutAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CONTACT_CHANNELS = [
  'phone',
  'whatsapp',
  'email',
  'sms',
] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_ATTEMPT_RESULTS = [
  'answered',
  'no-answer',
  'interested',
  'not-interested',
  'opted-out',
  'other',
] as const;

export type ContactAttemptResult =
  (typeof CONTACT_ATTEMPT_RESULTS)[number];

/**
 * One recorded contact attempt, per the Buyer Intelligence
 * workflow rule: staff member, time, channel, purpose, result and
 * opt-out status are all recorded, and attempts after an opt-out
 * are refused by the API.
 */
export interface LeadContactAttempt {
  id: string;
  leadId: string;
  channel: ContactChannel;
  purpose: string;
  result: ContactAttemptResult;
  note: string | null;
  /** Admin user id of the staff member who made the attempt. */
  staffId: string;
  /** True when this attempt recorded the lead's opt-out. */
  optedOut: boolean;
  createdAt: string;
}

export const FOLLOW_UP_TASK_STATUSES = ['open', 'completed'] as const;

export type FollowUpTaskStatus =
  (typeof FOLLOW_UP_TASK_STATUSES)[number];

export interface FollowUpTask {
  id: string;
  leadId: string;
  title: string;
  dueAt: string | null;
  status: FollowUpTaskStatus;
  /** Admin user id of the staff member who created the task. */
  createdById: string;
  completedAt: string | null;
  createdAt: string;
}
