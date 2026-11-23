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
  'cancelled',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
};

export interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  /** Free-text description of who the campaign is for. Audience
   * resolution tooling does not exist yet, so this stays a note. */
  audienceNote: string;
  status: CampaignStatus;
  scheduledFor: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A campaign plus the live send-readiness of its channel. */
export interface CampaignView extends Campaign {
  sending: {
    configured: boolean;
    /** Environment variables the channel provider still needs. */
    missing: string[];
  };
}
