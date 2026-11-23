'use client';

import { useState, type FormEvent } from 'react';
import { api, formatDateTime, formatMoney, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Loyalty & Rewards: the points rules, and per-customer balances
 * derived by the API from delivered orders at those rules plus
 * recorded staff adjustments. Balances are never stored, so the
 * numbers here always match the orders on record; adjustments
 * are the only stored loyalty records and they are audited.
 */
export default function LoyaltyPage() {
  const { session } = useAuth();
  const canEdit =
    session.principal?.permissions.includes('marketing.edit') ?? false;

  const [takaPerPoint, setTakaPerPoint] = useState('');
  const [pointValue, setPointValue] = useState('');
  const [rulesMessage, setRulesMessage] = useState<string | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [delta, setDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = useData((client) => client.getLoyaltyRules(), []);
  const balances = useData((client) => client.listLoyaltyBalances(), []);
  const transactions = useData(
    (client) =>
      selectedCustomerId
        ? client.listLoyaltyTransactions(selectedCustomerId)
        : Promise.resolve({ items: [] }),
    [selectedCustomerId],
  );

  const selectedBalance =
    balances.data?.items.find(
      (entry) => entry.customerId === selectedCustomerId,
    ) ?? null;

  async function saveRules(event: FormEvent): Promise<void> {
    event.preventDefault();
    const taka = Number(takaPerPoint || rules.data?.takaPerPoint);
    const value = Number(pointValue || rules.data?.pointValueMinor);
    if (!Number.isInteger(taka) || taka <= 0 || !Number.isInteger(value) || value < 0) {
      setRulesError('Enter a whole taka-per-point above zero and a point value of zero or more poisha.');
      return;
    }
    setBusy(true);
    setRulesError(null);
    setRulesMessage(null);
    try {
      const saved = await api.updateLoyaltyRules({
        takaPerPoint: taka,
        pointValueMinor: value,
      });
      setRulesMessage(
        `Rules saved: 1 point per ৳${saved.takaPerPoint} of delivered orders, 1 point worth ${formatMoney({ amountMinor: saved.pointValueMinor, currency: 'BDT' })}. Balances re-derive from these rules immediately.`,
      );
      rules.reload();
      balances.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setRulesError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyAdjustment(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedCustomerId) return;
    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setAdjustError('Enter a non-zero whole number of points.');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('A reason is required for every adjustment.');
      return;
    }
    setBusy(true);
    setAdjustError(null);
    try {
      await api.adjustLoyalty(selectedCustomerId, {
        delta: parsed,
        reason: adjustReason.trim(),
      });
      setDelta('');
      setAdjustReason('');
      balances.reload();
      transactions.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setAdjustError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title="Loyalty & Rewards" />
      <div className="card" style={{ maxWidth: 760 }}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>Points rules</h2>
        {rules.loading ? <LoadingNote label="Loading rules..." /> : null}
        {rules.error ? (
          <ErrorNote error={rules.error} onRetry={rules.reload} />
        ) : null}
        {rules.data ? (
          <p className="note muted" style={{ marginTop: 0 }}>
            Current: 1 point per ৳{rules.data.takaPerPoint} of delivered
            order value. One point is worth{' '}
            {formatMoney({
              amountMinor: rules.data.pointValueMinor,
              currency: 'BDT',
            })}{' '}
            when redeemed.
          </p>
        ) : null}
        {canEdit ? (
          <form onSubmit={saveRules}>
            <div className="toolbar">
              <label className="field">
                Taka per point
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder={String(rules.data?.takaPerPoint ?? '')}
                  value={takaPerPoint}
                  onChange={(event) => setTakaPerPoint(event.target.value)}
                />
              </label>
              <label className="field">
                Point value (poisha)
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder={String(rules.data?.pointValueMinor ?? '')}
                  value={pointValue}
                  onChange={(event) => setPointValue(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="btn btn-small"
                disabled={busy}
              >
                {busy ? 'Saving...' : 'Save rules'}
              </button>
            </div>
            {rulesMessage ? (
              <p className="note" style={{ margin: '8px 0 0' }}>
                {rulesMessage}
              </p>
            ) : null}
            {rulesError ? (
              <p className="form-error" role="alert">
                {rulesError}
              </p>
            ) : null}
          </form>
        ) : (
          <p className="note muted">
            Your role cannot change the rules (the marketing.edit
            permission is required).
          </p>
        )}
      </div>

      <h2 style={{ fontSize: 17, marginTop: 24 }}>Customer balances</h2>
      {balances.loading ? (
        <LoadingNote label="Loading balances..." />
      ) : null}
      {balances.error ? (
        <ErrorNote error={balances.error} onRetry={balances.reload} />
      ) : null}
      {balances.data && balances.data.items.length === 0 ? (
        <EmptyNote>No customers yet, so no balances to show.</EmptyNote>
      ) : null}
      {balances.data && balances.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="num">Delivered spend</th>
                <th className="num">Earned</th>
                <th className="num">Adjustments</th>
                <th className="num">Balance</th>
                <th className="num">Worth</th>
              </tr>
            </thead>
            <tbody>
              {balances.data.items.map((entry) => (
                <tr
                  key={entry.customerId}
                  className="clickable"
                  onClick={() => {
                    setSelectedCustomerId(entry.customerId);
                    setAdjustError(null);
                  }}
                >
                  <td>{entry.customerName}</td>
                  <td className="num">{formatMoney(entry.deliveredSpend)}</td>
                  <td className="num">{entry.earnedPoints}</td>
                  <td className="num">{entry.adjustmentPoints}</td>
                  <td className="num">{entry.balancePoints}</td>
                  <td className="num">{formatMoney(entry.balanceValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedBalance ? (
        <div className="card" style={{ marginTop: 20, maxWidth: 760 }}>
          <h2 style={{ fontSize: 17, marginTop: 0 }}>
            {selectedBalance.customerName}: {selectedBalance.balancePoints}{' '}
            points
          </h2>
          {transactions.data && transactions.data.items.length > 0 ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th className="num">Points</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td className="num">
                        {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                      </td>
                      <td>{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="note muted">
              No staff adjustments recorded for this customer. The balance
              above comes entirely from delivered orders.
            </p>
          )}
          {canEdit ? (
            <form onSubmit={applyAdjustment} style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="input"
                  style={{ width: 110, marginTop: 0 }}
                  inputMode="numeric"
                  placeholder="+/- points"
                  value={delta}
                  onChange={(event) => setDelta(event.target.value)}
                  aria-label="Point adjustment"
                />
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 180, marginTop: 0 }}
                  placeholder="Reason (required)"
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  aria-label="Adjustment reason"
                />
                <button
                  type="submit"
                  className="btn btn-small"
                  disabled={busy}
                >
                  {busy ? 'Saving...' : 'Apply adjustment'}
                </button>
              </div>
              {adjustError ? (
                <p className="form-error" role="alert">
                  {adjustError}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
