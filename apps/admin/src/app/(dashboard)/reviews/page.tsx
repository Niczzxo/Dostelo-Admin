'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Download,
  Flag,
  Info,
  MessageSquareReply,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  REVIEW_SOURCE_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  REVIEW_TRANSITIONS,
  type ProductReview,
  type ReviewStatus,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import { AreaChart, DonutChart } from '../../../components/charts';
import { downloadCsv, toCsv } from '../../../lib/csv';
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

type TabKey = 'all' | ReviewStatus;
type SortKey = 'createdAt' | 'rating' | 'status' | 'authorName';

const RATING_COLORS: Record<number, string> = {
  5: '#1FA855',
  4: '#7C5CFF',
  3: '#E8930C',
  2: '#C7509B',
  1: '#E5484D',
};

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} size={size} fill={value <= rating ? '#E8930C' : 'none'} color="#E8930C" />
      ))}
    </span>
  );
}

function perDaySeries(items: ProductReview[], days: number): { label: string; value: number }[] {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }
  for (const item of items) {
    const key = item.createdAt.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([key, value]) => ({
    label: new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    value,
  }));
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

/**
 * Reviews and Reputation: moderation of staff entered product
 * reviews. Reviews start pending and unverified; the server marks
 * a review verified only when it finds a delivered order for the
 * named customer and product. Nothing here reads the live Pages
 * site, whose static rating is not this database.
 */
export default function ReviewsPage() {
  const { session } = useAuth();
  const canEdit = session.principal?.permissions.includes('marketing.edit') ?? false;

  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | ''>('');
  const [productFilter, setProductFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [insightsRef, setInsightsRef] = useState<HTMLDivElement | null>(null);

  const reviews = useData((client) => client.listReviews(), []);
  const products = useData((client) => client.listAdminProducts(), []);
  const all = useMemo(() => reviews.data?.items ?? [], [reviews.data]);
  const productById = useMemo(() => {
    const map = new Map<string, { name: string; thumb: string | null }>();
    for (const product of products.data?.items ?? []) {
      const image = product.media.filter((m) => m.type === 'image').sort((a, b) => a.position - b.position)[0];
      map.set(product.id, { name: product.name, thumb: image?.url ?? null });
    }
    return map;
  }, [products.data]);
  const productName = (id: string): string => productById.get(id)?.name ?? id;

  const counts = useMemo(() => ({
    total: all.length,
    pending: all.filter((r) => r.status === 'pending').length,
    approved: all.filter((r) => r.status === 'approved').length,
    flagged: all.filter((r) => r.status === 'flagged').length,
    rejected: all.filter((r) => r.status === 'rejected').length,
    hidden: all.filter((r) => r.status === 'hidden').length,
    verified: all.filter((r) => r.verified).length,
    average: all.length ? all.reduce((sum, r) => sum + r.rating, 0) / all.length : null,
  }), [all]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = all.filter((review) => {
      if (tab !== 'all' && review.status !== tab) return false;
      if (statusFilter && review.status !== statusFilter) return false;
      if (ratingFilter && review.rating !== Number(ratingFilter)) return false;
      if (productFilter && review.productId !== productFilter) return false;
      if (query) {
        const haystack = `${review.authorName} ${review.title ?? ''} ${review.body} ${productName(review.productId)} ${review.orderNumber ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      if (sortKey === 'rating') return b.rating - a.rating;
      if (sortKey === 'status') return a.status.localeCompare(b.status);
      if (sortKey === 'authorName') return a.authorName.localeCompare(b.authorName);
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, tab, statusFilter, ratingFilter, productFilter, search, sortKey, productById]);

  const pageRows = paginate(filtered, page, PAGE_SIZE);
  const trend = useMemo(() => perDaySeries(all, 14), [all]);
  const ratingSlices = [5, 4, 3, 2, 1].map((stars) => ({
    label: `${stars} star${stars === 1 ? '' : 's'}`,
    value: all.filter((r) => r.rating === stars).length,
    color: RATING_COLORS[stars]!,
  }));

  const insights = useMemo(() => {
    const answered = all.filter((r) => r.replies.length > 0);
    const responseTimes = answered
      .map((r) => (new Date(r.replies[0]!.createdAt).getTime() - new Date(r.createdAt).getTime()) / 3600_000)
      .filter((value) => Number.isFinite(value) && value >= 0);
    return {
      responseRate: all.length ? (answered.length / all.length) * 100 : null,
      avgResponseHours: responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null,
      verifiedRate: all.length ? (counts.verified / all.length) * 100 : null,
      unanswered: all.length - answered.length,
      negativeAlerts: all.filter((r) => r.rating <= 2 && r.replies.length === 0),
    };
  }, [all, counts.verified]);

  const detail = all.find((r) => r.id === detailId) ?? null;

  async function setStatus(review: ProductReview, next: ReviewStatus): Promise<void> {
    if (!REVIEW_TRANSITIONS[review.status].includes(next)) {
      setRowError(`A ${REVIEW_STATUS_LABELS[review.status]} review cannot move to ${REVIEW_STATUS_LABELS[next]}.`);
      return;
    }
    let reason: string | undefined;
    if (next === 'flagged') {
      const entered = window.prompt('Reason for flagging this review (recorded on the review):');
      if (entered === null) return;
      reason = entered.trim() ? entered.trim() : undefined;
    }
    if (next === 'rejected' && !window.confirm('Reject this review? It will stay in the database with a rejected status.')) return;
    setBusy(true); setRowError(null);
    try {
      await api.setReviewStatus(review.id, { status: next, reason });
      reviews.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setRowError(uiError.message);
    } finally { setBusy(false); }
  }

  async function deleteReview(review: ProductReview): Promise<void> {
    // No delete endpoint exists in the API client for reviews, so
    // this action reports that plainly instead of faking removal.
    setRowError(`Deleting review ${review.id.slice(0, 8)} is not supported by the API: reviews are moderated through status changes (reject or hide) and there is no delete endpoint. The review by ${review.authorName} was not deleted.`);
  }

  function toggleSelected(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkModerate(next: 'approved' | 'rejected'): Promise<void> {
    const targets = all.filter((r) => selected.has(r.id) && REVIEW_TRANSITIONS[r.status].includes(next));
    if (targets.length === 0) {
      setRowError(`None of the selected reviews can legally move to ${REVIEW_STATUS_LABELS[next]}.`);
      return;
    }
    if (next === 'rejected' && !window.confirm(`Reject ${targets.length} review(s)?`)) return;
    setBusy(true); setRowError(null);
    try {
      for (const target of targets) await api.setReviewStatus(target.id, { status: next });
      setSelected(new Set());
      reviews.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setRowError(uiError.message);
    } finally { setBusy(false); }
  }

  function exportCsv(): void {
    downloadCsv('reviews.csv', toCsv(
      ['Review ID', 'Product', 'Author', 'Rating', 'Title', 'Review', 'Source', 'Verified', 'Verification Note', 'Status', 'Order', 'Replies', 'Created At'],
      filtered.map((r) => [r.id, productName(r.productId), r.authorName, r.rating, r.title, r.body, REVIEW_SOURCE_LABELS[r.source], r.verified ? 'yes' : 'no', r.verificationNote, REVIEW_STATUS_LABELS[r.status], r.orderNumber, r.replies.length, r.createdAt]),
    ));
  }

  function actionLabel(review: ProductReview, next: ReviewStatus): string {
    if (next === 'approved' && review.status === 'hidden') return 'Restore';
    if (next === 'approved') return 'Approve';
    if (next === 'hidden') return 'Hide';
    if (next === 'flagged') return 'Flag';
    if (next === 'rejected') return 'Reject';
    return 'Back to pending';
  }

  return (
    <section>
      <ModuleHeader icon={Star} title="Reviews and Reputation" description="Moderation of staff entered product reviews, public replies, review requests and the store reputation figures computed from this database.">
        <button type="button" className="btn-secondary" onClick={() => setShowSettings(true)}><Settings2 size={16} /> Review Settings</button>
        <button type="button" className="btn-secondary" onClick={() => insightsRef?.scrollIntoView({ behavior: 'smooth' })}><ShieldCheck size={16} /> Moderation</button>
        <button type="button" className="btn-secondary" onClick={() => setShowRequests(true)}><Send size={16} /> Review Requests</button>
        {canEdit ? <button type="button" className="btn" onClick={() => setShowAdd(true)}><Plus size={16} /> Add Review</button> : null}
      </ModuleHeader>

      <p className="note muted" style={{ maxWidth: 820 }}><Info size={14} /> The live Pages site shows a static 4.9 rating. That figure is not this database: every number on this page is computed from the review records stored in the API, and an empty store honestly shows no reviews.</p>

      {reviews.loading ? <LoadingNote label="Loading reviews..." /> : null}
      {reviews.error ? <ErrorNote error={reviews.error} onRetry={reviews.reload} /> : null}
      {products.error ? <ErrorNote error={products.error} onRetry={products.reload} /> : null}

      {reviews.data ? (
        <>
          <div className="kpi-grid">
            <KpiCard icon={Star} label="Total Reviews" value={String(counts.total)} tone="purple" />
            <KpiCard icon={TrendingUp} label="Average Rating" value={counts.average !== null ? `${counts.average.toFixed(1)} / 5` : 'Unavailable'} note={counts.average === null ? 'No reviews yet' : undefined} tone="green" />
            <KpiCard icon={BadgeCheck} label="Verified Reviews" value={String(counts.verified)} note={counts.total ? `${Math.round((counts.verified / counts.total) * 100)}% of all reviews` : 'No reviews yet'} tone="blue" />
            <KpiCard icon={Star} label="Pending Reviews" value={String(counts.pending)} tone="orange" />
            <KpiCard icon={Flag} label="Flagged Reviews" value={String(counts.flagged)} tone="purple" />
          </div>

          <StatusTabs
            active={tab}
            onChange={(key) => { setTab(key as TabKey); setPage(1); }}
            tabs={[
              { key: 'all', label: 'All Reviews', count: counts.total },
              { key: 'approved', label: 'Published', count: counts.approved },
              { key: 'pending', label: 'Pending', count: counts.pending },
              { key: 'flagged', label: 'Flagged', count: counts.flagged },
              { key: 'rejected', label: 'Rejected', count: counts.rejected },
            ]}
          />

          <div className="grid-cards" style={{ marginTop: 16 }}>
            <div className="card">
              <CardHead icon={TrendingUp} title="Review Trend (last 14 days)" />
              {all.length === 0 ? <EmptyNote>No reviews yet.</EmptyNote> : <AreaChart points={trend} />}
            </div>
            <div className="card">
              <CardHead icon={Star} title="Ratings Distribution" />
              {all.length === 0 ? <EmptyNote>No reviews yet, so no distribution to show.</EmptyNote> : (
                <DonutChart slices={ratingSlices} centreLabel="Reviews" centreValue={String(counts.total)} />
              )}
            </div>
          </div>

          <div className="card filter-card" style={{ marginTop: 16 }}>
            <div className="filter-row">
              <label className="field">Search <span style={{ position: 'relative', display: 'block' }}><Search size={15} style={{ position: 'absolute', left: 9, top: 11 }} /><input className="input" style={{ paddingLeft: 30 }} placeholder="Author, product, text, order" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></span></label>
              <label className="field">Rating
                <select className="select" value={ratingFilter} onChange={(e) => { setRatingFilter(e.target.value); setPage(1); }}>
                  <option value="">All ratings</option>
                  {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}
                </select>
              </label>
              <label className="field">Status
                <select className="select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as ReviewStatus | ''); setPage(1); }}>
                  <option value="">All statuses</option>
                  {REVIEW_STATUSES.map((value) => <option key={value} value={value}>{REVIEW_STATUS_LABELS[value]}</option>)}
                </select>
              </label>
              <label className="field">Product
                <select className="select" value={productFilter} onChange={(e) => { setProductFilter(e.target.value); setPage(1); }}>
                  <option value="">All products</option>
                  {(products.data?.items ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <label className="field">Sort by
                <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="createdAt">Newest first</option>
                  <option value="rating">Highest rating</option>
                  <option value="status">Status</option>
                  <option value="authorName">Author name</option>
                </select>
              </label>
              <div className="filter-actions">
                <button type="button" className="btn-secondary" onClick={() => { setSearch(''); setRatingFilter(''); setStatusFilter(''); setProductFilter(''); setSortKey('createdAt'); setPage(1); }}><RotateCcw size={15} /> Reset</button>
                <button type="button" className="btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
              </div>
            </div>
          </div>

          {rowError ? <p className="form-error" role="alert">{rowError}</p> : null}

          {canEdit && selected.size > 0 ? (
            <div className="card" style={{ marginTop: 16 }}>
              <CardHead icon={ShieldCheck} title={`Bulk moderation (${selected.size} selected)`} />
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-small" disabled={busy} onClick={() => void bulkModerate('approved')}>Approve selected</button>
                <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => void bulkModerate('rejected')}>Reject selected</button>
              </span>
              <p className="note muted">Only selected reviews whose current status legally allows the move are changed. Others are left untouched and reported above if none qualify.</p>
            </div>
          ) : null}

          <div className="card" style={{ marginTop: 16 }}>
            <CardHead icon={Star} title="Reviews" />
            {all.length === 0 ? <EmptyNote>No reviews recorded yet. Staff can add the first one with Add Review.</EmptyNote> : filtered.length === 0 ? <EmptyNote>No reviews match the current filters.</EmptyNote> : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      {canEdit ? <th aria-label="Select" /> : null}
                      <th>Review</th><th>Product</th><th>Rating</th><th>Author</th><th>Source</th><th>Status</th><th>Created At</th><th>Actions</th>
                    </tr></thead>
                    <tbody>
                      {pageRows.map((review) => {
                        const product = productById.get(review.productId);
                        const transitions = REVIEW_TRANSITIONS[review.status];
                        return (
                          <tr key={review.id} className="clickable" onClick={() => setDetailId(review.id)}>
                            {canEdit ? <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(review.id)} onChange={() => toggleSelected(review.id)} aria-label={`Select review by ${review.authorName}`} /></td> : null}
                            <td>
                              <strong>{review.title ?? 'No title'}</strong>
                              <div className="muted">{review.body.length > 90 ? `${review.body.slice(0, 90)}...` : review.body}</div>
                              {review.verificationNote ? <div className="muted">Verification: {review.verificationNote}</div> : null}
                              {review.flagReason ? <div className="muted">Flag reason: {review.flagReason}</div> : null}
                            </td>
                            <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{product?.thumb ? <img className="thumb" src={product.thumb} alt={product.name} /> : null}{productName(review.productId)}</span></td>
                            <td><Stars rating={review.rating} /></td>
                            <td>{review.authorName}{review.verified ? <span className="badge"> <BadgeCheck size={12} /> Verified</span> : null}</td>
                            <td>{REVIEW_SOURCE_LABELS[review.source]}</td>
                            <td><Badge>{REVIEW_STATUS_LABELS[review.status]}</Badge></td>
                            <td>{formatDateTime(review.createdAt)}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn-small btn-secondary" onClick={() => setDetailId(review.id)}><MessageSquareReply size={14} /> Reply</button>
                                {canEdit ? transitions.map((next) => (
                                  <button key={next} type="button" className={next === 'rejected' ? 'btn btn-small btn-danger' : 'btn btn-small btn-secondary'} disabled={busy} onClick={() => void setStatus(review, next)}>{actionLabel(review, next)}</button>
                                )) : null}
                                {canEdit ? <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => void deleteReview(review)}><Trash2 size={14} /> Delete</button> : null}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="table-foot"><span className="muted">{filtered.length} review(s)</span><Pagination page={page} pageCount={pageCountFor(filtered.length, PAGE_SIZE)} onChange={setPage} /></div>
              </>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }} ref={setInsightsRef}>
            <CardHead icon={TrendingUp} title="Reputation Insights" />
            <dl className="kv">
              <dt>Review Response Rate</dt><dd>{insights.responseRate !== null ? `${insights.responseRate.toFixed(1)}%` : 'Unavailable, no reviews yet'}</dd>
              <dt>Average Response Time</dt><dd>{insights.avgResponseHours !== null ? formatHours(insights.avgResponseHours) : 'Unavailable, no replies yet'}</dd>
              <dt>Verified Review Rate</dt><dd>{insights.verifiedRate !== null ? `${insights.verifiedRate.toFixed(1)}%` : 'Unavailable, no reviews yet'}</dd>
              <dt>Overall Store Rating</dt><dd>{counts.average !== null ? `${counts.average.toFixed(1)} / 5` : 'Unavailable, no reviews yet'}</dd>
              <dt>Unanswered Reviews</dt><dd>{insights.unanswered}</dd>
              <dt>Sentiment</dt><dd>Unavailable. No sentiment analysis is connected to this store.</dd>
            </dl>
            <h3 style={{ margin: '14px 0 8px', fontSize: 15 }}>Negative Review Alerts (1 to 2 stars, unanswered)</h3>
            {insights.negativeAlerts.length === 0 ? <EmptyNote>No unanswered negative reviews.</EmptyNote> : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {insights.negativeAlerts.map((review) => (
                  <li key={review.id}>
                    <button type="button" className="btn btn-small btn-secondary" onClick={() => setDetailId(review.id)}>
                      {review.rating} star review by {review.authorName} on {productName(review.productId)}: {review.title ?? review.body.slice(0, 60)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="note muted" style={{ marginTop: 12 }}>Moderation lifecycle: pending can move to approved, flagged, rejected or hidden. Approved can move to flagged or hidden. Flagged can move to approved, rejected, hidden or pending. Rejected can return to pending. Hidden can move to approved or pending. Every moderation action is recorded in the audit log, see <Link href="/security">Security</Link>.</p>
          </div>
        </>
      ) : null}

      {showSettings ? (
        <Modal title="Review Settings" onClose={() => setShowSettings(false)}>
          <p className="note">No stored settings exist for reviews in the API today. There is no review settings record to edit, and this page does not invent one.</p>
          <p className="note muted">What is configurable in practice is the moderation lifecycle enforced by the API: staff entered reviews start pending and unverified, verification is a server check against the named order, and statuses move only along the legal transitions listed in the Reputation Insights panel. Public replies are stored on the review. Internal moderation notes are not stored on the review record; moderation actions are recorded in the audit log instead.</p>
          <button type="button" className="btn-secondary" onClick={() => setShowSettings(false)}>Close</button>
        </Modal>
      ) : null}

      {showAdd ? <AddReviewModal products={products.data?.items ?? []} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); reviews.reload(); }} /> : null}
      {showRequests ? <ReviewRequestsModal onClose={() => setShowRequests(false)} /> : null}
      {detail ? (
        <ReviewDrawer
          review={detail}
          productName={productName(detail.productId)}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onChanged={reviews.reload}
          onStatus={(next) => void setStatus(detail, next)}
        />
      ) : null}
    </section>
  );
}

const REVIEW_SOURCES_FORM = ['staff-entered', 'verified-purchase'] as const;

function AddReviewModal({ products, onClose, onCreated }: {
  products: { id: string; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [rating, setRating] = useState(5);
  const [authorName, setAuthorName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [source, setSource] = useState<(typeof REVIEW_SOURCES_FORM)[number]>('staff-entered');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customers = useData(
    (client) => (customerSearch.trim() ? client.listCustomers({ search: customerSearch.trim(), limit: 8 }) : Promise.resolve({ items: [] })),
    [customerSearch],
  );

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true); setFormError(null);
    try {
      await api.createReview({
        productId,
        customerId: customerId || undefined,
        orderNumber: orderNumber.trim() ? orderNumber.trim() : undefined,
        authorName: authorName.trim(),
        rating,
        title: title.trim() ? title.trim() : undefined,
        body: body.trim(),
      });
      onCreated();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setFormError(uiError.message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Add Review (Staff)" onClose={onClose}>
      <p className="note muted">Staff entered reviews always start Pending and unverified. Verification is a server check against the named order, and its result (the verification note) shows on the review. The source you pick here is a label for how the feedback arrived; the API records the review as staff entered and upgrades it to verified purchase only when its own check passes.</p>
      <form onSubmit={submit}>
        <div className="filter-row">
          <label className="field">Product
            <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Choose a product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className="field">Source
            <select className="select" value={source} onChange={(e) => setSource(e.target.value as (typeof REVIEW_SOURCES_FORM)[number])}>
              <option value="staff-entered">Staff entered</option>
              <option value="verified-purchase">Claimed verified purchase (server checks)</option>
            </select>
          </label>
        </div>
        <label className="field" style={{ marginTop: 10 }}>Rating
          <span style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button type="button" key={value} className="btn btn-small btn-secondary" onClick={() => setRating(value)} aria-label={`${value} stars`}>
                <Star size={16} fill={value <= rating ? '#E8930C' : 'none'} color="#E8930C" /> {value}
              </button>
            ))}
          </span>
        </label>
        <div className="filter-row" style={{ marginTop: 10 }}>
          <label className="field">Author name <input className="input" value={authorName} onChange={(e) => setAuthorName(e.target.value)} required /></label>
          <label className="field">Order number (optional) <input className="input" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} /></label>
        </div>
        <label className="field" style={{ marginTop: 10 }}>Find the customer (optional, enables the verified check)
          <input className="input" placeholder="Search by name, phone or email" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
        </label>
        {(customers.data?.items ?? []).length > 0 ? (
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {(customers.data?.items ?? []).map((customer) => (
              <button type="button" key={customer.id} className="btn-secondary" onClick={() => { setCustomerId(customer.id); if (!authorName) setAuthorName(customer.fullName); }}>
                {customer.fullName} ({customer.phone}){customerId === customer.id ? ' selected' : ''}
              </button>
            ))}
          </div>
        ) : null}
        {customerId ? <p className="note muted">Customer selected. Clear by searching again and picking another, or leave as is.</p> : null}
        <label className="field" style={{ marginTop: 10 }}>Title (optional) <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field" style={{ marginTop: 10 }}>Review text <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
        <button type="submit" className="btn" disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Saving...' : 'Add Review (Pending)'}</button>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
      </form>
    </Modal>
  );
}

function ReviewRequestsModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'customer' | 'order'>('customer');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [orderProductId, setOrderProductId] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [result, setResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customers = useData(
    (client) => (customerSearch.trim() ? client.listCustomers({ search: customerSearch.trim(), limit: 8 }) : Promise.resolve({ items: [] })),
    [customerSearch],
  );
  const deliveredOrders = useData((client) => client.listStaffOrders('delivered'), []);
  const products = useData((client) => client.listAdminProducts(), []);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const targetCustomer = mode === 'customer' ? customerId : '';
    const targetProduct = mode === 'customer' ? productId : orderProductId;
    if (!targetCustomer && mode === 'customer') { setFormError('Choose a customer first.'); return; }
    setBusy(true); setFormError(null); setResult(null);
    try {
      const log = await api.requestReview({
        customerId: targetCustomer,
        productId: targetProduct ? targetProduct : undefined,
        channel,
      });
      setResult(`Request recorded with status ${log.status}${log.detail ? `: ${log.detail}` : ''}. When the channel provider is not configured, the API records the request as not-configured and nothing was actually sent. That recorded status is the honest result shown here.`);
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setFormError(uiError.message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Review Requests" onClose={onClose}>
      <p className="note muted">A review request asks a customer to review a product they bought. The API sends it per customer (optionally for one product) on WhatsApp or email through the communications service, and records the outcome on the communication log.</p>
      <div className="action-tabs" role="tablist">
        <button type="button" className={`action-tab${mode === 'customer' ? ' active' : ''}`} onClick={() => setMode('customer')}>Pick a customer</button>
        <button type="button" className={`action-tab${mode === 'order' ? ' active' : ''}`} onClick={() => setMode('order')}>Pick a delivered order</button>
      </div>
      <form onSubmit={submit} style={{ marginTop: 12 }}>
        {mode === 'customer' ? (
          <>
            <label className="field">Find the customer
              <input className="input" placeholder="Search by name, phone or email" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
            </label>
            {(customers.data?.items ?? []).length > 0 ? (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {(customers.data?.items ?? []).map((customer) => (
                  <button type="button" key={customer.id} className="btn-secondary" onClick={() => setCustomerId(customer.id)}>
                    {customer.fullName} ({customer.phone}){customerId === customer.id ? ' selected' : ''}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="field" style={{ marginTop: 10 }}>Product (optional)
              <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Any purchased product</option>
                {(products.data?.items ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            {deliveredOrders.loading ? <LoadingNote label="Loading delivered orders..." /> : null}
            {deliveredOrders.error ? <ErrorNote error={deliveredOrders.error} onRetry={deliveredOrders.reload} /> : null}
            {(deliveredOrders.data?.items ?? []).length === 0 && !deliveredOrders.loading ? <EmptyNote>No delivered orders to request reviews for.</EmptyNote> : null}
            <div style={{ display: 'grid', gap: 6 }}>
              {(deliveredOrders.data?.items ?? []).map((order) => (
                <button type="button" key={order.id} className="btn-secondary" onClick={() => { setCustomerId(order.customerId); setOrderProductId(order.items[0]?.productId ?? ''); }}>
                  Order {order.orderNumber}, {order.address.fullName}, {order.items.length} item(s)
                </button>
              ))}
            </div>
            {customerId ? <p className="note muted">The chosen order sets the customer and its first product for the request.</p> : null}
          </>
        )}
        <label className="field" style={{ marginTop: 10 }}>Channel
          <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as 'whatsapp' | 'email')}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </label>
        <button type="submit" className="btn" disabled={busy || !customerId} style={{ marginTop: 12 }}>{busy ? 'Sending...' : 'Send review request'}</button>
        {result ? <p className="note" role="status">{result}</p> : null}
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
      </form>
    </Modal>
  );
}

function ReviewDrawer({ review, productName, canEdit, onClose, onChanged, onStatus }: {
  review: ProductReview;
  productName: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
  onStatus: (next: ReviewStatus) => void;
}) {
  const [replyBody, setReplyBody] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true); setActionError(null);
    try { await action(); onChanged(); }
    catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setActionError(uiError.message);
    } finally { setBusy(false); }
  }

  return (
    <Drawer title={review.title ?? 'Review detail'} onClose={onClose}>
      <p><Stars rating={review.rating} size={18} /></p>
      <p style={{ lineHeight: 1.6 }}>{review.body}</p>
      <dl className="kv">
        <dt>Product</dt><dd>{productName}</dd>
        <dt>Author</dt><dd>{review.authorName}{review.verified ? ' (Verified)' : ''}</dd>
        <dt>Source</dt><dd>{REVIEW_SOURCE_LABELS[review.source]}</dd>
        <dt>Verification</dt><dd>{review.verificationNote ?? 'No verification note recorded'}</dd>
        <dt>Order</dt><dd>{review.orderNumber ?? 'Not linked'}</dd>
        <dt>Status</dt><dd>{REVIEW_STATUS_LABELS[review.status]}</dd>
        <dt>Flag reason</dt><dd>{review.flagReason ?? 'Not flagged'}</dd>
        <dt>Created</dt><dd>{formatDateTime(review.createdAt)}</dd>
        <dt>Updated</dt><dd>{formatDateTime(review.updatedAt)}</dd>
      </dl>
      <p className="note muted">Moderation history: individual moderation actions are recorded in the audit log, not on this record. See <Link href="/security">Security</Link> for the audit trail. The review record has no internal moderation note field and no assignee, so neither is offered here.</p>
      {canEdit ? (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {REVIEW_TRANSITIONS[review.status].map((next) => (
            <button key={next} type="button" className="btn btn-small btn-secondary" disabled={busy} onClick={() => onStatus(next)}>
              {next === 'approved' && review.status === 'hidden' ? 'Restore' : next === 'approved' ? 'Approve' : REVIEW_STATUS_LABELS[next]}
            </button>
          ))}
        </span>
      ) : null}
      <h3 style={{ margin: '16px 0 8px', fontSize: 15 }}>Public staff replies</h3>
      {review.replies.length === 0 ? <EmptyNote>No replies yet. This review counts as unanswered.</EmptyNote> : (
        review.replies.map((reply) => (
          <div key={reply.id} style={{ marginBottom: 10 }}>
            <div className="note muted" style={{ margin: 0 }}>{reply.authorName}, {formatDateTime(reply.createdAt)}</div>
            <p style={{ margin: '4px 0' }}>{reply.body}</p>
            {canEdit ? <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => { if (window.confirm('Delete this reply?')) void run(() => api.deleteReviewReply(review.id, reply.id)); }}><Trash2 size={13} /> Delete reply</button> : null}
          </div>
        ))
      )}
      {canEdit ? (
        <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api.addReviewReply(review.id, { body: replyBody.trim() }); setReplyBody(''); }); }}>
          <label className="field">Add a public reply
            <textarea className="input" rows={3} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} required />
          </label>
          <button type="submit" className="btn btn-small" disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Saving...' : 'Add reply'}</button>
        </form>
      ) : (
        <p className="note muted">Your role can view reviews but cannot reply or moderate them (the marketing.edit permission is required).</p>
      )}
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
    </Drawer>
  );
}
