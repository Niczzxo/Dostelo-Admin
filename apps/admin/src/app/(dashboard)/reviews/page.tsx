'use client';

import { useState, type FormEvent } from 'react';
import {
  REVIEW_SOURCE_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type ReviewStatus,
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
 * Reviews & Reputation: moderation of product reviews. The
 * migrated storefront has no review submission surface, so
 * reviews are entered by staff from feedback received by phone
 * or in person; a review is marked verified-purchase only when
 * the API finds a delivered order for that customer and
 * product. New reviews start pending and nothing reaches a
 * public surface until it is approved here.
 */
export default function ReviewsPage() {
  const { session } = useAuth();
  const canEdit =
    session.principal?.permissions.includes('marketing.edit') ?? false;
  const [status, setStatus] = useState<ReviewStatus | ''>('');
  const [productId, setProductId] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [rating, setRating] = useState('5');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reviews = useData(
    (client) => client.listReviews(status ? { status } : undefined),
    [status],
  );
  const products = useData((client) => client.listProducts(), []);

  async function createReview(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api.createReview({
        productId,
        customerId: customerId.trim() ? customerId.trim() : undefined,
        authorName: authorName.trim(),
        rating: Number(rating),
        title: title.trim() ? title.trim() : undefined,
        body: body.trim(),
      });
      setAuthorName('');
      setCustomerId('');
      setTitle('');
      setBody('');
      reviews.reload();
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

  async function setReviewStatus(
    id: string,
    next: ReviewStatus,
  ): Promise<void> {
    setRowError(null);
    try {
      await api.setReviewStatus(id, { status: next });
      reviews.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setRowError(uiError.message);
    }
  }

  const productName = (id: string): string =>
    products.data?.items.find((product) => product.id === id)?.name ?? id;

  return (
    <section>
      <PageHeader title="Reviews & Reputation" />
      <p className="note muted" style={{ marginTop: 0, maxWidth: 760 }}>
        Reviews here are entered by staff from feedback the customer
        gave by phone or in person: the storefront does not collect
        reviews yet. The source column shows whether the API could
        verify a delivered order behind the review.
      </p>
      <div className="toolbar">
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ReviewStatus | '')
            }
          >
            <option value="">All statuses</option>
            {REVIEW_STATUSES.map((value) => (
              <option key={value} value={value}>
                {REVIEW_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {reviews.loading ? <LoadingNote label="Loading reviews..." /> : null}
      {reviews.error ? (
        <ErrorNote error={reviews.error} onRetry={reviews.reload} />
      ) : null}
      {reviews.data && reviews.data.items.length === 0 ? (
        <EmptyNote>No reviews recorded yet.</EmptyNote>
      ) : null}
      {rowError ? (
        <p className="form-error" role="alert">
          {rowError}
        </p>
      ) : null}
      {reviews.data && reviews.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Author</th>
                <th className="num">Rating</th>
                <th>Review</th>
                <th>Source</th>
                <th>Status</th>
                <th>Entered</th>
                {canEdit ? <th>Moderation</th> : null}
              </tr>
            </thead>
            <tbody>
              {reviews.data.items.map((review) => (
                <tr key={review.id}>
                  <td>{productName(review.productId)}</td>
                  <td>{review.authorName}</td>
                  <td className="num">{review.rating} / 5</td>
                  <td>
                    {review.title ? <strong>{review.title}. </strong> : null}
                    {review.body}
                  </td>
                  <td>{REVIEW_SOURCE_LABELS[review.source]}</td>
                  <td>
                    <Badge>{REVIEW_STATUS_LABELS[review.status]}</Badge>
                  </td>
                  <td>{formatDateTime(review.createdAt)}</td>
                  {canEdit ? (
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {review.status !== 'approved' ? (
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() =>
                              void setReviewStatus(review.id, 'approved')
                            }
                          >
                            Approve
                          </button>
                        ) : null}
                        {review.status !== 'hidden' ? (
                          <button
                            type="button"
                            className="btn btn-small btn-secondary"
                            onClick={() =>
                              void setReviewStatus(review.id, 'hidden')
                            }
                          >
                            Hide
                          </button>
                        ) : null}
                        {review.status !== 'pending' ? (
                          <button
                            type="button"
                            className="btn btn-small btn-secondary"
                            onClick={() =>
                              void setReviewStatus(review.id, 'pending')
                            }
                          >
                            Back to pending
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
          <h2 style={{ fontSize: 17, marginTop: 0 }}>Enter a review</h2>
          <form onSubmit={createReview}>
            <div className="toolbar">
              <label className="field" style={{ flex: 1, minWidth: 200 }}>
                Product
                <select
                  className="select"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  required
                >
                  <option value="">Choose a product</option>
                  {(products.data?.items ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Rating
                <select
                  className="select"
                  value={rating}
                  onChange={(event) => setRating(event.target.value)}
                >
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value} / 5
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>
                Author name
                <input
                  className="input"
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>
                Customer id (optional, enables verified check)
                <input
                  className="input"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                />
              </label>
            </div>
            <label className="field" style={{ marginTop: 10 }}>
              Title (optional)
              <input
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              Review text
              <textarea
                className="input"
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className="btn btn-small"
              disabled={busy}
              style={{ marginTop: 12 }}
            >
              {busy ? 'Saving...' : 'Add review (starts pending)'}
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
          Your role can view reviews but cannot enter or moderate them
          (the marketing.edit permission is required).
        </p>
      )}
    </section>
  );
}
