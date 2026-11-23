/**
 * Communication Center types (Phase 6): the channels staff and
 * automations can reach a customer on, and the log that records
 * every attempt honestly.
 *
 * Honesty rules, enforced in the communications service:
 * - A log entry is marked 'sent' only when a configured provider
 *   confirms the send. A provider without credentials produces
 *   'not-configured', never a fake 'sent'.
 * - Suppressed contacts (a recorded opt-out) and visitors who
 *   denied marketing consent are refused before any provider is
 *   touched, and the refusal itself is the log entry.
 * - Calls are placed by staff on their own phones. An automated
 *   call step only creates an 'awaiting-staff' call task; the
 *   real call enters the log when staff record it as a manual
 *   call, which is a different kind of entry ('logged').
 */

export const COMMUNICATION_CHANNELS = [
  'whatsapp',
  'email',
  'sms',
  'call',
] as const;

export type CommunicationChannel =
  (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_LOG_STATUSES = [
  /** A configured provider confirmed the send. */
  'sent',
  /** No provider credentials are configured for the channel. */
  'not-configured',
  /** A configured provider attempted the send and it failed. */
  'failed',
  /** Refused before sending: the contact is on the suppression
   * list (a recorded opt-out). */
  'refused-suppressed',
  /** Refused before sending: the visitor denied marketing
   * consent. */
  'refused-consent',
  /** Refused before sending: no address exists for the channel
   * (no phone for WhatsApp/SMS/call, no email for email). */
  'refused-no-contact',
  /** A staff member logged a real call they placed themselves. */
  'logged',
  /** A call task waiting for staff to place the call. */
  'awaiting-staff',
] as const;

export type CommunicationLogStatus =
  (typeof COMMUNICATION_LOG_STATUSES)[number];

/** Outcomes a staff member can record for a call they placed. */
export const CALL_OUTCOMES = [
  'answered',
  'no-answer',
  'busy',
  'wrong-number',
  'requested-callback',
  'opted-out',
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/**
 * One communication attempt, automated or staff-logged. This log
 * is the Communication Center's source of truth: recovery steps,
 * lead follow-ups and support can all point at entries here.
 */
export interface CommunicationLog {
  id: string;
  channel: CommunicationChannel;
  /** 'automated' for provider sends and call tasks, 'manual-call'
   * for calls staff placed and logged themselves. */
  kind: 'automated' | 'manual-call';
  status: CommunicationLogStatus;
  /** Phone number or email address the message was addressed to.
   * Null only when the attempt was refused for having no address. */
  toAddress: string | null;
  customerId: string | null;
  visitorId: string | null;
  leadId: string | null;
  abandonedCartId: string | null;
  /** Template the body was rendered from, when one was used. */
  templateKey: string | null;
  subject: string | null;
  /** The rendered message body, or the call task script, or the
   * staff member's call notes for a manual call. */
  body: string;
  /** Manual calls only: what happened on the call. */
  callOutcome: CallOutcome | null;
  /** Staff member who logged a manual call, when applicable. */
  staffId: string | null;
  /** Provider-side message id, set only on a confirmed send. */
  providerMessageId: string | null;
  /** Human-readable detail: refusal reason, provider error, or
   * the not-configured explanation. */
  detail: string | null;
  createdAt: string;
}

/**
 * A message template. Bodies use {{placeholder}} variables that
 * the communications service substitutes server-side; the rendered
 * text is what lands on the log entry, so what was actually sent
 * is always recoverable from the log.
 */
export interface MessageTemplate {
  key: string;
  channel: CommunicationChannel;
  subject: string | null;
  body: string;
}
