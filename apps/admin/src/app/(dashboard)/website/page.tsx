'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  INTEGRATION_CATEGORY_LABELS,
  type StoreSettingsView,
} from '@dostelo/types';
import { api, formatMinor, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  ModuleHeader,
  Switch,
} from '../../../components/ui';
import {
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  Palette,
  Plug,
  Search,
  Settings2,
  Store,
  Truck,
} from 'lucide-react';

const MANUAL_METHODS = [
  { key: 'bkash', label: 'bKash' },
  { key: 'nagad', label: 'Nagad' },
  { key: 'rocket', label: 'Rocket' },
  { key: 'upay', label: 'Upay' },
] as const;

const TABS = [
  { key: 'store', label: 'Store Settings' },
  { key: 'payments', label: 'Payment Instructions' },
  { key: 'delivery', label: 'Delivery and Shipping' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'pages', label: 'Pages and Content' },
  { key: 'seo', label: 'SEO and Meta' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'advanced', label: 'Advanced' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const SLA_ROWS = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
  { key: 'low', label: 'Low' },
] as const;

/**
 * Website Management: the single store settings record over the
 * API. Every tab below is a view over the same form state and
 * the same save, so switching tabs never loses an edit. The
 * delivery fee table saved here is the table checkout charges,
 * and the free delivery, COD and store live switches are the
 * ones checkout and the catalogue read, so what is saved here
 * is what customers get. Every save is audited server side.
 * After a save the settings are reloaded from the API so the
 * page shows what is actually stored.
 */
export default function WebsitePage() {
  const { session } = useAuth();
  const canManage =
    session.principal?.permissions.includes('settings.manage') ?? false;
  const settings = useData((client) => client.getStoreSettings(), []);
  const integrations = useData((client) => client.listIntegrations(), []);

  const [form, setForm] = useState<StoreSettingsView | null>(null);
  const [snapshot, setSnapshot] = useState<StoreSettingsView | null>(null);
  const [tab, setTab] = useState<TabKey>('store');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setForm(settings.data);
      setSnapshot(settings.data);
    }
  }, [settings.data]);

  const dirty =
    form !== null &&
    snapshot !== null &&
    JSON.stringify(form) !== JSON.stringify(snapshot);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent): void {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function feeField(key: keyof StoreSettingsView['deliveryFees']) {
    return (value: string) => {
      const parsed = Number(value);
      setForm((current) =>
        current
          ? {
              ...current,
              deliveryFees: {
                ...current.deliveryFees,
                [key]: Number.isFinite(parsed) ? Math.round(parsed) : 0,
              },
            }
          : current,
      );
    };
  }

  async function save(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.updateStoreSettings({
        storeName: form.storeName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        freeDeliveryOffer: form.freeDeliveryOffer,
        allowCod: form.allowCod,
        storeLive: form.storeLive,
        returnWindowDays: form.returnWindowDays,
        automationLeadEvaluationEnabled:
          form.automationLeadEvaluationEnabled,
        slaTargets: form.slaTargets,
        deliveryFees: form.deliveryFees,
        manualInstructions: form.manualInstructions,
      });
      setForm(saved);
      setSnapshot(saved);
      setMessage(
        'Settings saved. Checkout now charges the fee table shown here.',
      );
      settings.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  const feeInputs = form ? (
    <div className="filter-row">
      {(
        [
          { key: 'dhakaCityMinor', label: 'Dhaka city (poisha)' },
          { key: 'dhakaSubCityMinor', label: 'Dhaka sub city (poisha)' },
          { key: 'outsideDhakaMinor', label: 'Outside Dhaka (poisha)' },
          { key: 'codFeeMinor', label: 'COD fee (poisha)' },
        ] as const
      ).map((field) => (
        <label className="field" key={field.key} style={{ flex: 1, minWidth: 170 }}>
          {field.label}
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="input"
              inputMode="numeric"
              disabled={!canManage}
              value={form.deliveryFees[field.key]}
              onChange={(event) => feeField(field.key)(event.target.value)}
            />
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>
              = {formatMinor(form.deliveryFees[field.key])}
            </span>
          </span>
        </label>
      ))}
    </div>
  ) : null;

  const feesBanner = form ? (
    <p className="note" style={{ marginTop: 0 }}>
      Current stored fees: Dhaka city{' '}
      {formatMinor(form.deliveryFees.dhakaCityMinor)}, sub city{' '}
      {formatMinor(form.deliveryFees.dhakaSubCityMinor)}, outside Dhaka{' '}
      {formatMinor(form.deliveryFees.outsideDhakaMinor)}, COD fee{' '}
      {formatMinor(form.deliveryFees.codFeeMinor)}. Amounts are entered in
      poisha (100 poisha = ৳1).
    </p>
  ) : null;

  const freeDeliveryRow = form ? (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}>
      <Switch
        checked={form.freeDeliveryOffer}
        disabled={!canManage}
        label="Free delivery offer"
        onChange={(value) =>
          setForm({ ...form, freeDeliveryOffer: value })
        }
      />
      <span>
        <strong>Free Delivery Offer</strong>
        <div className="muted">
          When on, delivery is free store wide; the COD fee still applies.
        </div>
      </span>
    </div>
  ) : null;

  return (
    <section>
      <ModuleHeader
        icon={Globe}
        title="Website Management"
        description="The one store settings record behind the storefront: profile, delivery fees charged at checkout, manual payment instructions and the switches checkout and the catalogue enforce."
      >
        {dirty ? <Badge>Unsaved changes</Badge> : null}
        {canManage ? (
          <button
            type="button"
            className="btn"
            disabled={!form || busy || !dirty}
            onClick={() => void save()}
          >
            {busy ? 'Saving...' : 'Save Store Settings'}
          </button>
        ) : null}
      </ModuleHeader>

      {settings.loading ? (
        <LoadingNote label="Loading store settings..." />
      ) : null}
      {settings.error ? (
        <ErrorNote error={settings.error} onRetry={settings.reload} />
      ) : null}
      {!canManage && form ? (
        <p className="note muted">
          Your role can view these settings but cannot change them (the
          settings.manage permission is required).
        </p>
      ) : null}

      {form ? (
        <form onSubmit={(event) => void save(event)}>
          <div className="page-tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                className={`page-tab${tab === item.key ? ' active' : ''}`}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'store' ? (
            <>
              <div className="card">
                <CardHead icon={Store} title="Store Profile" />
                <label className="field">
                  Store name
                  <input
                    className="input"
                    value={form.storeName}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm({ ...form, storeName: event.target.value })
                    }
                  />
                </label>
                <div className="filter-row" style={{ marginTop: 10 }}>
                  <label className="field" style={{ flex: 1, minWidth: 200 }}>
                    Contact email
                    <input
                      className="input"
                      value={form.contactEmail}
                      disabled={!canManage}
                      onChange={(event) =>
                        setForm({ ...form, contactEmail: event.target.value })
                      }
                    />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: 160 }}>
                    Contact phone
                    <input
                      className="input"
                      value={form.contactPhone}
                      disabled={!canManage}
                      onChange={(event) =>
                        setForm({ ...form, contactPhone: event.target.value })
                      }
                    />
                  </label>
                </div>
                {freeDeliveryRow}
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <CardHead icon={Truck} title="Delivery Fees" />
                {feesBanner}
                {feeInputs}
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <CardHead icon={CreditCard} title="Manual Payment Instructions" />
                <p className="note muted" style={{ marginTop: 0 }}>
                  Instructions are set for{' '}
                  {MANUAL_METHODS.map((method) => method.label).join(', ')}.
                  Edit the text for each method in the Payment Instructions
                  tab.
                </p>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() => setTab('payments')}
                >
                  Open Payment Instructions
                </button>
              </div>
            </>
          ) : null}

          {tab === 'payments' ? (
            <div className="card">
              <CardHead icon={CreditCard} title="Manual Payment Instructions" />
              <p className="note muted" style={{ marginTop: 0 }}>
                The text a customer sees when paying by each manual method.
                The receiving number belongs in this text and is your
                decision: until it is written here the method shows its
                placeholder wording. Nothing here types a number in for
                you.
              </p>
              {MANUAL_METHODS.map((method) => {
                const value = form.manualInstructions[method.key] ?? '';
                return (
                  <div key={method.key} style={{ marginTop: 16 }}>
                    <label className="field">
                      <span
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <strong>{method.label}</strong>
                        <span className="badge">{method.key}</span>
                      </span>
                      <textarea
                        className="input"
                        rows={3}
                        maxLength={300}
                        disabled={!canManage}
                        value={value}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            manualInstructions: {
                              ...form.manualInstructions,
                              [method.key]: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <div className="char-count">{value.length} / 300</div>
                  </div>
                );
              })}
              <p className="note muted">
                The settings record stores instruction text only, so there
                is no per method enable flag to switch here: a method with
                instructions written is the method customers can read at
                checkout.
              </p>
            </div>
          ) : null}

          {tab === 'delivery' ? (
            <>
              <div className="card">
                <CardHead icon={Truck} title="Delivery Fees" />
                {feesBanner}
                {feeInputs}
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <CardHead icon={Settings2} title="Quick Settings" />
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 6 }}>
                  <Switch
                    checked={form.allowCod}
                    disabled={!canManage}
                    label="Allow COD"
                    onChange={(value) => setForm({ ...form, allowCod: value })}
                  />
                  <span>
                    <strong>Allow COD</strong>
                    <div className="muted">
                      Enforced at checkout: when off, the checkout path
                      refuses Cash on Delivery orders server side.
                    </div>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}>
                  <Switch
                    checked={form.storeLive}
                    disabled={!canManage}
                    label="Store is Live"
                    onChange={(value) => setForm({ ...form, storeLive: value })}
                  />
                  <span>
                    <strong>Store is Live</strong>
                    <div className="muted">
                      Enforced by the public catalogue and checkout: when
                      off, both return a store closed response.
                    </div>
                  </span>
                </div>
                {freeDeliveryRow}
                <p className="note muted">
                  Enforced at checkout: when on, delivery is free store
                  wide and the COD fee still applies.
                </p>
              </div>
            </>
          ) : null}

          {tab === 'appearance' ? (
            <div className="card">
              <CardHead icon={Palette} title="Appearance" />
              <p className="note muted" style={{ marginTop: 0 }}>
                The public storefront design is fixed and is not edited
                from here. These are the brand values the storefront
                ships with, shown read only.
              </p>
              <div className="filter-row">
                <div>
                  <span
                    className="thumb"
                    style={{ background: '#F4F2ED', width: 56, height: 56 }}
                  />
                  <div style={{ marginTop: 6 }}>
                    <strong>Off-white</strong>
                    <div className="muted">#F4F2ED</div>
                  </div>
                </div>
                <div>
                  <span
                    className="thumb"
                    style={{ background: '#1C1B17', width: 56, height: 56 }}
                  />
                  <div style={{ marginTop: 6 }}>
                    <strong>Warm Black</strong>
                    <div className="muted">#1C1B17</div>
                  </div>
                </div>
                <div>
                  <div className="muted">Logo lockup</div>
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>
                    DOSTELO
                  </div>
                  <div className="muted">
                    D monogram with the DOSTELO wordmark, as shipped in the
                    storefront header and footer.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'pages' ? (
            <div className="card">
              <CardHead icon={FileText} title="Pages and Content" />
              <p className="note muted" style={{ marginTop: 0 }}>
                Legal documents (privacy, terms, returns and the rest) are
                edited in Legal and Compliance, not here.
              </p>
              <Link className="btn-secondary btn-small" href="/legal">
                Open Legal and Compliance
              </Link>
              <p className="note muted">
                Storefront policy note: the Next.js storefront reads
                published legal documents through the public API endpoint
                (GET /v1/legal serves the published copies only). The
                static Pages site keeps its built in text and does not
                read these documents.
              </p>
            </div>
          ) : null}

          {tab === 'seo' ? (
            <div className="card">
              <CardHead icon={Search} title="SEO and Meta" />
              <p className="note muted" style={{ marginTop: 0 }}>
                Per view SEO and meta tags live in the storefront code.
                Nothing is editable here because no settings field backs
                it: the store settings record carries no SEO or meta
                fields.
              </p>
            </div>
          ) : null}

          {tab === 'integrations' ? (
            <div className="card">
              <CardHead icon={Plug} title="Integrations">
                <Link className="btn-secondary btn-small" href="/integrations">
                  Open Integrations
                </Link>
              </CardHead>
              <p className="note muted" style={{ marginTop: 0 }}>
                Configuration state from the API&apos;s own checks. Only
                the names of missing variables are shown; secret values
                never leave the API.
              </p>
              {integrations.loading ? (
                <LoadingNote label="Loading integrations..." />
              ) : null}
              {integrations.error ? (
                <ErrorNote
                  error={integrations.error}
                  onRetry={integrations.reload}
                />
              ) : null}
              {integrations.data &&
              integrations.data.items.length === 0 ? (
                <EmptyNote>No integrations are registered.</EmptyNote>
              ) : null}
              {integrations.data && integrations.data.items.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Integration</th>
                        <th>Category</th>
                        <th>Status</th>
                        <th>Missing variables</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {integrations.data.items.map((item) => (
                        <tr key={item.key}>
                          <td>{item.name}</td>
                          <td>
                            {INTEGRATION_CATEGORY_LABELS[item.category]}
                          </td>
                          <td>
                            <Badge>
                              {item.configured
                                ? 'Configured'
                                : 'Not configured'}
                            </Badge>
                          </td>
                          <td>
                            {item.missing.length > 0
                              ? item.missing.join(', ')
                              : 'None'}
                          </td>
                          <td>{item.note ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'advanced' ? (
            <>
              <div className="card">
                <CardHead icon={Settings2} title="Advanced Settings" />
                <div className="filter-row">
                  <label className="field" style={{ flex: 1, minWidth: 200 }}>
                    Return window (days)
                    <input
                      className="input"
                      inputMode="numeric"
                      disabled={!canManage}
                      value={form.returnWindowDays}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setForm({
                          ...form,
                          returnWindowDays: Number.isFinite(parsed)
                            ? Math.round(parsed)
                            : 0,
                        });
                      }}
                    />
                    <span className="muted">
                      Days after delivery during which a return can be
                      opened. Enforced server side when a return is
                      created.
                    </span>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}>
                  <Switch
                    checked={form.automationLeadEvaluationEnabled}
                    disabled={!canManage}
                    label="Lead evaluation automation"
                    onChange={(value) =>
                      setForm({
                        ...form,
                        automationLeadEvaluationEnabled: value,
                      })
                    }
                  />
                  <span>
                    <strong>Lead evaluation automation</strong>
                    <div className="muted">
                      When off, visitor evaluation creates no new lead
                      candidates. Existing leads are untouched.
                    </div>
                  </span>
                </div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <CardHead icon={Settings2} title="Support SLA Targets" />
                <p className="note muted" style={{ marginTop: 0 }}>
                  First response and resolution targets in hours, by
                  ticket priority. Elapsed time math only: no business
                  hours or holiday calendar exists.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Priority</th>
                        <th>First response (hours)</th>
                        <th>Resolution (hours)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SLA_ROWS.map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>
                            <input
                              className="input"
                              inputMode="numeric"
                              disabled={!canManage}
                              value={form.slaTargets[row.key].firstResponseHours}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                setForm({
                                  ...form,
                                  slaTargets: {
                                    ...form.slaTargets,
                                    [row.key]: {
                                      ...form.slaTargets[row.key],
                                      firstResponseHours: Number.isFinite(parsed)
                                        ? parsed
                                        : 0,
                                    },
                                  },
                                });
                              }}
                            />
                          </td>
                          <td>
                            <input
                              className="input"
                              inputMode="numeric"
                              disabled={!canManage}
                              value={form.slaTargets[row.key].resolutionHours}
                              onChange={(event) => {
                                const parsed = Number(event.target.value);
                                setForm({
                                  ...form,
                                  slaTargets: {
                                    ...form.slaTargets,
                                    [row.key]: {
                                      ...form.slaTargets[row.key],
                                      resolutionHours: Number.isFinite(parsed)
                                        ? parsed
                                        : 0,
                                    },
                                  },
                                });
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="note muted">
                  Loyalty rules on this record (one point per{' '}
                  {form.loyaltyRules.takaPerPoint} taka of delivered order
                  value, one point worth{' '}
                  {formatMinor(form.loyaltyRules.pointValueMinor)}) are
                  managed in the Loyalty module and are not edited here,
                  because the settings update does not carry them.
                </p>
              </div>
            </>
          ) : null}

          <div className="card" style={{ marginTop: 16 }}>
            <CardHead icon={ExternalLink} title="Storefront Preview" />
            <p className="note muted" style={{ marginTop: 0 }}>
              No storefront URL is configured for this admin app (no
              NEXT_PUBLIC_STOREFRONT_URL is defined and the settings
              record carries no public URL), so there is no Open
              Storefront button to show here.
            </p>
            <p className="note muted">
              The preview reflects the real site. Only API read settings
              take effect there: the delivery fees at checkout, the free
              delivery offer, and the COD and store live gates. The
              static Pages site does not read admin settings.
            </p>
          </div>

          {canManage ? (
            <button
              type="submit"
              className="btn"
              disabled={busy || !dirty}
              style={{ marginTop: 20 }}
            >
              {busy ? 'Saving...' : 'Save Store Settings'}
            </button>
          ) : null}
          {message ? (
            <p className="note" style={{ margin: '10px 0 0' }}>
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
