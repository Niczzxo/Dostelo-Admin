'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, MessageCircle, Play, ShoppingCart, XCircle } from 'lucide-react';
import { api, formatDateTime, formatMinor, toUiError } from '../../../../lib/api';
import { useData } from '../../../../lib/use-data';
import { expireSession } from '../../../../lib/session';
import { useAuth } from '../../../../components/auth-provider';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  ModuleHeader,
} from '../../../../components/ui';

/**
 * Abandoned cart recovery detail (Phase 6): the recovery
 * record, the sequence attempts with their honest outcomes
 * (sent only on provider confirmation, otherwise the refusal or
 * the not-configured reason from the communication log), and
 * the communications produced for this cart. Staff holding
 * recovery.edit can run the next due step now or cancel the
 * recovery; both actions are refused by the API once the
 * recovery is recovered, closed or cancelled.
 */
export default function CartRecoveryDetailPage() {
  const params = useParams<{ id: string }>();
  const recoveryId = params.id;
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('recovery.edit');

  const detail = useData(
    (client) => client.getAbandonedCart(recoveryId),
    [recoveryId],
  );
  const recovery = detail.data?.recovery;
  const attempts = detail.data?.attempts ?? [];
  const communications = detail.data?.communications ?? [];

  const [busy, setBusy] = useState<'run' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const active =
    recovery !== undefined &&
    (recovery.status === 'detected' || recovery.status === 'in-recovery');

  async function act(kind: 'run' | 'cancel'): Promise<void> {
    if (!recovery) return;
    if (
      kind === 'cancel' &&
      !window.confirm(
        'Cancel this recovery? Every pending step is cancelled and no further recovery messages will be scheduled.',
      )
    ) {
      return;
    }
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      if (kind === 'run') {
        await api.runRecoveryStep(recovery.id);
        setNote('The next due step ran. Its outcome is in the attempts below.');
      } else {
        await api.cancelRecovery(recovery.id);
        setNote('Recovery cancelled.');
      }
      detail.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <ModuleHeader
        icon={ShoppingCart}
        title="Recovery detail"
        description="The recovery record, its scheduled steps and every communication the sequence and staff produced for this cart."
      >
        <Link href="/cart-recovery" className="btn btn-secondary">
          <ArrowLeft size={15} /> Back to recoveries
        </Link>
      </ModuleHeader>

      {detail.loading ? <LoadingNote label="Loading recovery..." /> : null}
      {detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : null}

      {recovery ? (
        <>
          <div className="detail-grid">
            <div className="card">
              <CardHead icon={ShoppingCart} title="Recovery" />
              <dl className="kv">
                <dt>Status</dt>
                <dd>
                  <Badge>{recovery.status}</Badge>
                </dd>
                {recovery.closeReason ? (
                  <>
                    <dt>Close reason</dt>
                    <dd>{recovery.closeReason}</dd>
                  </>
                ) : null}
                <dt>Contact name</dt>
                <dd>{recovery.contactName ?? 'Not recorded'}</dd>
                <dt>Phone</dt>
                <dd>{recovery.contactPhone ?? 'Not recorded'}</dd>
                <dt>Email</dt>
                <dd>{recovery.contactEmail ?? 'Not recorded'}</dd>
                <dt>Contact basis</dt>
                <dd>
                  {recovery.contactBasis ??
                    'None recorded: this cart is not contactable'}
                </dd>
                <dt>Items</dt>
                <dd>{recovery.itemCount}</dd>
                <dt>Cart total at detection</dt>
                <dd>{formatMinor(recovery.cartTotal.amountMinor)}</dd>
                <dt>Detected</dt>
                <dd>{formatDateTime(recovery.detectedAt)}</dd>
                <dt>Last activity</dt>
                <dd>{formatDateTime(recovery.lastActivityAt)}</dd>
                <dt>Token expires</dt>
                <dd>{formatDateTime(recovery.tokenExpiresAt)}</dd>
                <dt>Recovered by order</dt>
                <dd>{recovery.recoveredOrderNumber ?? 'Not yet'}</dd>
                <dt>Customer</dt>
                <dd>
                  {recovery.customerId ? (
                    <Link href={`/crm/${recovery.customerId}`}>
                      View CRM profile
                    </Link>
                  ) : (
                    'Not linked to an account'
                  )}
                </dd>
              </dl>
            </div>

            <div className="card">
              <CardHead icon={Play} title="Actions" />
              {canEdit && active ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null}
                    onClick={() => act('run')}
                  >
                    <Play size={14} />{' '}
                    {busy === 'run' ? 'Running...' : 'Run next step now'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy !== null}
                    onClick={() => act('cancel')}
                  >
                    <XCircle size={14} />{' '}
                    {busy === 'cancel' ? 'Cancelling...' : 'Cancel recovery'}
                  </button>
                </div>
              ) : canEdit ? (
                <p className="note muted">
                  This recovery is {recovery.status}; no further steps
                  can run.
                </p>
              ) : (
                <p className="note muted">
                  Your role cannot run steps or cancel recoveries (the
                  recovery.edit permission is required).
                </p>
              )}
              {note ? <p className="note">{note}</p> : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <div className="detail-grid section-gap">
            <div className="card">
              <CardHead icon={ShoppingCart} title="Sequence attempts" />
              {attempts.length === 0 ? (
                <EmptyNote>No steps have been scheduled yet.</EmptyNote>
              ) : (
                <ul className="timeline">
                  {attempts.map((attempt) => (
                    <li key={attempt.id}>
                      <div>
                        <strong>Step {attempt.stepNumber}</strong>{' '}
                        <Badge>{attempt.channel}</Badge>{' '}
                        <Badge>{attempt.status}</Badge>
                        {attempt.outcome ? (
                          <>
                            {' '}
                            <Badge>{attempt.outcome}</Badge>
                          </>
                        ) : null}
                      </div>
                      <div>
                        Template {attempt.templateKey}, scheduled for{' '}
                        {formatDateTime(attempt.scheduledFor)}
                        {attempt.executedAt
                          ? `, ran ${formatDateTime(attempt.executedAt)}`
                          : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card">
              <CardHead icon={MessageCircle} title="Communications" />
              {communications.length === 0 ? (
                <EmptyNote>
                  No messages or call tasks recorded for this recovery
                  yet.
                </EmptyNote>
              ) : (
                <ul className="timeline">
                  {communications.map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <Badge>{entry.channel}</Badge>{' '}
                        <Badge>{entry.status}</Badge>{' '}
                        <span className="muted">{entry.kind}</span>
                      </div>
                      <div>{entry.body}</div>
                      {entry.detail ? (
                        <div className="muted">{entry.detail}</div>
                      ) : null}
                      <div className="when">
                        {formatDateTime(entry.createdAt)}
                        {entry.toAddress ? ` · to ${entry.toAddress}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
