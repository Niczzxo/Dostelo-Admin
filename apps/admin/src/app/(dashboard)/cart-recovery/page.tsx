'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Banknote,
  Clock,
  Copy,
  FileText,
  ListOrdered,
  Mail,
  Megaphone,
  MessageCircle,
  Pencil,
  Phone,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ABANDONED_CART_STATUSES,
  COMMUNICATION_CHANNELS,
  DEFAULT_RECOVERY_SETTINGS,
  type AbandonedCart,
  type AbandonedCartStatus,
  type CommunicationChannel,
  type RecoverySettings,
  type RecoveryStep,
} from '@dostelo/types';
import type { MessageTemplateView } from '@dostelo/api-client';
import { api, formatDateTime, formatMinor, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import { BarChart } from '../../../components/charts';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  Pagination,
  Switch,
  pageCountFor,
  paginate,
} from '../../../components/ui';

/**
 * Abandoned Cart Recovery (redesign): one live recovery
 * sequence, the carts it detected, the shared message templates,
 * recovery reports and the stored settings. Every figure comes
 * from the API: the carts list, the recovery settings record,
 * the communication log, the templates store, the integrations
 * board and the reports summary. Where the API has no figure
 * (a delivery rate, a per cart next step time on the list view),
 * the page says so instead of inventing one.
 */

const PAGE_SIZE = 10;
const STEP_CHANNELS: CommunicationChannel[] = ['whatsapp', 'email', 'call'];
const TEMPLATE_VARIABLES = [
  '{{customer_name}}',
  '{{product_name}}',
  '{{cart_total}}',
  '{{recovery_link}}',
] as const;

const SAMPLE_VALUES: Record<string, string> = {
  customer_name: 'Ayesha',
  firstName: 'Ayesha',
  product_name: 'Sample product',
  itemCount: '2',
  cart_total: formatMinor(185000),
  total: formatMinor(185000),
  recovery_link: 'https://example.com/recover/sample-token',
  recoveryLink: 'https://example.com/recover/sample-token',
};

function renderWithSamples(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    SAMPLE_VALUES[name] ?? whole,
  );
}

function rangeFor(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function initialsFor(cart: AbandonedCart): string {
  const name = cart.contactName?.trim();
  if (!name) return 'AN';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function contactLabel(cart: AbandonedCart): string {
  return (
    cart.contactName ??
    cart.contactPhone ??
    cart.contactEmail ??
    'Anonymous visitor'
  );
}

function contactSub(cart: AbandonedCart): string {
  if (cart.contactName) {
    return cart.contactPhone ?? cart.contactEmail ?? 'No address recorded';
  }
  if (cart.contactPhone || cart.contactEmail) return 'Contact on record';
  return cart.visitorId
    ? 'Anonymous, tracked visitor session'
    : 'Anonymous, no contact details';
}

function consentLabel(cart: AbandonedCart): string {
  if (!cart.contactBasis) return 'No contact basis';
  if (cart.contactBasis === 'marketing-consent') return 'Marketing consent';
  return `Basis: ${cart.contactBasis}`;
}

type TabKey =
  | 'automation'
  | 'carts'
  | 'campaigns'
  | 'templates'
  | 'reports'
  | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'automation', label: 'Automation Sequence' },
  { key: 'carts', label: 'Abandoned Carts' },
  { key: 'campaigns', label: 'Recovery Campaigns' },
  { key: 'templates', label: 'Templates' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
];

export default function CartRecoveryPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('recovery.edit');
  const [tab, setTab] = useState<TabKey>('automation');
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const carts = useData((client) => client.listAbandonedCarts(), []);
  const settings = useData((client) => client.getRecoverySettings(), []);
  const templates = useData((client) => client.listMessageTemplates(), []);
  const commLog = useData((client) => client.listCommunicationLog(), []);
  const integrations = useData((client) => client.listIntegrations(), []);
  const range30 = useMemo(() => rangeFor(30), []);
  const reports30 = useData(
    (client) =>
      client.getReportsSummary({ from: range30.from, to: range30.to }),
    [range30.from, range30.to],
  );

  const items = carts.data?.items ?? [];
  const abandonedCount = items.filter(
    (cart) => cart.status === 'detected' || cart.status === 'in-recovery',
  ).length;
  const recoveredItems = items.filter((cart) => cart.status === 'recovered');
  const recoveredRevenue = recoveredItems.reduce(
    (sum, cart) => sum + cart.cartTotal.amountMinor,
    0,
  );
  const recoveryEntries = (commLog.data?.items ?? []).filter(
    (entry) => entry.abandonedCartId !== null,
  );

  const whatsappIntegration = integrations.data?.items.find(
    (item) => item.key === 'whatsapp',
  );
  const emailIntegration = integrations.data?.items.find(
    (item) => item.key === 'email',
  );

  async function toggleAutomation(enabled: boolean): Promise<void> {
    setSwitchBusy(true);
    setSwitchError(null);
    try {
      await api.updateRecoverySettings({ enabled });
      settings.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setSwitchError(uiError.message);
    } finally {
      setSwitchBusy(false);
    }
  }

  return (
    <section>
      <ModuleHeader
        icon={ShoppingCart}
        title="Abandoned Cart Recovery"
        description="Detect inactive carts, run the stored reminder sequence and recover orders, using only contacts with a recorded basis and consent."
      >
        <label
          className="switch"
          style={{ gap: 10, alignItems: 'center', display: 'inline-flex' }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>
            Recovery Automation
          </span>
          <Switch
            checked={settings.data?.enabled ?? false}
            disabled={!canEdit || switchBusy || !settings.data}
            label="Recovery Automation"
            onChange={(value) => void toggleAutomation(value)}
          />
          <span className="muted" style={{ fontSize: 12.5 }}>
            {settings.data
              ? settings.data.enabled
                ? 'On'
                : 'Off'
              : 'Loading'}
          </span>
        </label>
        <Link className="btn btn-secondary" href="/orders">
          View Orders
        </Link>
      </ModuleHeader>
      {switchError ? (
        <p className="form-error" role="alert">
          {switchError}
        </p>
      ) : null}
      {settings.error ? (
        <ErrorNote error={settings.error} onRetry={settings.reload} />
      ) : null}
      {!canEdit ? (
        <p className="note muted">
          Your role can view recoveries; running scans, editing the
          sequence, templates and settings needs the recovery.edit
          permission.
        </p>
      ) : null}

      <div className="kpi-grid">
        {carts.loading ? (
          <KpiCard icon={ShoppingCart} label="Abandoned Carts" value="..." tone="purple" />
        ) : carts.error || !carts.data ? (
          <KpiCard icon={ShoppingCart} label="Abandoned Carts" value="Unavailable" note="Could not load the carts list." tone="purple" />
        ) : (
          <KpiCard
            icon={ShoppingCart}
            label="Abandoned Carts"
            value={abandonedCount.toLocaleString('en-US')}
            note={`${items.length} recoveries on record in total`}
            tone="purple"
          />
        )}
        {commLog.loading ? (
          <KpiCard icon={Send} label="Recovery Sent" value="..." tone="blue" />
        ) : commLog.error || !commLog.data ? (
          <KpiCard icon={Send} label="Recovery Sent" value="Unavailable" note="The communication log could not be loaded for this role." tone="blue" />
        ) : (
          <KpiCard
            icon={Send}
            label="Recovery Sent"
            value={recoveryEntries.length.toLocaleString('en-US')}
            note="Communication log entries recorded for recoveries, including not-configured attempts and refusals"
            tone="blue"
          />
        )}
        {carts.loading ? (
          <KpiCard icon={ShoppingBag} label="Recovered Orders" value="..." tone="green" />
        ) : carts.error || !carts.data ? (
          <KpiCard icon={ShoppingBag} label="Recovered Orders" value="Unavailable" note="Could not load the carts list." tone="green" />
        ) : (
          <KpiCard
            icon={ShoppingBag}
            label="Recovered Orders"
            value={recoveredItems.length.toLocaleString('en-US')}
            note="Carts whose recovery ended with a placed order"
            tone="green"
          />
        )}
        {carts.loading ? (
          <KpiCard icon={Banknote} label="Recovered Revenue" value="..." tone="orange" />
        ) : carts.error || !carts.data ? (
          <KpiCard icon={Banknote} label="Recovered Revenue" value="Unavailable" note="Could not load the carts list." tone="orange" />
        ) : (
          <KpiCard
            icon={Banknote}
            label="Recovered Revenue"
            value={formatMinor(recoveredRevenue)}
            note="Cart totals at detection for the recovered carts"
            tone="orange"
          />
        )}
      </div>

      <div className="page-tabs" role="tablist" aria-label="Cart recovery sections">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            className={`page-tab${tab === entry.key ? ' active' : ''}`}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'automation' ? (
        <AutomationTab
          settingsState={settings}
          templates={templates.data?.items ?? []}
          templatesLoading={templates.loading}
          canEdit={canEdit}
          reports30={reports30}
          whatsappConfigured={whatsappIntegration?.configured ?? null}
          emailConfigured={emailIntegration?.configured ?? null}
          integrationsLoading={integrations.loading}
        />
      ) : null}
      {tab === 'carts' ? (
        <CartsTab cartsState={carts} canEdit={canEdit} />
      ) : null}
      {tab === 'campaigns' ? <CampaignsTab /> : null}
      {tab === 'templates' ? (
        <TemplatesTab
          templatesState={templates}
          canEdit={canEdit}
        />
      ) : null}
      {tab === 'reports' ? <ReportsTab /> : null}
      {tab === 'settings' ? (
        <SettingsTab settingsState={settings} canEdit={canEdit} />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Automation Sequence tab                                            */
/* ------------------------------------------------------------------ */

interface DataLike<T> {
  data: T | null;
  error: import('../../../lib/api').UiError | null;
  loading: boolean;
  reload: () => void;
}

function AutomationTab({
  settingsState,
  templates,
  templatesLoading,
  canEdit,
  reports30,
  whatsappConfigured,
  emailConfigured,
  integrationsLoading,
}: {
  settingsState: DataLike<RecoverySettings>;
  templates: MessageTemplateView[];
  templatesLoading: boolean;
  canEdit: boolean;
  reports30: DataLike<import('@dostelo/types').ReportsSummary>;
  whatsappConfigured: boolean | null;
  emailConfigured: boolean | null;
  integrationsLoading: boolean;
}) {
  const settings = settingsState.data;
  const recovery = reports30.data?.recovery;
  const deliveryNote = integrationsLoading
    ? 'Checking provider configuration...'
    : whatsappConfigured && emailConfigured
      ? 'Unavailable: the API records send outcomes on each log entry but does not publish a separate delivery rate.'
      : 'Unavailable while providers are not configured: WhatsApp or email has no provider credentials on the server, so sends record not-configured instead of a delivery.';

  return (
    <div>
      <div className="card">
        <CardHead icon={ListOrdered} title="Recovery Sequence">
          {settings ? (
            <label className="switch" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Sequence active</span>
              <SequenceSwitch settings={settings} canEdit={canEdit} onSaved={settingsState.reload} />
            </label>
          ) : null}
        </CardHead>
        {settingsState.loading ? (
          <LoadingNote label="Loading settings..." />
        ) : null}
        {settingsState.error ? (
          <ErrorNote error={settingsState.error} onRetry={settingsState.reload} />
        ) : null}
        {settings ? (
          <SequenceEditor
            key={JSON.stringify(settings)}
            settings={settings}
            templates={templates}
            templatesLoading={templatesLoading}
            canEdit={canEdit}
            onSaved={settingsState.reload}
          />
        ) : null}
      </div>

      <div className="dash-row section-gap">
        <div className="card">
          <CardHead icon={ShieldCheck} title="Recovery Rules" />
          <p className="note muted" style={{ marginTop: 0 }}>
            These are fixed engine rules enforced by the API on every
            scan and send. They are not toggles.
          </p>
          <ul className="timeline">
            <li>Only carts with contact details get a recovery: a cart with no contact path is never messaged.</li>
            <li>Customers with a completed order are excluded, and placing an order cancels every pending step.</li>
            <li>Marketing consent is respected: visitors who denied marketing consent are refused at send time.</li>
            <li>Do Not Contact contacts are excluded: suppressed contacts are refused before any provider is touched.</li>
          </ul>
        </div>

        <div className="card">
          <CardHead icon={BarChart3} title="Performance (last 30 days)" />
          {reports30.loading ? (
            <LoadingNote label="Loading performance..." />
          ) : null}
          {reports30.error ? (
            <ErrorNote error={reports30.error} onRetry={reports30.reload} />
          ) : null}
          {recovery ? (
            <dl className="kv">
              <dt>Recovery rate</dt>
              <dd>{recovery.recoveryRatePercent.toFixed(1)}%</dd>
              <dt>Recovered carts</dt>
              <dd>
                {recovery.recovered} of {recovery.detected} detected
              </dd>
              <dt>Recovered value</dt>
              <dd>{formatMinor(recovery.recoveredValueMinor)}</dd>
              <dt>Delivery rate</dt>
              <dd>{deliveryNote}</dd>
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SequenceSwitch({
  settings,
  canEdit,
  onSaved,
}: {
  settings: RecoverySettings;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(value: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.updateRecoverySettings({
        enabled: settings.enabled,
        sequenceEnabled: value,
        abandonedAfterMinutes: settings.abandonedAfterMinutes,
        tokenTtlDays: settings.tokenTtlDays,
        steps: settings.steps,
      });
      onSaved();
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
    <span>
      <Switch
        checked={settings.sequenceEnabled}
        disabled={!canEdit || busy}
        label="Sequence active"
        onChange={(value) => void toggle(value)}
      />
      {error ? (
        <span className="form-error" role="alert" style={{ marginLeft: 10 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}

function SequenceEditor({
  settings,
  templates,
  templatesLoading,
  canEdit,
  onSaved,
}: {
  settings: RecoverySettings;
  templates: MessageTemplateView[];
  templatesLoading: boolean;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [threshold, setThreshold] = useState(String(settings.abandonedAfterMinutes));
  const [tokenDays, setTokenDays] = useState(String(settings.tokenTtlDays));
  const [steps, setSteps] = useState<RecoveryStep[]>(
    settings.steps.map((step) => ({ ...step })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function markDirty(): void {
    setSaved(false);
  }

  function updateStep(index: number, patch: Partial<RecoveryStep>): void {
    setSteps((current) =>
      current.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
    markDirty();
  }

  function addStep(): void {
    setSteps((current) => [
      ...current,
      {
        stepNumber: current.length + 1,
        delayMinutes: 60,
        channel: 'whatsapp',
        templateKey:
          templates.find((template) => template.channel === 'whatsapp')?.key ??
          'recovery-whatsapp-1',
      },
    ]);
    markDirty();
  }

  function removeStep(index: number): void {
    setSteps((current) =>
      current
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, stepNumber: i + 1 })),
    );
    markDirty();
  }

  function loadPreset(): void {
    setThreshold(String(DEFAULT_RECOVERY_SETTINGS.abandonedAfterMinutes));
    setTokenDays(String(DEFAULT_RECOVERY_SETTINGS.tokenTtlDays));
    setSteps(DEFAULT_RECOVERY_SETTINGS.steps.map((step) => ({ ...step })));
    markDirty();
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const thresholdValue = Number(threshold);
    const ttlValue = Number(tokenDays);
    if (!Number.isFinite(thresholdValue) || thresholdValue < 1) {
      setError('The inactivity threshold must be at least 1 minute.');
      return;
    }
    if (!Number.isFinite(ttlValue) || ttlValue < 1) {
      setError('The token lifetime must be at least 1 day.');
      return;
    }
    if (steps.some((step) => !step.templateKey.trim())) {
      setError('Every step needs a template.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateRecoverySettings({
        enabled: settings.enabled,
        sequenceEnabled: settings.sequenceEnabled,
        abandonedAfterMinutes: Math.trunc(thresholdValue),
        tokenTtlDays: Math.trunc(ttlValue),
        steps: steps.map((step, i) => ({
          stepNumber: i + 1,
          delayMinutes: Math.trunc(step.delayMinutes),
          channel: step.channel,
          templateKey: step.templateKey.trim(),
        })),
      });
      setSaved(true);
      onSaved();
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

  if (!canEdit) {
    return (
      <div>
        <dl className="kv">
          <dt>Inactivity threshold</dt>
          <dd>{settings.abandonedAfterMinutes} minutes</dd>
          <dt>Token lifetime</dt>
          <dd>{settings.tokenTtlDays} days</dd>
          <dt>Sequence</dt>
          <dd>{settings.sequenceEnabled ? 'Active' : 'Paused'}</dd>
        </dl>
        <ul className="timeline" style={{ marginTop: 12 }}>
          {settings.steps.map((step) => (
            <li key={step.stepNumber}>
              <strong>Step {step.stepNumber}</strong>: {step.channel} after{' '}
              {step.delayMinutes} minutes, template {step.templateKey}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label className="field" style={{ marginTop: 0 }}>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <Clock size={14} /> Inactivity threshold (minutes)
          </span>
          <input
            className="input"
            type="number"
            min={1}
            value={threshold}
            onChange={(event) => {
              setThreshold(event.target.value);
              markDirty();
            }}
          />
        </label>
        <label className="field" style={{ marginTop: 0 }}>
          Recovery token lifetime (days)
          <input
            className="input"
            type="number"
            min={1}
            value={tokenDays}
            onChange={(event) => {
              setTokenDays(event.target.value);
              markDirty();
            }}
          />
        </label>
      </div>

      {steps.map((step, index) => {
        const channelTemplates = templates.filter(
          (template) => template.channel === step.channel,
        );
        const options =
          channelTemplates.length > 0
            ? channelTemplates
            : templates.filter((template) => template.key === step.templateKey);
        return (
          <div className="step-row" key={index}>
            <span className="step-num">{index + 1}</span>
            <label className="field" style={{ marginTop: 0 }}>
              Channel
              <select
                className="select"
                value={step.channel}
                onChange={(event) => {
                  const channel = event.target.value as CommunicationChannel;
                  const first = templates.find(
                    (template) => template.channel === channel,
                  );
                  updateStep(index, {
                    channel,
                    templateKey: first?.key ?? step.templateKey,
                  });
                }}
              >
                {STEP_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ marginTop: 0 }}>
              Delay after previous step (minutes)
              <input
                className="input"
                type="number"
                min={0}
                value={step.delayMinutes}
                onChange={(event) =>
                  updateStep(index, { delayMinutes: Number(event.target.value) })
                }
              />
            </label>
            <label className="field" style={{ marginTop: 0 }}>
              Template
              <select
                className="select"
                value={step.templateKey}
                disabled={templatesLoading}
                onChange={(event) =>
                  updateStep(index, { templateKey: event.target.value })
                }
              >
                {options.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.key}
                  </option>
                ))}
                {!options.some((template) => template.key === step.templateKey) ? (
                  <option value={step.templateKey}>{step.templateKey}</option>
                ) : null}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-small btn-danger"
              disabled={steps.length <= 1}
              onClick={() => removeStep(index)}
            >
              <Trash2 size={14} /> Remove Step
            </button>
          </div>
        );
      })}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={steps.length >= 10}
          onClick={addStep}
        >
          <Plus size={14} /> Add Step
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={loadPreset}
        >
          <RotateCcw size={14} /> Load Preset
        </button>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving...' : 'Save Sequence'}
        </button>
      </div>
      <p className="note muted">
        Load Preset restores the shipped defaults: a 60 minute threshold
        with steps at 60, 1440 and 4320 minutes. Nothing is saved until
        Save Sequence is pressed.
      </p>
      {saved ? <p className="note">Sequence saved.</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Abandoned Carts tab                                                */
/* ------------------------------------------------------------------ */

type SortKey = 'detected' | 'value' | 'activity' | 'items';

function CartsTab({
  cartsState,
  canEdit,
}: {
  cartsState: DataLike<{ items: AbandonedCart[] }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AbandonedCartStatus | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('detected');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = (cartsState.data?.items ?? []).filter((cart) => {
      if (statusFilter && cart.status !== statusFilter) return false;
      if (!query) return true;
      const haystack = [
        cart.contactName ?? '',
        cart.contactPhone ?? '',
        cart.contactEmail ?? '',
        cart.id,
        cart.status,
        cart.recoveredOrderNumber ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    const sorted = [...rows].sort((a, b) => {
      let delta = 0;
      if (sortKey === 'value') delta = a.cartTotal.amountMinor - b.cartTotal.amountMinor;
      else if (sortKey === 'items') delta = a.itemCount - b.itemCount;
      else if (sortKey === 'activity')
        delta = new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime();
      else delta = new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime();
      return sortDir === 'asc' ? delta : -delta;
    });
    return sorted;
  }, [cartsState.data, search, statusFilter, sortKey, sortDir]);

  const pageRows = paginate(filtered, page, PAGE_SIZE);

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  async function runScan(): Promise<void> {
    setScanning(true);
    setScanNote(null);
    setActionError(null);
    try {
      const result = await api.runRecoveryScan();
      setScanNote(
        `Scan complete: ${result.detected} newly detected, ${result.closed} closed.`,
      );
      cartsState.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setActionError(uiError.message);
    } finally {
      setScanning(false);
    }
  }

  async function act(cart: AbandonedCart, kind: 'run' | 'cancel'): Promise<void> {
    if (
      kind === 'cancel' &&
      !window.confirm(
        'Cancel this recovery? Every pending step is cancelled and no further recovery messages will be scheduled.',
      )
    ) {
      return;
    }
    setBusyId(cart.id);
    setActionError(null);
    setActionNote(null);
    try {
      if (kind === 'run') {
        await api.runRecoveryStep(cart.id);
        setActionNote('The next due step ran. Open the recovery detail to see its outcome.');
      } else {
        await api.cancelRecovery(cart.id);
        setActionNote('Recovery cancelled.');
      }
      cartsState.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setActionError(uiError.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Search size={14} /> Search
            </span>
            <input
              className="input"
              placeholder="Name, phone, email or order number"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="field">
            Recovery status
            <select
              className="select"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as AbandonedCartStatus | '');
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {ABANDONED_CART_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Sort by
            <select
              className="select"
              value={sortKey}
              onChange={(event) => {
                setSortKey(event.target.value as SortKey);
                setPage(1);
              }}
            >
              <option value="detected">Detected</option>
              <option value="activity">Last activity</option>
              <option value="value">Cart value</option>
              <option value="items">Items</option>
            </select>
          </label>
          <div className="filter-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setSortKey('detected');
                setSortDir('desc');
                setPage(1);
              }}
            >
              Reset
            </button>
            {canEdit ? (
              <button
                type="button"
                className="btn"
                disabled={scanning}
                onClick={() => void runScan()}
              >
                {scanning ? 'Scanning...' : 'Run detection scan'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {scanNote ? <p className="note">{scanNote}</p> : null}
      {actionNote ? <p className="note">{actionNote}</p> : null}
      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="card section-gap" style={{ marginTop: 16 }}>
        <CardHead icon={ShoppingCart} title="Abandoned Carts">
          <span className="muted" style={{ fontSize: 12.5 }}>
            Click a row to open its detail page
          </span>
        </CardHead>
        {cartsState.loading ? (
          <LoadingNote label="Loading recoveries..." />
        ) : null}
        {cartsState.error ? (
          <ErrorNote error={cartsState.error} onRetry={cartsState.reload} />
        ) : null}
        {cartsState.data && filtered.length === 0 ? (
          <EmptyNote>
            No abandoned carts match this filter. Carts appear here
            after a detection scan finds them inactive beyond the
            configured threshold.
          </EmptyNote>
        ) : null}
        {cartsState.data && filtered.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>
                      <button type="button" style={{ font: "inherit", background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", fontWeight: 600 }} onClick={() => toggleSort('items')}>
                        Cart Items
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" style={{ font: "inherit", background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", fontWeight: 600 }} onClick={() => toggleSort('value')}>
                        Cart Value
                      </button>
                    </th>
                    <th>Contact Availability</th>
                    <th>Consent Status</th>
                    <th>
                      <button type="button" style={{ font: "inherit", background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", fontWeight: 600 }} onClick={() => toggleSort('activity')}>
                        Last Activity
                      </button>
                    </th>
                    <th>Recovery Status</th>
                    <th>Scheduled Next Action</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((cart) => {
                    const active =
                      cart.status === 'detected' || cart.status === 'in-recovery';
                    return (
                      <tr
                        key={cart.id}
                        onClick={() => router.push(`/cart-recovery/${cart.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span className="identity-cell">
                            <span className="avatar-initials">{initialsFor(cart)}</span>
                            <span>
                              <span className="identity-main">{contactLabel(cart)}</span>
                              <span className="identity-sub">{contactSub(cart)}</span>
                            </span>
                          </span>
                        </td>
                        <td className="num">{cart.itemCount}</td>
                        <td className="num">{formatMinor(cart.cartTotal.amountMinor)}</td>
                        <td>
                          {cart.contactPhone || cart.contactEmail ? (
                            <span>
                              {cart.contactPhone ? 'Phone' : ''}
                              {cart.contactPhone && cart.contactEmail ? ' and ' : ''}
                              {cart.contactEmail ? 'Email' : ''}
                            </span>
                          ) : (
                            'None recorded'
                          )}
                        </td>
                        <td>{consentLabel(cart)}</td>
                        <td>{formatDateTime(cart.lastActivityAt)}</td>
                        <td>
                          <Badge>{cart.status}</Badge>
                          {cart.closeReason ? (
                            <div className="muted">{cart.closeReason}</div>
                          ) : null}
                          {cart.recoveredOrderNumber ? (
                            <div className="muted">Order {cart.recoveredOrderNumber}</div>
                          ) : null}
                        </td>
                        <td>
                          <span className="muted" title="The list view does not carry per cart step timing; open the detail page for scheduled steps.">
                            -
                          </span>
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                            <Link
                              className="btn btn-secondary btn-small"
                              href={`/cart-recovery/${cart.id}`}
                            >
                              View
                            </Link>
                            {canEdit && active ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-small"
                                  disabled={busyId !== null}
                                  onClick={() => void act(cart, 'run')}
                                >
                                  <Play size={13} /> Run next step
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-small btn-danger"
                                  disabled={busyId !== null}
                                  onClick={() => void act(cart, 'cancel')}
                                >
                                  <XCircle size={13} /> Cancel
                                </button>
                              </>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="muted">
                {filtered.length} abandoned cart{filtered.length === 1 ? '' : 's'}
              </span>
              <Pagination
                page={page}
                pageCount={pageCountFor(filtered.length, PAGE_SIZE)}
                onChange={setPage}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recovery Campaigns tab                                             */
/* ------------------------------------------------------------------ */

function CampaignsTab() {
  return (
    <div className="card">
      <CardHead icon={Megaphone} title="Recovery Campaigns" />
      <EmptyNote>
        Multi-campaign support does not exist in the API. There is
        exactly one live recovery sequence for the store, and it is
        the sequence shown in the Automation Sequence tab: one
        settings record, one ordered set of steps, applied to every
        newly detected cart. No separate campaigns can be created,
        so no campaign rows are listed here.
      </EmptyNote>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Templates tab                                                      */
/* ------------------------------------------------------------------ */

interface TemplateDraft {
  key: string;
  channel: CommunicationChannel;
  subject: string;
  body: string;
}

function TemplatesTab({
  templatesState,
  canEdit,
}: {
  templatesState: DataLike<{ items: MessageTemplateView[] }>;
  canEdit: boolean;
}) {
  const templates = templatesState.data?.items ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [previewChannel, setPreviewChannel] =
    useState<CommunicationChannel>('whatsapp');
  const [modal, setModal] = useState<
    | { mode: 'edit'; draft: TemplateDraft }
    | { mode: 'create'; draft: TemplateDraft }
    | null
  >(null);
  const [note, setNote] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const selected =
    templates.find((template) => template.key === selectedKey) ??
    templates[0] ??
    null;
  const previewTemplate =
    selected && selected.channel === previewChannel
      ? selected
      : (templates.find((template) => template.channel === previewChannel) ??
        selected);

  async function remove(template: MessageTemplateView): Promise<void> {
    const message =
      template.source === 'built-in'
        ? `Delete the stored edits for "${template.key}"? The built-in template is restored.`
        : `Delete template "${template.key}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    setBusyKey(template.key);
    setListError(null);
    setNote(null);
    try {
      const result = await api.deleteMessageTemplate(template.key);
      setNote(
        result.builtinRestored
          ? `Template "${template.key}" removed and the built-in restored.`
          : `Template "${template.key}" removed.`,
      );
      templatesState.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setListError(uiError.message);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      {note ? <p className="note">{note}</p> : null}
      {listError ? (
        <p className="form-error" role="alert">
          {listError}
        </p>
      ) : null}
      <div className="comm-layout">
        <div className="card">
          <CardHead icon={FileText} title="Message Templates">
            {canEdit ? (
              <button
                type="button"
                className="btn btn-small"
                onClick={() =>
                  setModal({
                    mode: 'create',
                    draft: { key: '', channel: 'whatsapp', subject: '', body: '' },
                  })
                }
              >
                <Plus size={14} /> Create New Template
              </button>
            ) : null}
          </CardHead>
          {templatesState.loading ? (
            <LoadingNote label="Loading templates..." />
          ) : null}
          {templatesState.error ? (
            <ErrorNote error={templatesState.error} onRetry={templatesState.reload} />
          ) : null}
          {templatesState.data && templates.length === 0 ? (
            <EmptyNote>No templates are stored yet.</EmptyNote>
          ) : null}
          {templates.length > 0 ? (
            <div className="convo-list">
              {templates.map((template) => (
                <div
                  key={template.key}
                  className={`convo-item${selected?.key === template.key ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedKey(template.key);
                    setPreviewChannel(template.channel);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{template.key}</strong>
                    <span className="badge">{template.channel}</span>
                    <span className="badge">{template.source}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    {template.body.slice(0, 110)}
                    {template.body.length > 110 ? '...' : ''}
                  </div>
                  {canEdit ? (
                    <div
                      style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() =>
                          setModal({
                            mode: 'edit',
                            draft: {
                              key: template.key,
                              channel: template.channel,
                              subject: template.subject ?? '',
                              body: template.body,
                            },
                          })
                        }
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() =>
                          setModal({
                            mode: 'create',
                            draft: {
                              key: `${template.key}-copy`,
                              channel: template.channel,
                              subject: template.subject ?? '',
                              body: template.body,
                            },
                          })
                        }
                      >
                        <Copy size={13} /> Duplicate
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        disabled={busyKey !== null}
                        onClick={() => void remove(template)}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {canEdit ? null : (
            <p className="note muted">
              Editing templates needs the recovery.edit permission.
              Deleting a stored template restores its built-in version
              when one exists.
            </p>
          )}
        </div>

        <div className="card">
          <CardHead icon={MessageCircle} title="Message Preview" />
          <div className="action-tabs" role="tablist" aria-label="Preview channel">
            {STEP_CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                role="tab"
                aria-selected={previewChannel === channel}
                className={`action-tab${previewChannel === channel ? ' active' : ''}`}
                onClick={() => setPreviewChannel(channel)}
              >
                {channel === 'whatsapp' ? (
                  <MessageCircle size={14} />
                ) : channel === 'email' ? (
                  <Mail size={14} />
                ) : (
                  <Phone size={14} />
                )}{' '}
                {channel === 'whatsapp'
                  ? 'WhatsApp'
                  : channel === 'email'
                    ? 'Email'
                    : 'Call'}
              </button>
            ))}
          </div>
          <p className="note muted">Preview with sample values</p>
          {templatesState.loading ? (
            <LoadingNote label="Loading templates..." />
          ) : previewTemplate ? (
            previewChannel === 'email' ? (
              <div className="preview-email">
                {previewTemplate.subject ? (
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {renderWithSamples(previewTemplate.subject)}
                  </div>
                ) : null}
                {renderWithSamples(previewTemplate.body)}
              </div>
            ) : (
              <div className="preview-bubble">
                {renderWithSamples(previewTemplate.body)}
              </div>
            )
          ) : (
            <EmptyNote>No template exists for this channel yet.</EmptyNote>
          )}
          {previewTemplate ? (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Showing template {previewTemplate.key} with sample values
              for customer_name, product_name, cart_total and
              recovery_link. Real sends render the cart values
              server-side.
            </p>
          ) : null}
        </div>
      </div>

      {modal ? (
        <TemplateModal
          mode={modal.mode}
          initial={modal.draft}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            setNote(message);
            templatesState.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: 'edit' | 'create';
  initial: TemplateDraft;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  function insertVariable(variable: string): void {
    const textarea = bodyRef.current;
    if (!textarea) {
      setDraft((current) => ({ ...current, body: current.body + variable }));
      return;
    }
    const start = textarea.selectionStart ?? draft.body.length;
    const end = textarea.selectionEnd ?? start;
    const next = draft.body.slice(0, start) + variable + draft.body.slice(end);
    setDraft((current) => ({ ...current, body: next }));
    requestAnimationFrame(() => {
      textarea.focus();
      const position = start + variable.length;
      textarea.setSelectionRange(position, position);
    });
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const key = draft.key.trim();
    if (!key) {
      setError('A template key is required.');
      return;
    }
    if (!draft.body.trim()) {
      setError('The template body cannot be empty.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.upsertMessageTemplate(key, {
        channel: draft.channel,
        subject:
          draft.channel === 'email' ? draft.subject.trim() || null : null,
        body: draft.body,
      });
      onSaved(
        mode === 'edit'
          ? `Template "${key}" saved.`
          : `Template "${key}" created.`,
      );
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      // API validation errors (for example unknown variables, which
      // the server rejects) are surfaced here, never swallowed.
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === 'edit' ? `Edit template ${initial.key}` : 'Create New Template'}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label className="field">
          Template key
          <input
            className="input"
            value={draft.key}
            disabled={mode === 'edit'}
            onChange={(event) =>
              setDraft((current) => ({ ...current, key: event.target.value }))
            }
            placeholder="recovery-whatsapp-2"
          />
        </label>
        <label className="field">
          Channel
          <select
            className="select"
            value={draft.channel}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                channel: event.target.value as CommunicationChannel,
              }))
            }
          >
            {COMMUNICATION_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </label>
        {draft.channel === 'email' ? (
          <label className="field">
            Subject
            <input
              className="input"
              value={draft.subject}
              onChange={(event) =>
                setDraft((current) => ({ ...current, subject: event.target.value }))
              }
            />
          </label>
        ) : null}
        <label className="field">
          Body
          <textarea
            ref={bodyRef}
            className="input"
            value={draft.body}
            onChange={(event) =>
              setDraft((current) => ({ ...current, body: event.target.value }))
            }
            rows={7}
          />
        </label>
        <div className="char-count">{draft.body.length} / 4000</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {TEMPLATE_VARIABLES.map((variable) => (
            <button
              key={variable}
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => insertVariable(variable)}
            >
              {variable}
            </button>
          ))}
        </div>
        <p className="note muted">
          Only the variables above (plus their firstName, itemCount,
          total and recoveryLink forms) are accepted. The API rejects
          unknown variables and the error is shown here.
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving...' : mode === 'edit' ? 'Save Template' : 'Create Template'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Reports tab                                                        */
/* ------------------------------------------------------------------ */

function ReportsTab() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const range = useMemo(() => rangeFor(days), [days]);
  const reports = useData(
    (client) => client.getReportsSummary({ from: range.from, to: range.to }),
    [range.from, range.to],
  );
  const recovery = reports.data?.recovery;

  return (
    <div>
      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">
            Range
            <select
              className="select"
              value={days}
              onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
        </div>
      </div>

      {reports.loading ? <LoadingNote label="Loading reports..." /> : null}
      {reports.error ? (
        <ErrorNote error={reports.error} onRetry={reports.reload} />
      ) : null}

      {recovery ? (
        <>
          <div className="kpi-grid section-gap" style={{ marginTop: 16 }}>
            <KpiCard icon={ShoppingCart} label="Detected" value={recovery.detected.toLocaleString('en-US')} note={`In the last ${days} days`} tone="purple" />
            <KpiCard icon={ShoppingBag} label="Recovered" value={recovery.recovered.toLocaleString('en-US')} note={`${recovery.recoveryRatePercent.toFixed(1)}% recovery rate`} tone="green" />
            <KpiCard icon={XCircle} label="Cancelled" value={recovery.cancelled.toLocaleString('en-US')} note="Recoveries cancelled by staff" tone="orange" />
            <KpiCard icon={Clock} label="In Progress" value={recovery.inProgress.toLocaleString('en-US')} note="Detected or in recovery at the end of the range" tone="blue" />
          </div>
          <div className="card section-gap">
            <CardHead icon={Banknote} title="Recovered Value" />
            <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0' }}>
              {formatMinor(recovery.recoveredValueMinor)}
            </p>
            <p className="note muted">
              Value of the carts recovered in the last {days} days, from
              the reports summary.
            </p>
          </div>
          <div className="card section-gap">
            <CardHead icon={BarChart3} title="Detected vs Recovered" />
            {recovery.detected === 0 && recovery.recovered === 0 ? (
              <EmptyNote>
                No carts were detected in this range, so there is
                nothing to chart yet.
              </EmptyNote>
            ) : (
              <BarChart
                points={[
                  { label: 'Detected', value: recovery.detected },
                  { label: 'Recovered', value: recovery.recovered },
                ]}
              />
            )}
          </div>
        </>
      ) : null}
      {!reports.loading && !reports.error && !recovery ? (
        <EmptyNote>No report data is available for this range.</EmptyNote>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings tab                                                       */
/* ------------------------------------------------------------------ */

function SettingsTab({
  settingsState,
  canEdit,
}: {
  settingsState: DataLike<RecoverySettings>;
  canEdit: boolean;
}) {
  const settings = settingsState.data;
  return (
    <div className="card">
      <CardHead icon={SettingsIcon} title="Recovery Settings" />
      {settingsState.loading ? (
        <LoadingNote label="Loading settings..." />
      ) : null}
      {settingsState.error ? (
        <ErrorNote error={settingsState.error} onRetry={settingsState.reload} />
      ) : null}
      {settings ? (
        <SettingsForm
          key={JSON.stringify(settings)}
          settings={settings}
          canEdit={canEdit}
          onSaved={settingsState.reload}
        />
      ) : null}
      <p className="note muted" style={{ marginTop: 14 }}>
        Sends stay not-configured until providers exist: without
        WhatsApp or email provider credentials on the server, every
        automated send records not-configured on the communication
        log instead of a fake sent status. Check the Integrations
        page for the per provider status.
      </p>
    </div>
  );
}

function SettingsForm({
  settings,
  canEdit,
  onSaved,
}: {
  settings: RecoverySettings;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [sequenceEnabled, setSequenceEnabled] = useState(settings.sequenceEnabled);
  const [threshold, setThreshold] = useState(String(settings.abandonedAfterMinutes));
  const [tokenDays, setTokenDays] = useState(String(settings.tokenTtlDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const thresholdValue = Number(threshold);
    const ttlValue = Number(tokenDays);
    if (!Number.isFinite(thresholdValue) || thresholdValue < 1) {
      setError('The inactivity threshold must be at least 1 minute.');
      return;
    }
    if (!Number.isFinite(ttlValue) || ttlValue < 1) {
      setError('The token lifetime must be at least 1 day.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateRecoverySettings({
        enabled,
        sequenceEnabled,
        abandonedAfterMinutes: Math.trunc(thresholdValue),
        tokenTtlDays: Math.trunc(ttlValue),
        steps: settings.steps,
      });
      setSaved(true);
      onSaved();
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
    <form onSubmit={submit}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="switch" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Recovery automation enabled</span>
          <Switch checked={enabled} disabled={!canEdit} label="Recovery automation enabled" onChange={(value) => { setEnabled(value); setSaved(false); }} />
        </label>
        <label className="switch" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>Reminder sequence enabled</span>
          <Switch checked={sequenceEnabled} disabled={!canEdit} label="Reminder sequence enabled" onChange={(value) => { setSequenceEnabled(value); setSaved(false); }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        <label className="field" style={{ marginTop: 0 }}>
          Inactivity threshold (minutes)
          <input
            className="input"
            type="number"
            min={1}
            disabled={!canEdit}
            value={threshold}
            onChange={(event) => {
              setThreshold(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label className="field" style={{ marginTop: 0 }}>
          Recovery token lifetime (days)
          <input
            className="input"
            type="number"
            min={1}
            disabled={!canEdit}
            value={tokenDays}
            onChange={(event) => {
              setTokenDays(event.target.value);
              setSaved(false);
            }}
          />
        </label>
      </div>
      {canEdit ? (
        <div style={{ marginTop: 16 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      ) : (
        <p className="note muted">
          Editing settings needs the recovery.edit permission.
        </p>
      )}
      {saved ? <p className="note">Settings saved.</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
