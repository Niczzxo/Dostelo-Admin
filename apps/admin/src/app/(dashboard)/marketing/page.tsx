'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CalendarClock,
  Eye,
  Megaphone,
  Pencil,
  Copy,
  Send,
  Settings2,
  TrendingUp,
  Users,
  XCircle,
  Archive,
  BarChart3,
  Plus,
} from 'lucide-react';
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_SEGMENT_LABELS,
  CAMPAIGN_SEGMENTS,
  CAMPAIGN_STATUS_LABELS,
  type CampaignChannel,
  type CampaignSegment,
  type CampaignSegmentRules,
  type CampaignStats,
  type CampaignView,
  type IntegrationStatus,
} from '@dostelo/types';
import type {
  CampaignSegmentSize,
  MessageTemplateView,
} from '@dostelo/api-client';
import { api, formatDateTime, formatMinor, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import { AreaChart } from '../../../components/charts';
import {
  Badge,
  CardHead,
  Drawer,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  Pagination,
  StatusTabs,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const PAGE_SIZE = 10;

type TabKey = 'all' | CampaignChannel;

function variablesOf(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

/** Preview with sample values, labelled as samples. Real values
 * are substituted by the API at send time. */
function samplePreview(text: string): string {
  return text.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_whole, name: string) => `[sample ${name}]`,
  );
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function rulesSummary(rules: CampaignSegmentRules | null): string {
  if (!rules) return 'No custom rules';
  const parts: string[] = [];
  if (rules.minOrders !== undefined) parts.push(`at least ${rules.minOrders} orders`);
  if (rules.minSpendMinor !== undefined)
    parts.push(`spend at least ${formatMinor(rules.minSpendMinor)}`);
  if (rules.registeredWithinDays !== undefined)
    parts.push(`registered within ${rules.registeredWithinDays} days`);
  if (rules.tag) parts.push(`tag: ${rules.tag}`);
  return parts.length > 0 ? parts.join(', ') : 'No custom rules set';
}

function integrationFor(
  integrations: IntegrationStatus[],
  channel: CampaignChannel,
): IntegrationStatus | undefined {
  return integrations.find(
    (item) => item.category === 'communications' && item.key === channel,
  );
}

/* Channel Settings modal ------------------------------------------- */

function ChannelSettingsModal({
  integrations,
  loading,
  error,
  onRetry,
  onClose,
}: {
  integrations: IntegrationStatus[];
  loading: boolean;
  error: Parameters<typeof ErrorNote>[0]['error'] | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const comms = integrations.filter((item) => item.category === 'communications');
  return (
    <Modal title="Channel Settings" onClose={onClose}>
      <p className="note muted" style={{ marginTop: 0 }}>
        Provider status is read from the API configuration checks.
        Credentials are never entered here: they are set as
        environment variables on the API host, and only the names of
        missing variables are reported.
      </p>
      {loading ? <LoadingNote label="Loading channel status..." /> : null}
      {error ? <ErrorNote error={error} onRetry={onRetry} /> : null}
      {!loading && !error && comms.length === 0 ? (
        <EmptyNote>No communication integrations are registered.</EmptyNote>
      ) : null}
      {comms.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Status</th>
                <th>Missing variables</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {comms.map((item) => (
                <tr key={item.key}>
                  <td>{item.name}</td>
                  <td>
                    <Badge>{item.configured ? 'Configured' : 'Not configured'}</Badge>
                  </td>
                  <td>{item.missing.length > 0 ? item.missing.join(', ') : 'None'}</td>
                  <td>{item.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Modal>
  );
}

/* Audience Segments modal ------------------------------------------ */

function SegmentsModal({ onClose }: { onClose: () => void }) {
  const [channel, setChannel] = useState<CampaignChannel>('whatsapp');
  const segments = useData(
    (client) => client.listCampaignSegments(channel),
    [channel],
  );
  return (
    <Modal title="Audience Segments" onClose={onClose}>
      <p className="note muted" style={{ marginTop: 0 }}>
        Sizes are computed by the API from stored records for the
        selected channel at the moment this list is loaded. The
        audience is resolved again at send time, so the size at
        sending can differ.
      </p>
      <label className="field">
        Channel
        <select
          className="select"
          value={channel}
          onChange={(event) => setChannel(event.target.value as CampaignChannel)}
        >
          {CAMPAIGN_CHANNELS.map((value) => (
            <option key={value} value={value}>
              {CAMPAIGN_CHANNEL_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      {segments.loading ? <LoadingNote label="Loading segments..." /> : null}
      {segments.error ? (
        <ErrorNote error={segments.error} onRetry={segments.reload} />
      ) : null}
      {segments.data && segments.data.items.length === 0 ? (
        <EmptyNote>No segments are available for this channel.</EmptyNote>
      ) : null}
      {segments.data && segments.data.items.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Segment</th>
                <th className="num">Computed size</th>
              </tr>
            </thead>
            <tbody>
              {segments.data.items.map((item: CampaignSegmentSize) => (
                <tr key={item.key}>
                  <td>{CAMPAIGN_SEGMENT_LABELS[item.key]}</td>
                  <td className="num">{item.size.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="note muted">
        Custom rule sets are not listed here: the API cannot size a
        custom rule set before a campaign using it exists.
      </p>
    </Modal>
  );
}

/* Create Campaign wizard ------------------------------------------- */

function CampaignWizard({
  templates,
  integrations,
  onClose,
  onDone,
}: {
  templates: MessageTemplateView[];
  integrations: IntegrationStatus[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CampaignChannel>('whatsapp');
  const [scheduledFor, setScheduledFor] = useState('');
  const [segmentKey, setSegmentKey] = useState<CampaignSegment>('all-customers');
  const [audienceNote, setAudienceNote] = useState('');
  const [minOrders, setMinOrders] = useState('');
  const [minSpend, setMinSpend] = useState('');
  const [registeredWithinDays, setRegisteredWithinDays] = useState('');
  const [tag, setTag] = useState('');
  const [mode, setMode] = useState<'template' | 'custom'>('template');
  const [templateKey, setTemplateKey] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ campaign: CampaignView; stats: CampaignStats | null } | null>(null);

  const segments = useData(
    (client) => client.listCampaignSegments(channel),
    [channel],
  );
  const segmentSize =
    segments.data?.items.find((item) => item.key === segmentKey)?.size ?? null;
  const channelTemplates = templates.filter((item) => item.channel === channel);
  const selectedTemplate = channelTemplates.find((item) => item.key === templateKey) ?? null;
  const templateVariables = selectedTemplate
    ? [...variablesOf(selectedTemplate.subject), ...variablesOf(selectedTemplate.body)]
    : [];
  const integration = integrationFor(integrations, channel);

  function buildRules(): CampaignSegmentRules | null {
    if (segmentKey !== 'custom') return null;
    const rules: CampaignSegmentRules = {};
    if (minOrders.trim()) rules.minOrders = Number(minOrders);
    if (minSpend.trim()) rules.minSpendMinor = Math.round(Number(minSpend) * 100);
    if (registeredWithinDays.trim())
      rules.registeredWithinDays = Number(registeredWithinDays);
    if (tag.trim()) rules.tag = tag.trim();
    return rules;
  }

  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const campaign = await api.createCampaign({
        name: name.trim(),
        channel,
        audienceNote:
          audienceNote.trim() || CAMPAIGN_SEGMENT_LABELS[segmentKey],
        segmentKey,
        segmentRules: buildRules(),
        templateKey: mode === 'template' ? templateKey || null : null,
        subject: mode === 'custom' && channel === 'email' ? subject.trim() || null : null,
        body: mode === 'custom' ? body.trim() || null : null,
        scheduledFor: scheduledFor
          ? new Date(scheduledFor).toISOString()
          : undefined,
      });
      let stats: CampaignStats | null = null;
      if (segmentKey === 'custom') {
        try {
          stats = await api.getCampaignStats(campaign.id);
        } catch {
          stats = null;
        }
      }
      setSaved({ campaign, stats });
      onDone();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Drawer title="Campaign saved" onClose={onClose}>
        <p>
          <strong>{saved.campaign.name}</strong> was saved as a draft
          ({CAMPAIGN_STATUS_LABELS[saved.campaign.status]}).
        </p>
        {segmentKey === 'custom' ? (
          <p className="note muted">
            Custom rule sets cannot be sized before the campaign
            exists. Recorded recipients for this draft so far:{' '}
            {saved.stats
              ? saved.stats.recipients
              : 'unavailable (stats could not be loaded)'}
            . That count comes from getCampaignStats and reflects
            recorded send attempts only; the audience itself is
            re-resolved from the rules at send time.
          </p>
        ) : (
          <p className="note muted">
            Audience size at creation: the segment list showed{' '}
            {segmentSize !== null ? segmentSize.toLocaleString('en-US') : 'an unavailable size'}{' '}
            recipients for this channel. The audience is re-resolved
            at send time.
          </p>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      </Drawer>
    );
  }

  return (
    <Drawer title="Create Campaign" onClose={onClose}>
      <div className="step-row" style={{ marginBottom: 16 }}>
        {['Basics', 'Audience', 'Message', 'Review'].map((label, index) => (
          <span key={label} style={{ display: 'inline-flex', gap: 7, alignItems: 'center', marginRight: 14 }}>
            <span className="step-num">{index + 1}</span>
            <span className={step === index + 1 ? '' : 'muted'}>{label}</span>
          </span>
        ))}
      </div>
      <form onSubmit={create}>
        {step === 1 ? (
          <div>
            <label className="field">
              Campaign name
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Eid offer announcement"
                required
              />
            </label>
            <label className="field">
              Channel
              <select
                className="select"
                value={channel}
                onChange={(event) => {
                  setChannel(event.target.value as CampaignChannel);
                  setTemplateKey('');
                }}
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
            <p className="note muted">
              The campaign is always saved as a draft. A schedule, when
              set, is stored on the draft.
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <label className="field">
              Audience segment
              <select
                className="select"
                value={segmentKey}
                onChange={(event) => setSegmentKey(event.target.value as CampaignSegment)}
              >
                {CAMPAIGN_SEGMENTS.map((value) => (
                  <option key={value} value={value}>
                    {CAMPAIGN_SEGMENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            {segments.loading ? <LoadingNote label="Loading segment sizes..." /> : null}
            {segments.error ? (
              <ErrorNote error={segments.error} onRetry={segments.reload} />
            ) : null}
            {segmentKey !== 'custom' && !segments.loading ? (
              <p className="note muted">
                Computed size for {CAMPAIGN_CHANNEL_LABELS[channel]}:{' '}
                {segmentSize !== null
                  ? `${segmentSize.toLocaleString('en-US')} recipients`
                  : 'unavailable for this segment'}
              </p>
            ) : null}
            {segmentKey === 'custom' ? (
              <div>
                <p className="note muted">
                  Custom rules use only the fields the API accepts.
                  All rules present must match. The API cannot size a
                  custom rule set before the campaign is saved, so no
                  size is shown here: save the draft first, and the
                  saved campaign detail shows its recorded recipient
                  counts from getCampaignStats.
                </p>
                <label className="field">
                  Minimum orders (optional)
                  <input className="input" type="number" min={0} value={minOrders} onChange={(event) => setMinOrders(event.target.value)} />
                </label>
                <label className="field">
                  Minimum total spend, BDT (optional)
                  <input className="input" type="number" min={0} step="0.01" value={minSpend} onChange={(event) => setMinSpend(event.target.value)} />
                </label>
                <label className="field">
                  Registered within days (optional)
                  <input className="input" type="number" min={1} value={registeredWithinDays} onChange={(event) => setRegisteredWithinDays(event.target.value)} />
                </label>
                <label className="field">
                  Tag (optional)
                  <input className="input" value={tag} onChange={(event) => setTag(event.target.value)} />
                </label>
              </div>
            ) : null}
            <label className="field">
              Audience note
              <input
                className="input"
                value={audienceNote}
                onChange={(event) => setAudienceNote(event.target.value)}
                placeholder={CAMPAIGN_SEGMENT_LABELS[segmentKey]}
              />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <div className="action-tabs" style={{ marginBottom: 12 }}>
              <button type="button" className={`action-tab${mode === 'template' ? ' active' : ''}`} onClick={() => setMode('template')}>
                Use a template
              </button>
              <button type="button" className={`action-tab${mode === 'custom' ? ' active' : ''}`} onClick={() => setMode('custom')}>
                Write message
              </button>
            </div>
            {mode === 'template' ? (
              <div>
                <label className="field">
                  Template for {CAMPAIGN_CHANNEL_LABELS[channel]}
                  <select
                    className="select"
                    value={templateKey}
                    onChange={(event) => setTemplateKey(event.target.value)}
                  >
                    <option value="">Select a template</option>
                    {channelTemplates.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.key}
                      </option>
                    ))}
                  </select>
                </label>
                {channelTemplates.length === 0 ? (
                  <EmptyNote>No templates exist for this channel.</EmptyNote>
                ) : null}
                {selectedTemplate ? (
                  <div>
                    {templateVariables.length > 0 ? (
                      <p className="note muted">
                        Variables: {templateVariables.join(', ')}
                      </p>
                    ) : null}
                    {selectedTemplate.subject ? (
                      <p>
                        <strong>Subject:</strong> {samplePreview(selectedTemplate.subject)}
                      </p>
                    ) : null}
                    <div className={channel === 'email' ? 'preview-email' : 'preview-bubble'}>
                      {samplePreview(selectedTemplate.body)}
                    </div>
                    <p className="note muted">
                      Preview uses sample values, labelled as samples
                      in brackets. Real values are substituted by the
                      API at send time.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                {channel === 'email' ? (
                  <label className="field">
                    Subject
                    <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} required={mode === 'custom'} />
                  </label>
                ) : null}
                <label className="field">
                  Message body
                  <textarea className="input" rows={5} value={body} onChange={(event) => setBody(event.target.value)} required={mode === 'custom'} />
                </label>
                <p className="char-count">{body.length} characters</p>
                {channel === 'sms' ? (
                  <p className="note muted">
                    Character count is shown as typed. Segment billing
                    by the SMS provider is not tracked here.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <dl className="kv">
              <dt>Name</dt>
              <dd>{name || 'Not set'}</dd>
              <dt>Channel</dt>
              <dd>{CAMPAIGN_CHANNEL_LABELS[channel]}</dd>
              <dt>Channel configuration</dt>
              <dd>
                {integration
                  ? integration.configured
                    ? 'Configured'
                    : `Not configured (missing ${integration.missing.join(', ') || 'unknown variables'})`
                  : 'Status unavailable'}
              </dd>
              <dt>Audience</dt>
              <dd>
                {CAMPAIGN_SEGMENT_LABELS[segmentKey]}
                {segmentKey === 'custom'
                  ? `: ${rulesSummary(buildRules())}. Size cannot be previewed before save.`
                  : segmentSize !== null
                    ? `: ${segmentSize.toLocaleString('en-US')} recipients (computed now, re-resolved at send)`
                    : ': size unavailable'}
              </dd>
              <dt>Schedule</dt>
              <dd>{scheduledFor ? formatDateTime(new Date(scheduledFor).toISOString()) : 'Not scheduled'}</dd>
              <dt>Message</dt>
              <dd>
                {mode === 'template'
                  ? templateKey
                    ? `Template: ${templateKey}`
                    : 'No template selected'
                  : channel === 'email'
                    ? `Subject: ${subject || 'Not set'}`
                    : `${body.length} characters`}
              </dd>
            </dl>
            <p className="note muted">
              Consent validation: the sending engine revalidates every
              recipient at send time. Recipients who are suppressed,
              who denied marketing consent, or who have no address for
              this channel are refused per recipient and the refusal is
              recorded; they are never counted as sent.
            </p>
            {integration && !integration.configured ? (
              <p className="note muted">
                This channel is not configured, so a send attempt will
                record not-configured per recipient rather than sending.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">{error}</p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {step > 1 ? (
            <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : null}
          {step < 4 ? (
            <button
              type="button"
              className="btn"
              disabled={step === 1 && !name.trim()}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </button>
          ) : (
            <button type="submit" className="btn" disabled={busy || !name.trim()}>
              {busy ? 'Saving...' : 'Save draft campaign'}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Drawer>
  );
}

/* Campaign detail drawer ------------------------------------------- */

function CampaignDetailDrawer({
  campaign,
  template,
  onClose,
}: {
  campaign: CampaignView;
  template: MessageTemplateView | null;
  onClose: () => void;
}) {
  const stats = useData(
    (client) => client.getCampaignStats(campaign.id),
    [campaign.id],
  );
  const data = stats.data;
  return (
    <Drawer title={campaign.name} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <CardHead title="Campaign" />
          <dl className="kv">
            <dt>Status</dt>
            <dd><Badge>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge></dd>
            <dt>Channel</dt>
            <dd>{CAMPAIGN_CHANNEL_LABELS[campaign.channel]}</dd>
            <dt>Channel sending</dt>
            <dd>
              {campaign.sending.configured
                ? 'Provider configured'
                : `Not configured (missing ${campaign.sending.missing.join(', ')})`}
            </dd>
            <dt>Audience note</dt>
            <dd>{campaign.audienceNote}</dd>
          </dl>
        </div>
        <div>
          <CardHead title="Audience" />
          <dl className="kv">
            <dt>Segment</dt>
            <dd>{CAMPAIGN_SEGMENT_LABELS[campaign.segmentKey]}</dd>
            {campaign.segmentKey === 'custom' ? (
              <>
                <dt>Rules</dt>
                <dd>{rulesSummary(campaign.segmentRules)}</dd>
              </>
            ) : null}
            <dt>Recorded recipients</dt>
            <dd>
              {stats.loading
                ? 'Loading...'
                : data
                  ? data.recipients.toLocaleString('en-US')
                  : 'Unavailable'}
            </dd>
          </dl>
          <p className="note muted">
            The audience is resolved from stored records when a send
            runs. Recorded recipients above counts only recipients
            with a recorded send attempt.
          </p>
        </div>
        <div>
          <CardHead title="Message" />
          {campaign.templateKey ? (
            <div>
              <p className="note muted" style={{ marginTop: 0 }}>
                Template: {campaign.templateKey}
              </p>
              {template?.subject ? (
                <p><strong>Subject:</strong> {samplePreview(template.subject)}</p>
              ) : null}
              {template ? (
                <>
                  <div className={campaign.channel === 'email' ? 'preview-email' : 'preview-bubble'}>
                    {samplePreview(template.body)}
                  </div>
                  <p className="note muted">
                    Preview uses sample values, labelled as samples.
                  </p>
                </>
              ) : (
                <p className="note muted">Template content could not be loaded.</p>
              )}
            </div>
          ) : (
            <div>
              {campaign.subject ? (
                <p><strong>Subject:</strong> {campaign.subject}</p>
              ) : null}
              {campaign.body ? (
                <div className={campaign.channel === 'email' ? 'preview-email' : 'preview-bubble'}>
                  {campaign.body}
                </div>
              ) : (
                <p className="note muted">No message content is stored on this campaign.</p>
              )}
            </div>
          )}
        </div>
        <div>
          <CardHead title="Recorded results" />
          {stats.loading ? <LoadingNote label="Loading campaign stats..." /> : null}
          {stats.error ? <ErrorNote error={stats.error} onRetry={stats.reload} /> : null}
          {data ? (
            <dl className="kv">
              <dt>Recipients recorded</dt>
              <dd>{data.recipients.toLocaleString('en-US')}</dd>
              <dt>Sent (provider confirmed)</dt>
              <dd>{data.sent.toLocaleString('en-US')}</dd>
              <dt>Not configured</dt>
              <dd>{data.notConfigured.toLocaleString('en-US')}</dd>
              <dt>Failed</dt>
              <dd>{data.failed.toLocaleString('en-US')}</dd>
              <dt>Refused</dt>
              <dd>{data.refused.toLocaleString('en-US')}</dd>
            </dl>
          ) : null}
          {data && data.failures.length > 0 ? (
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Recorded status</th>
                    <th>Reason</th>
                    <th>Recorded at</th>
                  </tr>
                </thead>
                <tbody>
                  {data.failures.map((failure, index) => (
                    <tr key={`${failure.createdAt}-${index}`}>
                      <td>{failure.toAddress ?? 'No address recorded'}</td>
                      <td>{failure.status}</td>
                      <td>{failure.detail ?? ''}</td>
                      <td>{formatDateTime(failure.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="note muted">
            Click, conversion and revenue attribution do not exist
            for general campaigns, so no such figures are shown.
            Delivered and engagement figures are also unavailable:
            no delivery tracking exists for campaign sends.
          </p>
        </div>
        <div>
          <CardHead title="Timeline" />
          <dl className="kv">
            <dt>Created</dt>
            <dd>{formatDateTime(campaign.createdAt)}</dd>
            <dt>Last updated</dt>
            <dd>{formatDateTime(campaign.updatedAt)}</dd>
            <dt>Scheduled for</dt>
            <dd>{campaign.scheduledFor ? formatDateTime(campaign.scheduledFor) : 'Not scheduled'}</dd>
            <dt>Sent at</dt>
            <dd>{campaign.sentAt ? formatDateTime(campaign.sentAt) : 'Not sent yet'}</dd>
            {campaign.sendNote ? (
              <>
                <dt>Send note</dt>
                <dd>{campaign.sendNote}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>
    </Drawer>
  );
}

/* Edit campaign modal (drafts only) -------------------------------- */

function EditCampaignModal({
  campaign,
  onClose,
  onDone,
}: {
  campaign: CampaignView;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [audienceNote, setAudienceNote] = useState(campaign.audienceNote);
  const [scheduledFor, setScheduledFor] = useState(
    campaign.scheduledFor ? campaign.scheduledFor.slice(0, 16) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateCampaign(campaign.id, {
        name: name.trim(),
        audienceNote: audienceNote.trim(),
        scheduledFor: scheduledFor
          ? new Date(scheduledFor).toISOString()
          : null,
      });
      onDone();
      onClose();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit Campaign" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          Campaign name
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="field">
          Audience note
          <input className="input" value={audienceNote} onChange={(event) => setAudienceNote(event.target.value)} required />
        </label>
        <label className="field">
          Schedule for (optional)
          <input className="input" type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving...' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* Page -------------------------------------------------------------- */

export default function MarketingPage() {
  const { session } = useAuth();
  const canEdit =
    session.principal?.permissions.includes('marketing.edit') ?? false;
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [selected, setSelected] = useState<CampaignView | null>(null);
  const [editing, setEditing] = useState<CampaignView | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const logsRef = useRef<HTMLDivElement | null>(null);

  const campaigns = useData((client) => client.listCampaigns(), []);
  const integrations = useData((client) => client.listIntegrations(), []);
  const templates = useData((client) => client.listMessageTemplates(), []);

  const items = useMemo(() => campaigns.data?.items ?? [], [campaigns.data]);
  const idsKey = items.map((item) => item.id).join(',');
  const stats = useData(
    async (client) => {
      if (items.length === 0) return [] as (CampaignStats | null)[];
      return Promise.all(
        items.map((item) =>
          client.getCampaignStats(item.id).catch(() => null),
        ),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );
  const statsById = useMemo(() => {
    const map = new Map<string, CampaignStats | null>();
    items.forEach((item, index) => {
      map.set(item.id, stats.data?.[index] ?? null);
    });
    return map;
  }, [items, stats.data]);

  const totalSent = useMemo(
    () =>
      (stats.data ?? []).reduce(
        (sum, entry) => sum + (entry ? entry.sent : 0),
        0,
      ),
    [stats.data],
  );
  const anyRecordedSends = items.some(
    (item) => (statsById.get(item.id)?.sent ?? 0) > 0,
  );

  const performancePoints = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const item of items) {
      const sent = statsById.get(item.id)?.sent ?? 0;
      if (item.sentAt && sent > 0) {
        const key = dayKey(item.sentAt);
        byDay.set(key, (byDay.get(key) ?? 0) + sent);
      }
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));
  }, [items, statsById]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tab !== 'all' && item.channel !== tab) return false;
      if (needle && !item.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, tab, search]);
  const pageCount = pageCountFor(filtered.length, PAGE_SIZE);
  const pageItems = paginate(filtered, Math.min(page, pageCount), PAGE_SIZE);

  const integrationItems = integrations.data?.items ?? [];
  const activeIntegration =
    tab !== 'all' ? integrationFor(integrationItems, tab) : undefined;
  const unconfiguredChannels = CAMPAIGN_CHANNELS.filter((channel) => {
    const entry = integrationFor(integrationItems, channel);
    return entry ? !entry.configured : false;
  });

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setRowError(null);
    try {
      await action();
      campaigns.reload();
      stats.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setRowError(uiError.message);
    }
  }

  async function sendNow(campaign: CampaignView): Promise<void> {
    if (
      !window.confirm(
        `Send "${campaign.name}" now? The engine revalidates consent per recipient, and every attempt is recorded.`,
      )
    ) {
      return;
    }
    setSendResult(null);
    await runAction(async () => {
      const result = await api.sendCampaign(campaign.id);
      setSendResult(
        result.sendNote
          ? `${result.name}: ${result.sendNote}`
          : `${result.name}: send finished with status ${CAMPAIGN_STATUS_LABELS[result.status]}. No send note was recorded.`,
      );
    });
  }

  async function duplicate(campaign: CampaignView): Promise<void> {
    await runAction(() =>
      api.createCampaign({
        name: `${campaign.name} copy`,
        channel: campaign.channel,
        audienceNote: campaign.audienceNote,
        segmentKey: campaign.segmentKey,
        segmentRules: campaign.segmentRules,
        templateKey: campaign.templateKey,
        subject: campaign.subject,
        body: campaign.body,
      }),
    );
  }

  return (
    <section>
      <ModuleHeader
        icon={Megaphone}
        title="Marketing"
        description="Plan, schedule and send campaigns over WhatsApp, email and SMS. A campaign only counts a message as sent when a configured provider confirms it: attempts on an unconfigured channel are recorded as not-configured, never as sent."
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setShowChannelSettings(true)}
        >
          <Settings2 size={16} /> Channel Settings
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setShowSegments(true)}
        >
          <Users size={16} /> Audience Segments
        </button>
        {canEdit ? (
          <button type="button" className="btn" onClick={() => setShowWizard(true)}>
            <Plus size={16} /> Create Campaign
          </button>
        ) : null}
      </ModuleHeader>

      {!canEdit ? (
        <p className="note muted">
          Your role can view campaigns but cannot create or change
          them (the marketing.edit permission is required).
        </p>
      ) : null}

      <div className="kpi-grid">
        <KpiCard
          icon={Megaphone}
          label="Total Campaigns"
          value={campaigns.loading ? '...' : items.length.toLocaleString('en-US')}
          note="All campaign records"
        />
        <KpiCard
          icon={Send}
          label="Messages Sent"
          value={stats.loading ? '...' : totalSent.toLocaleString('en-US')}
          note="Provider confirmed sends only, summed from campaign stats"
          tone="green"
        />
        <KpiCard
          icon={Users}
          label="Recipients Reached"
          value="Unavailable"
          note="No delivery tracking exists for campaign sends"
          tone="blue"
        />
        <KpiCard
          icon={TrendingUp}
          label="Engagement Rate"
          value="Unavailable"
          note="Click and engagement tracking do not exist for general campaigns"
          tone="orange"
        />
      </div>

      <StatusTabs
        tabs={[
          { key: 'all', label: 'All Campaigns', count: items.length },
          ...CAMPAIGN_CHANNELS.map((channel) => ({
            key: channel as string,
            label: CAMPAIGN_CHANNEL_LABELS[channel],
            count: items.filter((item) => item.channel === channel).length,
          })),
        ]}
        active={tab}
        onChange={(key) => {
          setTab(key as TabKey);
          setPage(1);
        }}
      />
      {tab !== 'all' && activeIntegration && !activeIntegration.configured ? (
        <p className="note muted">
          Sending is disabled by configuration: campaigns record
          not-configured per recipient. Missing variables:{' '}
          {activeIntegration.missing.join(', ') || 'none reported'}.
        </p>
      ) : null}
      {tab === 'all' && unconfiguredChannels.length > 0 ? (
        <p className="note muted">
          Sending is disabled by configuration on{' '}
          {unconfiguredChannels
            .map((channel) => CAMPAIGN_CHANNEL_LABELS[channel])
            .join(', ')}
          : campaigns on those channels record not-configured per
          recipient.
        </p>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <CardHead icon={BarChart3} title="Campaign Performance" />
        {campaigns.loading || stats.loading ? (
          <LoadingNote label="Loading campaign performance..." />
        ) : campaigns.error ? (
          <ErrorNote error={campaigns.error} onRetry={campaigns.reload} />
        ) : !anyRecordedSends ? (
          <EmptyNote>
            No delivered message data exists yet. Campaigns created
            and scheduled are listed below.
          </EmptyNote>
        ) : (
          <AreaChart points={performancePoints} formatValue={(value) => `${value} sent`} />
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }} ref={logsRef}>
        <CardHead icon={Megaphone} title="Campaigns">
          <label className="field" style={{ margin: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input
                className="input"
                type="search"
                placeholder="Search campaigns"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </span>
          </label>
        </CardHead>
        {sendResult ? (
          <p className="note" role="status">{sendResult}</p>
        ) : null}
        {rowError ? (
          <p className="form-error" role="alert">{rowError}</p>
        ) : null}
        {campaigns.loading ? (
          <LoadingNote label="Loading campaigns..." />
        ) : campaigns.error ? (
          <ErrorNote error={campaigns.error} onRetry={campaigns.reload} />
        ) : filtered.length === 0 ? (
          <EmptyNote>
            {items.length === 0
              ? 'No campaigns recorded yet.'
              : 'No campaigns match this tab and search.'}
          </EmptyNote>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign Name</th>
                    <th>Channel</th>
                    <th>Audience</th>
                    <th className="num">Sent</th>
                    <th>Delivered</th>
                    <th>Engagement</th>
                    <th>Status</th>
                    <th>Scheduled At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((campaign) => {
                    const entry = statsById.get(campaign.id);
                    return (
                      <tr key={campaign.id}>
                        <td>{campaign.name}</td>
                        <td>{CAMPAIGN_CHANNEL_LABELS[campaign.channel]}</td>
                        <td>{CAMPAIGN_SEGMENT_LABELS[campaign.segmentKey]}</td>
                        <td className="num">
                          {stats.loading
                            ? '...'
                            : entry
                              ? entry.sent.toLocaleString('en-US')
                              : 'Unavailable'}
                        </td>
                        <td><span className="muted">Unavailable</span></td>
                        <td><span className="muted">Unavailable</span></td>
                        <td>
                          <Badge>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
                        </td>
                        <td>
                          {campaign.scheduledFor
                            ? formatDateTime(campaign.scheduledFor)
                            : 'Not scheduled'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-small btn-secondary" onClick={() => setSelected(campaign)}>
                              <Eye size={14} /> View
                            </button>
                            {canEdit && campaign.status === 'draft' ? (
                              <button type="button" className="btn btn-small btn-secondary" onClick={() => setEditing(campaign)}>
                                <Pencil size={14} /> Edit
                              </button>
                            ) : null}
                            {canEdit ? (
                              <button type="button" className="btn btn-small btn-secondary" onClick={() => void duplicate(campaign)}>
                                <Copy size={14} /> Duplicate
                              </button>
                            ) : null}
                            {canEdit &&
                            (campaign.status === 'draft' || campaign.status === 'scheduled') ? (
                              <button type="button" className="btn btn-small" onClick={() => void sendNow(campaign)}>
                                <Send size={14} /> Send Now
                              </button>
                            ) : null}
                            {canEdit &&
                            campaign.status !== 'cancelled' &&
                            campaign.status !== 'archived' &&
                            campaign.status !== 'completed' ? (
                              <button
                                type="button"
                                className="btn btn-small btn-danger"
                                onClick={() => {
                                  if (window.confirm(`Cancel "${campaign.name}"?`)) {
                                    void runAction(() =>
                                      api.updateCampaign(campaign.id, { status: 'cancelled' }),
                                    );
                                  }
                                }}
                              >
                                <XCircle size={14} /> Cancel
                              </button>
                            ) : null}
                            {canEdit && campaign.status !== 'archived' ? (
                              <button
                                type="button"
                                className="btn btn-small btn-secondary"
                                onClick={() =>
                                  void runAction(() =>
                                    api.updateCampaign(campaign.id, { status: 'archived' }),
                                  )
                                }
                              >
                                <Archive size={14} /> Archive
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="muted">
                {filtered.length} campaign{filtered.length === 1 ? '' : 's'}
              </span>
              <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={setPage} />
            </div>
          </>
        )}
        <p className="note muted">
          <CalendarClock size={13} /> Delivered and engagement are
          shown as unavailable because no delivery or engagement
          tracking exists for campaign sends. Sent counts only
          provider confirmed sends from each campaign&apos;s recorded
          stats.
        </p>
      </div>

      {showChannelSettings ? (
        <ChannelSettingsModal
          integrations={integrationItems}
          loading={integrations.loading}
          error={integrations.error}
          onRetry={integrations.reload}
          onClose={() => setShowChannelSettings(false)}
        />
      ) : null}
      {showSegments ? (
        <SegmentsModal onClose={() => setShowSegments(false)} />
      ) : null}
      {showWizard ? (
        <CampaignWizard
          templates={templates.data?.items ?? []}
          integrations={integrationItems}
          onClose={() => setShowWizard(false)}
          onDone={() => {
            campaigns.reload();
            stats.reload();
          }}
        />
      ) : null}
      {selected ? (
        <CampaignDetailDrawer
          campaign={selected}
          template={
            selected.templateKey
              ? (templates.data?.items ?? []).find(
                  (item) => item.key === selected.templateKey,
                ) ?? null
              : null
          }
          onClose={() => setSelected(null)}
        />
      ) : null}
      {editing ? (
        <EditCampaignModal
          campaign={editing}
          onClose={() => setEditing(null)}
          onDone={() => campaigns.reload()}
        />
      ) : null}
    </section>
  );
}
