'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  Coins,
  Crown,
  Download,
  Gift,
  History,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  LOYALTY_TRANSACTION_TYPE_LABELS,
  type Customer,
  type LoyaltyTransaction,
  type LoyaltyTransactionType,
  type PointsRule,
} from '@dostelo/types';
import { api, formatDateTime, formatMoney, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import { downloadCsv, toCsv } from '../../../lib/csv';
import { AreaChart, BarChart } from '../../../components/charts';
import {
  CardHead,
  Drawer,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  Switch,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const PAGE_SIZE = 10;

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'rules', label: 'Points Rules' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'members', label: 'Members' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'settings', label: 'Settings' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const ACTIVITY_LABELS: Record<PointsRule['activity'], string> = {
  'completed-order': 'Completed order',
  registration: 'Registration',
  'verified-review': 'Verified review',
  'referral-purchase': 'Referral purchase',
};

const CALCULATION_LABELS: Record<PointsRule['calculation'], string> = {
  'per-amount': 'Per order value',
  fixed: 'Fixed points',
  'one-time': 'One-time award',
};

function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function isEarned(tx: LoyaltyTransaction): boolean {
  return tx.type.startsWith('earned') && tx.delta > 0;
}

function describeRule(rule: PointsRule): string {
  if (rule.calculation === 'per-amount') {
    return `${rule.points} point(s) per ৳${rule.perAmountTaka ?? 0} of order value`;
  }
  if (rule.calculation === 'one-time') {
    return `${rule.points} points, awarded once`;
  }
  return `${rule.points} points per qualifying event`;
}

interface MemberRow {
  customerId: string;
  name: string;
  available: number;
  earned: number;
  redeemed: number;
  lastActivity: string | null;
  orderCount: number | null;
}

export default function LoyaltyPage() {
  const { session } = useAuth();
  const canEdit =
    session.principal?.permissions.includes('marketing.edit') ?? false;

  const [tab, setTab] = useState<TabKey>('overview');

  const ledger = useData((client) => client.listAllLoyaltyTransactions(), []);
  const customers = useData((client) => client.listCustomers(), []);
  const pointRules = useData((client) => client.listPointRules(), []);
  const balances = useData((client) => client.listLoyaltyBalances(), []);
  const settings = useData((client) => client.getLoyaltyRules(), []);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers.data?.items ?? []) {
      map.set(customer.id, customer);
    }
    return map;
  }, [customers.data]);

  const customerName = (id: string): string =>
    customerById.get(id)?.fullName ??
    balances.data?.items.find((entry) => entry.customerId === id)
      ?.customerName ??
    id;

  const txns = useMemo(
    () => ledger.data?.items ?? [],
    [ledger.data],
  );

  const kpis = useMemo(() => {
    const memberIds = new Set<string>();
    let issued = 0;
    let redeemedSum = 0;
    let redemptionCount = 0;
    let expiredSum = 0;
    for (const tx of txns) {
      memberIds.add(tx.customerId);
      if (isEarned(tx)) issued += tx.delta;
      if (tx.type === 'redeemed') {
        redeemedSum += Math.abs(tx.delta);
        redemptionCount += 1;
      }
      if (tx.type === 'expired') expiredSum += Math.abs(tx.delta);
    }
    return {
      members: memberIds.size,
      issued,
      redeemed: redeemedSum,
      redemptions: redemptionCount,
      outstanding: issued - redeemedSum - expiredSum,
    };
  }, [txns]);

  const trend = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const tx of txns) {
      const day = tx.createdAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + tx.delta);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value }));
  }, [txns]);

  const byType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of txns) counts.set(tx.type, (counts.get(tx.type) ?? 0) + 1);
    return [...counts.entries()].map(([type, value]) => ({
      label:
        LOYALTY_TRANSACTION_TYPE_LABELS[type as LoyaltyTransactionType] ??
        type,
      value,
    }));
  }, [txns]);

  const members = useMemo<MemberRow[]>(() => {
    const rows = new Map<string, MemberRow>();
    for (const tx of txns) {
      const row = rows.get(tx.customerId) ?? {
        customerId: tx.customerId,
        name: customerName(tx.customerId),
        available: 0,
        earned: 0,
        redeemed: 0,
        lastActivity: null as string | null,
        orderCount: customerById.get(tx.customerId)?.orderCount ?? null,
      };
      row.available += tx.delta;
      if (isEarned(tx)) row.earned += tx.delta;
      if (tx.type === 'redeemed') row.redeemed += Math.abs(tx.delta);
      if (!row.lastActivity || tx.createdAt > row.lastActivity) {
        row.lastActivity = tx.createdAt;
      }
      rows.set(tx.customerId, row);
    }
    return [...rows.values()].sort((a, b) => b.available - a.available);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, customerById, balances.data]);

  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

  return (
    <section>
      <ModuleHeader
        icon={Crown}
        title="Loyalty and Rewards"
        description="Points rules, member balances and the full points ledger. Every figure here is computed from the recorded ledger entries."
      />

      {ledger.loading ? (
        <LoadingNote label="Loading loyalty ledger..." />
      ) : null}
      {ledger.error ? (
        <ErrorNote error={ledger.error} onRetry={ledger.reload} />
      ) : null}

      {ledger.data ? (
        <div className="kpi-grid">
          <KpiCard
            icon={Users}
            label="Loyalty Members"
            value={String(kpis.members)}
            note="Customers with any ledger activity"
          />
          <KpiCard
            icon={Coins}
            label="Points Issued"
            value={kpis.issued.toLocaleString('en-US')}
            note="Positive earned entries in the ledger"
            tone="green"
          />
          <KpiCard
            icon={Gift}
            label="Points Redeemed"
            value={kpis.redeemed.toLocaleString('en-US')}
            note="Absolute value of redeemed entries"
            tone="blue"
          />
          <KpiCard
            icon={History}
            label="Redemptions"
            value={String(kpis.redemptions)}
            note="Count of redeemed entries"
            tone="orange"
          />
          <KpiCard
            icon={Wallet}
            label="Outstanding Points"
            value={kpis.outstanding.toLocaleString('en-US')}
            note="Issued minus redeemed minus expired"
          />
        </div>
      ) : null}

      <div className="page-tabs" role="tablist" aria-label="Loyalty sections">
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

      {tab === 'overview' ? (
        <>
          <div className="detail-grid">
            <div className="card">
              <CardHead icon={TrendingUp} title="Points Activity Trend" />
              <p className="note muted" style={{ marginTop: 0 }}>
                Net points per day from the ledger (earned minus redeemed,
                expired and adjusted).
              </p>
              {trend.length === 0 ? (
                <EmptyNote>No ledger activity yet.</EmptyNote>
              ) : (
                <AreaChart points={trend} />
              )}
            </div>
            <div className="card">
              <CardHead icon={Gift} title="Reward Redemption by Type" />
              <p className="note muted" style={{ marginTop: 0 }}>
                Ledger entries counted by transaction type.
              </p>
              {byType.length === 0 ? (
                <EmptyNote>No ledger entries yet.</EmptyNote>
              ) : (
                <BarChart points={byType} />
              )}
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <LedgerTable
              title="Recent Points Transactions"
              items={txns}
              customerName={customerName}
            />
          </div>
        </>
      ) : null}

      {tab === 'rules' ? (
        <RulesTab
          rules={pointRules.data?.items ?? []}
          loading={pointRules.loading}
          error={pointRules.error}
          onRetry={pointRules.reload}
          canEdit={canEdit}
          onChanged={pointRules.reload}
        />
      ) : null}

      {tab === 'rewards' ? (
        <div className="card">
          <CardHead icon={Gift} title="Rewards" />
          <p className="note" style={{ marginTop: 0 }}>
            No rewards catalogue exists in the API yet, so there is no
            catalogue to manage here. Redemptions today are staff
            adjustments recorded in the ledger: open a member from the
            Members tab and apply a negative adjustment with a reason, and
            it appears in the ledger as an auditable entry.
          </p>
        </div>
      ) : null}

      {tab === 'members' ? (
        <div className="card">
          <CardHead icon={Users} title="Members">
            <span className="note muted">
              Balances computed from the ledger
            </span>
          </CardHead>
          {ledger.loading ? (
            <LoadingNote label="Loading members..." />
          ) : members.length === 0 ? (
            <EmptyNote>
              No customers have loyalty ledger activity yet.
            </EmptyNote>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="num">Available points</th>
                    <th className="num">Lifetime earned</th>
                    <th className="num">Lifetime redeemed</th>
                    <th className="num">Orders</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr
                      key={member.customerId}
                      className="clickable"
                      onClick={() => setSelectedMember(member)}
                    >
                      <td>{member.name}</td>
                      <td className="num">{member.available}</td>
                      <td className="num">{member.earned}</td>
                      <td className="num">{member.redeemed}</td>
                      <td className="num">{member.orderCount ?? 'Unavailable'}</td>
                      <td>
                        {member.lastActivity
                          ? formatDateTime(member.lastActivity)
                          : 'Unavailable'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'transactions' ? (
        <LedgerTable
          title="All Points Transactions"
          items={txns}
          customerName={customerName}
        />
      ) : null}

      {tab === 'settings' ? (
        <SettingsTab
          settings={settings}
          canEdit={canEdit}
          onSaved={() => {
            settings.reload();
            balances.reload();
          }}
        />
      ) : null}

      {selectedMember ? (
        <MemberDrawer
          member={selectedMember}
          items={txns.filter(
            (tx) => tx.customerId === selectedMember.customerId,
          )}
          canEdit={canEdit}
          onClose={() => setSelectedMember(null)}
          onAdjusted={() => {
            ledger.reload();
            balances.reload();
          }}
        />
      ) : null}
    </section>
  );
}

function LedgerTable({
  title,
  items,
  customerName,
}: {
  title: string;
  items: LoyaltyTransaction[];
  customerName: (id: string) => string;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sorted.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (!needle) return true;
      return (
        tx.id.toLowerCase().includes(needle) ||
        customerName(tx.customerId).toLowerCase().includes(needle) ||
        tx.reason.toLowerCase().includes(needle) ||
        (tx.orderId ?? '').toLowerCase().includes(needle) ||
        (tx.referenceKey ?? '').toLowerCase().includes(needle)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, search, typeFilter]);

  const pageCount = pageCountFor(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, pageCount);
  const pageItems = paginate(filtered, safePage, PAGE_SIZE);

  function exportCsv(): void {
    downloadCsv(
      'loyalty-transactions.csv',
      toCsv(
        ['Transaction ID', 'Customer', 'Type', 'Points', 'Reference', 'Reason', 'Date and Time'],
        filtered.map((tx) => [
          tx.id,
          customerName(tx.customerId),
          LOYALTY_TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type,
          tx.delta,
          tx.orderId ?? tx.referenceKey ?? '',
          tx.reason,
          formatDateTime(tx.createdAt),
        ]),
      ),
    );
  }

  return (
    <div className="card">
      <CardHead icon={History} title={title}>
        <button type="button" className="btn-secondary btn-small" onClick={exportCsv}>
          <Download size={14} /> Export CSV
        </button>
      </CardHead>
      <div className="filter-row" style={{ marginBottom: 12 }}>
        <label className="field">
          Search
          <input
            className="input"
            placeholder="Transaction, customer, reason, reference"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="field">
          Type
          <select
            className="select"
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All types</option>
            {Object.entries(LOYALTY_TRANSACTION_TYPE_LABELS).map(
              ([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyNote>No transactions match.</EmptyNote>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className="num">Points</th>
                  <th>Reference</th>
                  <th>Date and Time</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.id}</td>
                    <td>{customerName(tx.customerId)}</td>
                    <td>
                      <span className="badge">
                        {LOYALTY_TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                      </span>
                    </td>
                    <td className="num">{signed(tx.delta)}</td>
                    <td>{tx.orderId ?? tx.referenceKey ?? tx.reason}</td>
                    <td>{formatDateTime(tx.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span className="note muted">
              {filtered.length} transaction(s)
            </span>
            <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}

function RulesTab({
  rules,
  loading,
  error,
  onRetry,
  canEdit,
  onChanged,
}: {
  rules: PointsRule[];
  loading: boolean;
  error: Parameters<typeof ErrorNote>[0]['error'] | null;
  onRetry: () => void;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<PointsRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleRule(rule: PointsRule, active: boolean): Promise<void> {
    setBusyId(rule.id);
    setToggleError(null);
    try {
      await api.upsertPointRule({
        id: rule.id,
        activity: rule.activity,
        calculation: rule.calculation,
        points: rule.points,
        perAmountTaka: rule.perAmountTaka,
        minOrderMinor: rule.minOrderMinor,
        maxPointsPerOrder: rule.maxPointsPerOrder,
        active,
      });
      onChanged();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setToggleError(uiError.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <CardHead icon={Coins} title="Points Rules">
        {canEdit ? (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
          >
            <Plus size={14} /> Create Rule
          </button>
        ) : null}
      </CardHead>
      <p className="note" style={{ marginTop: 0 }}>
        The four seeded default rules ship inactive. Awards happen only
        while a rule is active, and only from real events: delivered
        orders and verified reviews are wired into the engine today.
        Registration and referral awards are not yet wired in the engine,
        so activating those rules alone will not award points until that
        wiring lands.
      </p>
      {loading ? <LoadingNote label="Loading points rules..." /> : null}
      {error ? <ErrorNote error={error} onRetry={onRetry} /> : null}
      {toggleError ? (
        <p className="form-error" role="alert">
          {toggleError}
        </p>
      ) : null}
      {!loading && rules.length === 0 ? (
        <EmptyNote>No points rules are stored yet.</EmptyNote>
      ) : null}
      {rules.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Calculation</th>
                <th className="num">Min order</th>
                <th className="num">Max points per order</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{ACTIVITY_LABELS[rule.activity]}</td>
                  <td>{describeRule(rule)}</td>
                  <td className="num">
                    {rule.minOrderMinor !== null
                      ? formatMoney({
                          amountMinor: rule.minOrderMinor,
                          currency: 'BDT',
                        })
                      : 'None'}
                  </td>
                  <td className="num">
                    {rule.maxPointsPerOrder ?? 'No cap'}
                  </td>
                  <td>
                    <Switch
                      checked={rule.active}
                      disabled={!canEdit || busyId === rule.id}
                      label={`Active for ${ACTIVITY_LABELS[rule.activity]}`}
                      onChange={(value) => void toggleRule(rule, value)}
                    />
                  </td>
                  <td>
                    {canEdit ? (
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => {
                          setEditing(rule);
                          setCreating(false);
                        }}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!canEdit ? (
        <p className="note muted">
          Your role cannot change points rules (the marketing.edit
          permission is required).
        </p>
      ) : null}
      {canEdit && (creating || editing) ? (
        <RuleForm
          key={editing?.id ?? 'new'}
          rule={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function RuleForm({
  rule,
  onClose,
  onSaved,
}: {
  rule: PointsRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [activity, setActivity] = useState<PointsRule['activity']>(
    rule?.activity ?? 'completed-order',
  );
  const [calculation, setCalculation] = useState<PointsRule['calculation']>(
    rule?.calculation ?? 'per-amount',
  );
  const [points, setPoints] = useState(String(rule?.points ?? 1));
  const [perAmountTaka, setPerAmountTaka] = useState(
    rule?.perAmountTaka !== null && rule?.perAmountTaka !== undefined
      ? String(rule.perAmountTaka)
      : '100',
  );
  const [minOrderTaka, setMinOrderTaka] = useState(
    rule?.minOrderMinor !== null && rule?.minOrderMinor !== undefined
      ? String(rule.minOrderMinor / 100)
      : '',
  );
  const [maxPoints, setMaxPoints] = useState(
    rule?.maxPointsPerOrder !== null && rule?.maxPointsPerOrder !== undefined
      ? String(rule.maxPointsPerOrder)
      : '',
  );
  const [active, setActive] = useState(rule?.active ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    const parsedPoints = Number(points);
    if (!Number.isInteger(parsedPoints) || parsedPoints < 0) {
      setError('Enter a whole number of points, zero or more.');
      return;
    }
    let parsedPerAmount: number | null = null;
    if (calculation === 'per-amount') {
      parsedPerAmount = Number(perAmountTaka);
      if (!Number.isInteger(parsedPerAmount) || parsedPerAmount <= 0) {
        setError('Enter a whole taka amount above zero for the per-amount step.');
        return;
      }
    }
    let minOrderMinor: number | null = null;
    if (minOrderTaka.trim() !== '') {
      const parsed = Number(minOrderTaka);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Minimum order value must be zero or more.');
        return;
      }
      minOrderMinor = Math.round(parsed * 100);
    }
    let maxPointsPerOrder: number | null = null;
    if (maxPoints.trim() !== '') {
      const parsed = Number(maxPoints);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError('Maximum points per order must be a whole number above zero, or blank for no cap.');
        return;
      }
      maxPointsPerOrder = parsed;
    }
    setBusy(true);
    setError(null);
    try {
      await api.upsertPointRule({
        ...(rule ? { id: rule.id } : {}),
        activity,
        calculation,
        points: parsedPoints,
        perAmountTaka: parsedPerAmount,
        minOrderMinor,
        maxPointsPerOrder,
        active,
      });
      onSaved();
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
    <form
      onSubmit={save}
      className="card"
      style={{ marginTop: 16, background: 'var(--adm-surface-muted, #F7F5F0)' }}
    >
      <CardHead
        icon={Pencil}
        title={rule ? 'Edit Points Rule' : 'Create Points Rule'}
      >
        <button type="button" className="btn-secondary btn-small" onClick={onClose}>
          Cancel
        </button>
      </CardHead>
      <div className="filter-row">
        <label className="field">
          Activity type
          <select
            className="select"
            value={activity}
            onChange={(event) =>
              setActivity(event.target.value as PointsRule['activity'])
            }
          >
            {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Points
          <input
            className="input"
            inputMode="numeric"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
          />
        </label>
        {calculation === 'per-amount' ? (
          <label className="field">
            Per amount (taka)
            <input
              className="input"
              inputMode="numeric"
              value={perAmountTaka}
              onChange={(event) => setPerAmountTaka(event.target.value)}
            />
          </label>
        ) : null}
      </div>
      <fieldset style={{ border: 'none', padding: 0, margin: '12px 0' }}>
        <legend className="note" style={{ fontWeight: 600 }}>
          Earning rule
        </legend>
        {(
          Object.entries(CALCULATION_LABELS) as [
            PointsRule['calculation'],
            string,
          ][]
        ).map(([key, label]) => (
          <label
            key={key}
            style={{ display: 'inline-flex', gap: 6, marginRight: 16, alignItems: 'center' }}
          >
            <input
              type="radio"
              name="calculation"
              checked={calculation === key}
              onChange={() => setCalculation(key)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="filter-row">
        <label className="field">
          Minimum order value (taka)
          <input
            className="input"
            inputMode="decimal"
            placeholder="No minimum"
            value={minOrderTaka}
            onChange={(event) => setMinOrderTaka(event.target.value)}
          />
        </label>
        <label className="field">
          Maximum points per order
          <input
            className="input"
            inputMode="numeric"
            placeholder="No cap"
            value={maxPoints}
            onChange={(event) => setMaxPoints(event.target.value)}
          />
        </label>
        <label className="field">
          Status
          <span>
            <Switch checked={active} onChange={setActive} label="Rule active" />{' '}
            {active ? 'Active' : 'Inactive'}
          </span>
        </label>
      </div>
      <p className="note muted">
        This rule type has no start or end date fields in the API, so the
        rule applies from when it is saved until it is switched off.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Saving...' : 'Save rule'}
      </button>
    </form>
  );
}

function MemberDrawer({
  member,
  items,
  canEdit,
  onClose,
  onAdjusted,
}: {
  member: MemberRow;
  items: LoyaltyTransaction[];
  canEdit: boolean;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const history = useMemo(
    () => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items],
  );

  async function apply(event: FormEvent): Promise<void> {
    event.preventDefault();
    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setError('Enter a non-zero whole number of points.');
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required for every adjustment.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.adjustLoyalty(member.customerId, {
        delta: parsed,
        reason: reason.trim(),
      });
      setDelta('');
      setReason('');
      setMessage('Adjustment recorded in the ledger.');
      onAdjusted();
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
    <Drawer title={member.name} onClose={onClose}>
      <dl className="kv">
        <dt>Available points</dt>
        <dd>{member.available}</dd>
        <dt>Lifetime earned</dt>
        <dd>{member.earned}</dd>
        <dt>Lifetime redeemed</dt>
        <dd>{member.redeemed}</dd>
        <dt>Orders</dt>
        <dd>{member.orderCount ?? 'Unavailable'}</dd>
        <dt>Last activity</dt>
        <dd>
          {member.lastActivity ? formatDateTime(member.lastActivity) : 'Unavailable'}
        </dd>
      </dl>

      <h3 style={{ fontSize: 15 }}>Transaction history</h3>
      {history.length === 0 ? (
        <EmptyNote>No ledger entries for this customer.</EmptyNote>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th className="num">Points</th>
                <th>Reference</th>
                <th>Date and Time</th>
              </tr>
            </thead>
            <tbody>
              {history.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <span className="badge">
                      {LOYALTY_TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                    </span>
                  </td>
                  <td className="num">{signed(tx.delta)}</td>
                  <td>{tx.orderId ?? tx.referenceKey ?? tx.reason}</td>
                  <td>{formatDateTime(tx.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ fontSize: 15 }}>Staff adjustment</h3>
      <p className="note muted" style={{ marginTop: 0 }}>
        Adjustments are recorded in the ledger and audited server-side.
        Use a negative delta to record a redemption.
      </p>
      {canEdit ? (
        <form onSubmit={apply}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ width: 120 }}
              inputMode="numeric"
              placeholder="+/- points"
              value={delta}
              onChange={(event) => setDelta(event.target.value)}
              aria-label="Point adjustment"
            />
            <input
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              placeholder="Reason (required)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-label="Adjustment reason"
            />
            <button type="submit" className="btn btn-small" disabled={busy}>
              {busy ? 'Saving...' : 'Apply adjustment'}
            </button>
          </div>
          {message ? <p className="note">{message}</p> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="note muted">
          Your role cannot adjust points (the marketing.edit permission is
          required).
        </p>
      )}
    </Drawer>
  );
}

function SettingsTab({
  settings,
  canEdit,
  onSaved,
}: {
  settings: ReturnType<typeof useData<{ takaPerPoint: number; pointValueMinor: number }>>;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [takaPerPoint, setTakaPerPoint] = useState('');
  const [pointValue, setPointValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    const taka = Number(takaPerPoint || settings.data?.takaPerPoint);
    const value = Number(pointValue || settings.data?.pointValueMinor);
    if (!Number.isInteger(taka) || taka <= 0 || !Number.isInteger(value) || value < 0) {
      setError('Enter a whole taka-per-point above zero and a point value of zero or more poisha.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.updateLoyaltyRules({
        takaPerPoint: taka,
        pointValueMinor: value,
      });
      setMessage(
        `Settings saved: 1 point per ৳${saved.takaPerPoint} of delivered orders, 1 point worth ${formatMoney({ amountMinor: saved.pointValueMinor, currency: 'BDT' })}.`,
      );
      onSaved();
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
    <div className="card" style={{ maxWidth: 760 }}>
      <CardHead icon={SettingsIcon} title="Valuation Settings" />
      {settings.loading ? <LoadingNote label="Loading settings..." /> : null}
      {settings.error ? (
        <ErrorNote error={settings.error} onRetry={settings.reload} />
      ) : null}
      {settings.data ? (
        <p className="note muted" style={{ marginTop: 0 }}>
          Current: 1 point per ৳{settings.data.takaPerPoint} of delivered
          order value. One point is worth{' '}
          {formatMoney({
            amountMinor: settings.data.pointValueMinor,
            currency: 'BDT',
          })}{' '}
          when redeemed.
        </p>
      ) : null}
      {canEdit ? (
        <form onSubmit={save}>
          <div className="filter-row">
            <label className="field">
              Taka per point
              <input
                className="input"
                inputMode="numeric"
                placeholder={String(settings.data?.takaPerPoint ?? '')}
                value={takaPerPoint}
                onChange={(event) => setTakaPerPoint(event.target.value)}
              />
            </label>
            <label className="field">
              Point value (poisha)
              <input
                className="input"
                inputMode="numeric"
                placeholder={String(settings.data?.pointValueMinor ?? '')}
                value={pointValue}
                onChange={(event) => setPointValue(event.target.value)}
              />
            </label>
          </div>
          <button type="submit" className="btn" disabled={busy} style={{ marginTop: 12 }}>
            {busy ? 'Saving...' : 'Save settings'}
          </button>
          {message ? <p className="note">{message}</p> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="note muted">
          Your role cannot change these settings (the marketing.edit
          permission is required).
        </p>
      )}
      <p className="note" style={{ marginTop: 16 }}>
        Points expiration is not automated: no scheduled job applies
        expiry, so expired entries only appear in the ledger when staff
        record them.
      </p>
    </div>
  );
}
