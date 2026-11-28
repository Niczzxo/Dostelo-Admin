'use client';

import { useState, type FormEvent } from 'react';
import { Link2, Star } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, SelectInput, StatCard, StatGrid, StatusBadge, TextArea, TextInput, Unavailable,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { itemsOf, num, str } from '../../../lib/types';

/* Reviews & Reputation: moderation of storefront-submitted
   reviews from GET /v1/admin/reviews, replies, and review request
   link management. A submitted review appears here in its stored
   moderation state; publishing or hiding it posts the new state
   to the API, and only then does the storefront change. Review
   requests go through the API, which issues the link and records
   the send state honestly (not-configured until a provider
   exists). */
export default function ReviewsPage() {
  const reviews = useData((c) => c.listReviews({}));
  const requests = useData((c) => c.gap.listReviewRequests());
  const action = useAction();
  const [replying, setReplying] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({ customerId: '', orderNumber: '', channel: 'whatsapp' });

  const items = itemsOf(reviews.data);
  const requestItems = requests.data ? itemsOf(requests.data) : [];
  const pending = items.filter((r) => ['pending', 'awaiting-moderation'].includes(str(r.status)));
  const average = items.length
    ? (items.reduce((s, r) => s + num(r.rating), 0) / items.length).toFixed(1)
    : '0';

  async function setStatus(id: string, status: string) {
    if (await action.run((c) => c.setReviewStatus(id, { status }))) reviews.reload();
  }

  async function saveReply(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.addReviewReply(replying, { body: replyBody }))) {
      setReplying('');
      setReplyBody('');
      reviews.reload();
    }
  }

  async function sendRequest(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.requestReview(requestForm))) {
      setShowRequest(false);
      requests.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Star}
        title="Reviews & Reputation"
        description="Moderation of the reviews customers submitted on the storefront, staff replies, and review request links."
      >
        <button type="button" className="btn" onClick={() => setShowRequest(true)}>
          <Link2 size={15} /> Send review request
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Reviews" value={reviews.loading ? '...' : String(items.length)} />
        <StatCard label="Awaiting moderation" value={String(pending.length)} />
        <StatCard label="Average rating" value={items.length ? average : 'No reviews yet'} note="Computed from the loaded reviews only" />
        <StatCard label="Review requests" value={requests.data === null ? 'Unavailable' : String(requestItems.length)} />
      </StatGrid>

      <Card title="Submitted reviews">
        {reviews.loading ? (
          <LoadingNote />
        ) : reviews.error ? (
          <ErrorNote error={reviews.error} onRetry={reviews.reload} />
        ) : (
          <DataTable
            emptyText="No reviews submitted yet."
            columns={[
              { key: 'product', label: 'Product', render: (r) => str(r.productTitle ?? r.productId) },
              { key: 'rating', label: 'Rating', render: (r) => `${num(r.rating)} / 5` },
              { key: 'body', label: 'Review', render: (r) => str(r.body ?? r.text).slice(0, 100) },
              { key: 'author', label: 'Author', render: (r) => str(r.authorName ?? r.customerId) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'actions', label: 'Moderation',
                render: (r) => (
                  <span className="btn-row">
                    <button type="button" className="btn secondary small" disabled={action.busy} onClick={() => void setStatus(str(r.id), 'published')}>Publish</button>
                    <button type="button" className="btn secondary small" disabled={action.busy} onClick={() => void setStatus(str(r.id), 'hidden')}>Hide</button>
                    <button type="button" className="btn secondary small" onClick={() => setReplying(str(r.id))}>Reply</button>
                  </span>
                ),
              },
              { key: 'createdAt', label: 'Submitted', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>

      <Card title="Review request links">
        {requests.loading ? (
          <LoadingNote />
        ) : requests.data === null ? (
          <Unavailable title="The request list is not available on the running API yet.">
            Sending a request above still posts to POST /v1/admin/reviews/requests, which issues
            the link and records the send. Listing past requests needs GET
            /v1/admin/reviews/requests on the running API.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No review requests sent yet."
            columns={[
              { key: 'customerId', label: 'Customer' },
              { key: 'orderNumber', label: 'Order' },
              { key: 'channel', label: 'Channel' },
              { key: 'status', label: 'Send state', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'link', label: 'Link', render: (r) => str(r.link ?? r.url) ? 'Issued by the API' : 'Not issued' },
              { key: 'createdAt', label: 'Sent', date: true },
            ]}
            rows={requestItems}
          />
        )}
      </Card>

      {replying ? (
        <Modal title="Reply to review" onClose={() => setReplying('')}>
          <form onSubmit={saveReply}>
            <ActionError error={action.error} />
            <Field label="Public reply">
              <TextArea required value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Post reply</button>
          </form>
        </Modal>
      ) : null}

      {showRequest ? (
        <Modal title="Send a review request" onClose={() => setShowRequest(false)}>
          <form onSubmit={sendRequest}>
            <ActionError error={action.error} />
            <p className="note">
              The API issues the review link and sends it on the chosen channel. With no provider
              configured, the request records not-configured instead of sent.
            </p>
            <div className="form-grid">
              <Field label="Customer ID">
                <TextInput required value={requestForm.customerId} onChange={(e) => setRequestForm({ ...requestForm, customerId: e.target.value })} />
              </Field>
              <Field label="Order number">
                <TextInput required value={requestForm.orderNumber} onChange={(e) => setRequestForm({ ...requestForm, orderNumber: e.target.value })} />
              </Field>
              <Field label="Channel">
                <SelectInput value={requestForm.channel} onChange={(e) => setRequestForm({ ...requestForm, channel: e.target.value })}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </SelectInput>
              </Field>
            </div>
            <button type="submit" className="btn" disabled={action.busy}>Send request</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
