'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { StoreSettingsView } from '@dostelo/types';
import { api, formatMinor, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

const MANUAL_METHODS = ['bkash', 'nagad', 'rocket', 'upay'] as const;

/**
 * Website Management: the store settings editor over the API's
 * StoreSettings record. The delivery fee table saved here is
 * the table checkout charges, and the free-delivery offer
 * switch is the one checkout reads, so what is saved here is
 * what customers are charged. Every save is audited server-side.
 */
export default function WebsitePage() {
  const { session } = useAuth();
  const canManage =
    session.principal?.permissions.includes('settings.manage') ?? false;
  const settings = useData((client) => client.getStoreSettings(), []);

  const [form, setForm] = useState<StoreSettingsView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data && !form) setForm(settings.data);
  }, [settings.data, form]);

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

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.updateStoreSettings({
        storeName: form.storeName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        freeDeliveryOffer: form.freeDeliveryOffer,
        deliveryFees: form.deliveryFees,
        manualInstructions: form.manualInstructions,
      });
      setForm(saved);
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

  return (
    <section>
      <PageHeader title="Website Management" />
      {settings.loading ? (
        <LoadingNote label="Loading store settings..." />
      ) : null}
      {settings.error ? (
        <ErrorNote error={settings.error} onRetry={settings.reload} />
      ) : null}
      {form ? (
        <form onSubmit={save} style={{ maxWidth: 760 }}>
          <div className="card">
            <h2 style={{ fontSize: 17, marginTop: 0 }}>Store profile</h2>
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
            <div className="toolbar" style={{ marginTop: 10 }}>
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
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginTop: 14,
              }}
            >
              <input
                type="checkbox"
                checked={form.freeDeliveryOffer}
                disabled={!canManage}
                onChange={(event) =>
                  setForm({
                    ...form,
                    freeDeliveryOffer: event.target.checked,
                  })
                }
              />
              Free delivery offer switch (when on, delivery is free store
              wide; the COD fee still applies)
            </label>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 17, marginTop: 0 }}>
              Delivery fees charged at checkout
            </h2>
            <p className="note muted" style={{ marginTop: 0 }}>
              Amounts are in poisha (100 poisha = ৳1). Current: Dhaka city{' '}
              {formatMinor(form.deliveryFees.dhakaCityMinor)}, sub city{' '}
              {formatMinor(form.deliveryFees.dhakaSubCityMinor)}, outside
              Dhaka {formatMinor(form.deliveryFees.outsideDhakaMinor)}, COD
              fee {formatMinor(form.deliveryFees.codFeeMinor)}.
            </p>
            <div className="toolbar">
              <label className="field">
                Dhaka city
                <input
                  className="input"
                  inputMode="numeric"
                  disabled={!canManage}
                  value={form.deliveryFees.dhakaCityMinor}
                  onChange={(event) =>
                    feeField('dhakaCityMinor')(event.target.value)
                  }
                />
              </label>
              <label className="field">
                Dhaka sub city
                <input
                  className="input"
                  inputMode="numeric"
                  disabled={!canManage}
                  value={form.deliveryFees.dhakaSubCityMinor}
                  onChange={(event) =>
                    feeField('dhakaSubCityMinor')(event.target.value)
                  }
                />
              </label>
              <label className="field">
                Outside Dhaka
                <input
                  className="input"
                  inputMode="numeric"
                  disabled={!canManage}
                  value={form.deliveryFees.outsideDhakaMinor}
                  onChange={(event) =>
                    feeField('outsideDhakaMinor')(event.target.value)
                  }
                />
              </label>
              <label className="field">
                COD fee
                <input
                  className="input"
                  inputMode="numeric"
                  disabled={!canManage}
                  value={form.deliveryFees.codFeeMinor}
                  onChange={(event) =>
                    feeField('codFeeMinor')(event.target.value)
                  }
                />
              </label>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 17, marginTop: 0 }}>
              Manual payment instructions
            </h2>
            <p className="note muted" style={{ marginTop: 0 }}>
              The text a customer sees when paying by each manual method.
              The receiving number belongs in this text; until it is
              written here the method shows its placeholder wording.
            </p>
            {MANUAL_METHODS.map((method) => (
              <label className="field" key={method} style={{ marginTop: 10 }}>
                {method}
                <textarea
                  className="input"
                  rows={2}
                  disabled={!canManage}
                  value={form.manualInstructions[method] ?? ''}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      manualInstructions: {
                        ...form.manualInstructions,
                        [method]: event.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>

          {canManage ? (
            <button
              type="submit"
              className="btn"
              disabled={busy}
              style={{ marginTop: 20 }}
            >
              {busy ? 'Saving...' : 'Save store settings'}
            </button>
          ) : (
            <p className="note muted" style={{ marginTop: 20 }}>
              Your role can view these settings but cannot change them
              (the settings.manage permission is required).
            </p>
          )}
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
