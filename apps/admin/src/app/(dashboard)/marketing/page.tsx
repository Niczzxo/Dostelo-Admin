'use client';

import { useState, type FormEvent } from 'react';
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  type CampaignChannel,
  type CampaignStatus,
  type CampaignView,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Marketing: campaign records with draft and scheduled states.
 * Sending is not faked: each campaign shows the live sending
 * state of its channel, which stays not-configured until the
 * provider credentials exist in the API environment.
 */
export default function MarketingPage() {
  const { session } = useAuth();
  const canEdit =
    session.principal?.permissions.includes('marketing.edit') ?? false;
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CampaignChannel>('whatsapp');
  const [audienceNote, setAudienceNote] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const campaigns = useData(
    (client) => client.listCampaigns(status ? { status } : undefined),
    [status],
  );

  async function createCampaign(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.createCampaign({
        name: name.trim(),
        channel,
        audienceNote: audienceNote.trim(),
        scheduledFor: scheduledFor
          ? new Date(scheduledFor).toISOString()
          : undefined,
      });
      setName('');
      setAudienceNote('');
      setScheduledFor('');
      campaigns.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setFormError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(
    campaign: CampaignView,
    next: CampaignStatus,
  ): Promise<void> {
    setRowError(null);
    try {
      await api.updateCampaign(campaign.id, { status: next });
      campaigns.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setRowError(uiError.message);
    }
  }

  return (
    <section>
      <PageHeader title="Marketing" />
      <p className="note muted" style={{ marginTop: 0, maxWidth: 760 }}>
        Campaigns are planned and scheduled here. Actual sending runs
        through the WhatsApp, email and SMS providers, and a campaign
        whose channel is not configured cannot send: the sending state
        on each row is read live from the API and is never assumed.
      </p>
      <div className="toolbar">
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as CampaignStatus | '')
            }
          >
            <option value="">All statuses</option>
            {CAMPAIGN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CAMPAIGN_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {campaigns.loading ? (
        <LoadingNote label="Loading campaigns..." />
      ) : null}
      {campaigns.error ? (
        <ErrorNote error={campaigns.error} onRetry={campaigns.reload} />
      ) : null}
      {campaigns.data && campaigns.data.items.length === 0 ? (
        <EmptyNote>No campaigns recorded yet.</EmptyNote>
      ) : null}
      {rowError ? (
        <p className="form-error" role="alert">
          {rowError}
        </p>
      ) : null}
      {campaigns.data && campaigns.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Channel</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Scheduled for</th>
                <th>Sending</th>
                {canEdit ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {campaigns.data.items.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.name}</td>
                  <td>{CAMPAIGN_CHANNEL_LABELS[campaign.channel]}</td>
                  <td>{campaign.audienceNote}</td>
                  <td>
                    <Badge>
                      {CAMPAIGN_STATUS_LABELS[campaign.status]}
                    </Badge>
                  </td>
                  <td>
                    {campaign.scheduledFor
                      ? formatDateTime(campaign.scheduledFor)
                      : 'Not scheduled'}
                  </td>
                  <td>
                    {campaign.sending.configured ? (
                      <Badge>Provider configured</Badge>
                    ) : (
                      <span className="muted">
                        Not configured (missing{' '}
                        {campaign.sending.missing.join(', ')})
                      </span>
                    )}
                  </td>
                  {canEdit ? (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {campaign.status === 'draft' ? (
                          <button
                            type="button"
                            className="btn btn-small btn-secondary"
                            onClick={() =>
                              void changeStatus(campaign, 'scheduled')
                            }
                          >
                            Schedule
                          </button>
                        ) : null}
                        {campaign.status !== 'cancelled' ? (
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() =>
                              void changeStatus(campaign, 'cancelled')
                            }
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {canEdit ? (
        <div className="card" style={{ marginTop: 20, maxWidth: 760 }}>
          <h2 style={{ fontSize: 17, marginTop: 0 }}>New campaign</h2>
          <form onSubmit={createCampaign}>
            <label className="field">
              Name
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Eid offer announcement"
                required
              />
            </label>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <label className="field">
                Channel
                <select
                  className="select"
                  value={channel}
                  onChange={(event) =>
                    setChannel(event.target.value as CampaignChannel)
                  }
                >
                  {CAMPAIGN_CHANNELS.map((value) => (
                    <option key={value} value={value}>
                      {CAMPAIGN_CHANNEL_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Schedule for (optional)
                <input
                  className="input"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </label>
            </div>
            <label className="field" style={{ marginTop: 10 }}>
              Audience note
              <input
                className="input"
                value={audienceNote}
                onChange={(event) => setAudienceNote(event.target.value)}
                placeholder="Who this campaign is for"
                required
              />
            </label>
            <button
              type="submit"
              className="btn btn-small"
              disabled={busy}
              style={{ marginTop: 12 }}
            >
              {busy ? 'Saving...' : 'Create campaign'}
            </button>
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
          </form>
        </div>
      ) : (
        <p className="note muted" style={{ marginTop: 20 }}>
          Your role can view campaigns but cannot create or change them
          (the marketing.edit permission is required).
        </p>
      )}
    </section>
  );
}
