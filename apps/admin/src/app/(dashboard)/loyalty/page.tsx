'use client';

import { useState, type FormEvent } from 'react';
import { Crown, Plus } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote,
  Modal, ModuleHeader, StatCard, StatGrid, TextInput, Unavailable,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';

/* Loyalty & Rewards, completed: balances and transactions from
   the loyalty API, the earn rules, the points rules, the rewards
   catalogue, redemption records, tier management, referral codes
   and points expiration visibility. The four seeded points rules
   stay INACTIVE until a staff member activates one here, exactly
   as before; this page loads their stored state and never flips
   it on its own. Manual adjustments are audited by the API. */
export default function LoyaltyPage() {
  const balances = useData((c) => c.listLoyaltyBalances());
  const transactions = useData((c) => c.listAllLoyaltyTransactions());
  const rules = useData((c) => c.getLoyaltyRules());
  const pointRules = useData((c) => c.listPointRules());
  const rewards = useData((c) => c.gap.listRewards());
  const redemptions = useData((c) => c.gap.listRedemptions());
  const tiers = useData((c) => c.gap.listTiers());
  const referrals = useData((c) => c.gap.listReferrals());
  const action = useAction();

  const [adjusting, setAdjusting] = useState('');
  const [adjustForm, setAdjustForm] = useState({ points: '', reason: '' });
  const [rulesForm, setRulesForm] = useState({ pointsPerTaka: '', redemptionValue: '' });
  const [showReward, setShowReward] = useState(false);
  const [rewardForm, setRewardForm] = useState({ name: '', pointsCost: '', description: '' });
  const [showTier, setShowTier] = useState(false);
  const [tierForm, setTierForm] = useState({ name: '', minPoints: '', benefits: '' });
  const [newRule, setNewRule] = useState({ key: '', points: '', description: '' });

  const balanceItems = itemsOf(balances.data);
  const transactionItems = itemsOf(transactions.data);
  const ruleItems = itemsOf(pointRules.data);
  const rulesRec = asRec(rules.data);
  const rewardItems = rewards.data ? itemsOf(rewards.data) : [];
  const redemptionItems = redemptions.data ? itemsOf(redemptions.data) : [];
  const tierItems = tiers.data ? itemsOf(tiers.data) : [];
  const referralItems = referrals.data ? itemsOf(referrals.data) : [];
  const expiring = transactionItems.filter((r) => str(r.type).includes('expir') || Boolean(r.expiresAt));

  async function adjust(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run((c) =>
      c.adjustLoyalty(adjusting, { points: Number(adjustForm.points), reason: adjustForm.reason }),
    );
    if (ok) {
      setAdjusting('');
      balances.reload();
      transactions.reload();
    }
  }

  async function saveRules(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { ...rulesRec };
    if (rulesForm.pointsPerTaka) dto.pointsPerTaka = Number(rulesForm.pointsPerTaka);
    if (rulesForm.redemptionValue) dto.redemptionValueMinorPerPoint = Math.round(Number(rulesForm.redemptionValue) * 100);
    if (await action.run((c) => c.updateLoyaltyRules(dto))) rules.reload();
  }

  async function toggleRule(row: Record<string, unknown>) {
    const dto = { ...row, active: row.active !== true };
    if (await action.run((c) => c.upsertPointRule(dto))) pointRules.reload();
  }

  async function addRule(event: FormEvent) {
    event.preventDefault();
    const dto = { key: newRule.key, points: Number(newRule.points), description: newRule.description, active: false };
    if (await action.run((c) => c.upsertPointRule(dto))) {
      setNewRule({ key: '', points: '', description: '' });
      pointRules.reload();
    }
  }

  async function saveReward(event: FormEvent) {
    event.preventDefault();
    const dto = { name: rewardForm.name, pointsCost: Number(rewardForm.pointsCost), description: rewardForm.description };
    if (await action.run((c) => c.gap.saveReward(dto))) {
      setShowReward(false);
      rewards.reload();
    }
  }

  async function saveTier(event: FormEvent) {
    event.preventDefault();
    const dto = { name: tierForm.name, minPoints: Number(tierForm.minPoints), benefits: tierForm.benefits };
    if (await action.run((c) => c.gap.saveTier(dto))) {
      setShowTier(false);
      tiers.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Crown}
        title="Loyalty & Rewards"
        description="Points balances, the rewards catalogue, redemptions, tiers, referral codes, earn rules and expiration visibility, all from the loyalty API."
      >
        <button type="button" className="btn secondary" onClick={() => setShowTier(true)}>New tier</button>
        <button type="button" className="btn" onClick={() => setShowReward(true)}>
          <Plus size={15} /> New reward
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Customers with balances" value={balances.loading ? '...' : String(balanceItems.length)} />
        <StatCard label="Points outstanding" value={String(balanceItems.reduce((s, r) => s + num(r.balance ?? r.points), 0))} />
        <StatCard label="Transactions" value={transactions.loading ? '...' : String(transactionItems.length)} />
        <StatCard label="Redemptions" value={redemptions.data === null ? 'Unavailable' : String(redemptionItems.length)} />
        <StatCard label="Active points rules" value={String(ruleItems.filter((r) => r.active === true).length)} note="Seeded rules stay inactive until activated here" />
      </StatGrid>

      <div className="section-grid">
        <Card title="Earn rules">
          {rules.loading ? (
            <LoadingNote />
          ) : rules.error ? (
            <ErrorNote error={rules.error} onRetry={rules.reload} />
          ) : (
            <form onSubmit={saveRules}>
              <KeyValues
                entries={[
                  ['Points per taka', String(rulesRec.pointsPerTaka ?? '')],
                  ['Registration award wired', rulesRec.registrationAward === true ? 'Yes' : 'Not wired in the stored rules'],
                ]}
              />
              <div className="form-grid" style={{ marginTop: 12 }}>
                <Field label="Points per taka (new value)">
                  <TextInput type="number" min={0} step="0.01" value={rulesForm.pointsPerTaka} onChange={(e) => setRulesForm({ ...rulesForm, pointsPerTaka: e.target.value })} />
                </Field>
                <Field label="Redemption value per point (BDT)">
                  <TextInput type="number" min={0} step="0.01" value={rulesForm.redemptionValue} onChange={(e) => setRulesForm({ ...rulesForm, redemptionValue: e.target.value })} />
                </Field>
              </div>
              <button type="submit" className="btn" disabled={action.busy}>Save earn rules</button>
            </form>
          )}
        </Card>
        <Card title="Points rules (seeded rules start inactive)">
          {pointRules.loading ? (
            <LoadingNote />
          ) : pointRules.error ? (
            <ErrorNote error={pointRules.error} onRetry={pointRules.reload} />
          ) : (
            <>
              <DataTable
                searchable={false}
                emptyText="No points rules stored."
                columns={[
                  { key: 'key', label: 'Rule' },
                  { key: 'points', label: 'Points' },
                  { key: 'active', label: 'State', render: (r) => <Badge tone={r.active === true ? 'ok' : 'warn'}>{r.active === true ? 'Active' : 'Inactive'}</Badge> },
                  {
                    key: 'toggle', label: 'Action',
                    render: (r) => (
                      <button type="button" className="btn secondary small" disabled={action.busy} onClick={() => void toggleRule(r)}>
                        {r.active === true ? 'Deactivate' : 'Activate'}
                      </button>
                    ),
                  },
                ]}
                rows={ruleItems}
              />
              <form onSubmit={addRule} style={{ marginTop: 12 }}>
                <div className="form-grid">
                  <Field label="New rule key">
                    <TextInput required value={newRule.key} onChange={(e) => setNewRule({ ...newRule, key: e.target.value })} placeholder="birthday-bonus" />
                  </Field>
                  <Field label="Points">
                    <TextInput type="number" required value={newRule.points} onChange={(e) => setNewRule({ ...newRule, points: e.target.value })} />
                  </Field>
                  <Field label="Description">
                    <TextInput value={newRule.description} onChange={(e) => setNewRule({ ...newRule, description: e.target.value })} />
                  </Field>
                </div>
                <button type="submit" className="btn secondary" disabled={action.busy}>Add rule (starts inactive)</button>
              </form>
            </>
          )}
        </Card>
      </div>

      <div className="section-grid">
        <Card title="Rewards catalogue">
          {rewards.loading ? (
            <LoadingNote />
          ) : rewards.data === null ? (
            <Unavailable title="The rewards catalogue is not available on the running API yet.">
              This panel needs GET and POST /v1/admin/loyalty/rewards. No reward is listed until the
              API stores one.
            </Unavailable>
          ) : (
            <DataTable
              searchable={false}
              emptyText="No rewards in the catalogue yet."
              columns={[
                { key: 'name', label: 'Reward' },
                { key: 'pointsCost', label: 'Points cost' },
                { key: 'status', label: 'Status', render: (r) => <Badge>{str(r.status ?? (r.active === false ? 'inactive' : 'active'))}</Badge> },
              ]}
              rows={rewardItems}
            />
          )}
        </Card>
        <Card title="Tiers">
          {tiers.loading ? (
            <LoadingNote />
          ) : tiers.data === null ? (
            <Unavailable title="Tier management is not available on the running API yet.">
              This panel needs GET and POST /v1/admin/loyalty/tiers.
            </Unavailable>
          ) : (
            <DataTable
              searchable={false}
              emptyText="No tiers defined yet."
              columns={[
                { key: 'name', label: 'Tier' },
                { key: 'minPoints', label: 'From points' },
                { key: 'benefits', label: 'Benefits' },
              ]}
              rows={tierItems}
            />
          )}
        </Card>
      </div>

      <Card title="Redemptions">
        {redemptions.loading ? (
          <LoadingNote />
        ) : redemptions.data === null ? (
          <Unavailable title="Redemption records are not available on the running API yet.">
            This panel needs GET /v1/admin/loyalty/redemptions.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No redemptions recorded yet."
            columns={[
              { key: 'id', label: 'Redemption' },
              { key: 'customerId', label: 'Customer' },
              { key: 'rewardName', label: 'Reward', render: (r) => str(r.rewardName ?? r.rewardId) },
              { key: 'pointsSpent', label: 'Points spent' },
              { key: 'status', label: 'Status' },
              { key: 'createdAt', label: 'When', date: true },
            ]}
            rows={redemptionItems}
          />
        )}
      </Card>

      <Card title="Referral codes">
        {referrals.loading ? (
          <LoadingNote />
        ) : referrals.data === null ? (
          <Unavailable title="Referral codes are not available on the running API yet.">
            This panel needs GET /v1/admin/loyalty/referrals. No code is displayed until the API
            issues one to a customer.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No referral codes issued yet."
            columns={[
              { key: 'code', label: 'Code' },
              { key: 'customerId', label: 'Owner' },
              { key: 'uses', label: 'Uses' },
              { key: 'pointsEarned', label: 'Points earned' },
            ]}
            rows={referralItems}
          />
        )}
      </Card>

      <Card title="Customer balances">
        {balances.loading ? (
          <LoadingNote />
        ) : balances.error ? (
          <ErrorNote error={balances.error} onRetry={balances.reload} />
        ) : (
          <DataTable
            emptyText="No loyalty balances yet. Balances derive from delivered orders under the earn rules."
            columns={[
              { key: 'customerId', label: 'Customer' },
              { key: 'balance', label: 'Points balance', render: (r) => String(num(r.balance ?? r.points)) },
              { key: 'lifetimeEarned', label: 'Lifetime earned' },
              { key: 'tier', label: 'Tier', render: (r) => str(r.tier) || 'Base' },
              {
                key: 'adjust', label: 'Action',
                render: (r) => (
                  <button type="button" className="btn secondary small" onClick={() => setAdjusting(str(r.customerId))}>Adjust</button>
                ),
              },
            ]}
            rows={balanceItems}
          />
        )}
      </Card>

      <Card title="Transactions and expiration">
        {transactions.loading ? (
          <LoadingNote />
        ) : transactions.error ? (
          <ErrorNote error={transactions.error} onRetry={transactions.reload} />
        ) : (
          <>
            <DataTable
              emptyText="No loyalty transactions yet."
              columns={[
                { key: 'createdAt', label: 'When', date: true },
                { key: 'customerId', label: 'Customer' },
                { key: 'type', label: 'Type' },
                { key: 'points', label: 'Points' },
                { key: 'reason', label: 'Reason' },
                { key: 'expiresAt', label: 'Expires', date: true },
              ]}
              rows={transactionItems}
            />
            <p className="note">
              {expiring.length} loaded transaction{expiring.length === 1 ? '' : 's'} carry an
              expiration. Expired points are removed by the API under the stored rules; balances
              above already reflect that.
            </p>
          </>
        )}
      </Card>

      {adjusting ? (
        <Modal title="Adjust points (audited)" onClose={() => setAdjusting('')}>
          <form onSubmit={adjust}>
            <ActionError error={action.error} />
            <Field label="Points (negative to remove)">
              <TextInput type="number" required value={adjustForm.points} onChange={(e) => setAdjustForm({ ...adjustForm, points: e.target.value })} />
            </Field>
            <Field label="Reason">
              <TextInput required value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="Goodwill for a delayed delivery" />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Apply adjustment</button>
          </form>
        </Modal>
      ) : null}

      {showReward ? (
        <Modal title="New reward" onClose={() => setShowReward(false)}>
          <form onSubmit={saveReward}>
            <ActionError error={action.error} />
            <Field label="Name">
              <TextInput required value={rewardForm.name} onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })} />
            </Field>
            <Field label="Points cost">
              <TextInput type="number" min={1} required value={rewardForm.pointsCost} onChange={(e) => setRewardForm({ ...rewardForm, pointsCost: e.target.value })} />
            </Field>
            <Field label="Description">
              <TextInput value={rewardForm.description} onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Add to catalogue</button>
          </form>
        </Modal>
      ) : null}

      {showTier ? (
        <Modal title="New tier" onClose={() => setShowTier(false)}>
          <form onSubmit={saveTier}>
            <ActionError error={action.error} />
            <Field label="Tier name">
              <TextInput required value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="Gold" />
            </Field>
            <Field label="Starts at points">
              <TextInput type="number" min={0} required value={tierForm.minPoints} onChange={(e) => setTierForm({ ...tierForm, minPoints: e.target.value })} />
            </Field>
            <Field label="Benefits">
              <TextInput value={tierForm.benefits} onChange={(e) => setTierForm({ ...tierForm, benefits: e.target.value })} placeholder="Free delivery inside Dhaka" />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Save tier</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
