/**
 * Marketing campaigns (admin master structure module 13:
 * Marketing & Campaign Management). A campaign is a record: name,
 * channel, audience note and schedule, with draft, scheduled and
 * cancelled states. Sending is not part of the record: a campaign
 * can only be sent when the channel's messaging provider is
 * configured, and the campaign view carries that state, computed
 * from the provider configuration, so an unconfigured channel is
 * never presented as sendable.
 */
export const CAMPAIGN_CHANNELS = ['whatsapp', 'email', 'sms'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  sms: 'SMS',
};

export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'queued',
  'sending',
  'completed',
  'partially-failed',
  'failed',
  'cancelled',
  'archived',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  queued: 'Queued',
  sending: 'Sending',
  completed: 'Completed',
  'partially-failed': 'Partially Failed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

/** Audience segments the portal can pick. Every segment is
 * resolved from stored records at preview time and again at
 * send time; the size shown is always the computed size, never
 * an estimate. */
export const CAMPAIGN_SEGMENTS = [
  'all-customers',
  'registered-customers',
  'previous-buyers',
  'new-customers',
  'wishlist-users',
  'abandoned-cart-customers',
  'high-intent-leads',
  'custom',
] as const;
export type CampaignSegment = (typeof CAMPAIGN_SEGMENTS)[number];

export const CAMPAIGN_SEGMENT_LABELS: Record<CampaignSegment, string> = {
  'all-customers': 'All Customers',
  'registered-customers': 'Registered Customers',
  'previous-buyers': 'Previous Buyers',
  'new-customers': 'New Customers (30 days)',
  'wishlist-users': 'Wishlist Users',
  'abandoned-cart-customers': 'Abandoned Cart Customers',
  'high-intent-leads': 'High-Intent Leads',
  custom: 'Custom Rules',
};

/** Rule-based segment over stored customer fields, for the
 * 'custom' segment key. All present rules must match. */
export interface CampaignSegmentRules {
  minOrders?: number;
  minSpendMinor?: number;
  registeredWithinDays?: number;
  tag?: string;
}

export interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  /** Free-text description of who the campaign is for, kept
   * alongside the resolved segment. */
  audienceNote: string;
  /** The segment the audience resolves from at send time. */
  segmentKey: CampaignSegment;
  /** Rules for the 'custom' segment; null for named segments. */
  segmentRules: CampaignSegmentRules | null;
  /** Message template to render, from the shared template
   * store (the same one Cart Recovery uses). Null when the
   * campaign carries its own subject and body. */
  templateKey: string | null;
  subject: string | null;
  body: string | null;
  status: CampaignStatus;
  scheduledFor: string | null;
  /** When the send executed, and the recorded outcome note
   * (recipient counts by recorded status). */
  sentAt: string | null;
  sendNote: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Delivery statistics for one campaign, aggregated from the
 * communication log entries the send recorded. 'sent' counts
 * only provider-confirmed sends; every other recorded status
 * is reported as it stands, never folded into success. */
export interface CampaignStats {
  campaignId: string;
  recipients: number;
  sent: number;
  notConfigured: number;
  failed: number;
  refused: number;
  failures: {
    toAddress: string | null;
    status: string;
    detail: string | null;
    createdAt: string;
  }[];
}

/** A campaign plus the live send-readiness of its channel. */
export interface CampaignView extends Campaign {
  sending: {
    configured: boolean;
    /** Environment variables the channel provider still needs. */
    missing: string[];
  };
}
