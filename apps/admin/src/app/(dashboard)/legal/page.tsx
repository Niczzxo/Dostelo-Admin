'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Scale } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote,
  Modal, ModuleHeader, TextArea, TextInput,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../lib/types';

/* Legal & Compliance: the editable legal documents stored in the
   API (privacy, terms, returns, refund, shipping, warranty), with
   versions, publish and unpublish, version restore and the sync
   status. The storefront serves its ported policy text until it is
   wired to these documents; the sync status below says exactly
   what the API reports about that, and nothing here claims the
   storefront changed when it has not. */
export default function LegalPage() {
  const docs = useData((c) => c.listLegalDocuments());
  const sync = useData((c) => c.getLegalSyncStatus());
  const action = useAction();
  const [selectedSlug, setSelectedSlug] = useState('');
  const detail = useData((c) => (selectedSlug ? c.getLegalDocument(selectedSlug) : Promise.resolve(null)), [selectedSlug]);
  const versions = useData((c) => (selectedSlug ? c.listLegalVersions(selectedSlug) : Promise.resolve(null)), [selectedSlug]);
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);
  const [newDoc, setNewDoc] = useState({ slug: '', title: '', body: '' });

  const items = itemsOf(docs.data);
  const syncRec = asRec(sync.data);
  const detailRec = asRec(detail.data);
  const versionItems = itemsOf(versions.data);

  async function saveBody(event: FormEvent) {
    event.preventDefault();
    const dto = { ...detailRec, body: body || str(detailRec.body ?? detailRec.content) };
    if (await action.run((c) => c.updateLegalDocument(selectedSlug, dto))) {
      detail.reload();
      versions.reload();
      docs.reload();
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.createLegalDocument(newDoc))) {
      setCreating(false);
      docs.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Scale}
        title="Legal & Compliance"
        description="Editable legal documents stored in the API, with versions and publish state."
      >
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          <Plus size={15} /> New document
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <Card title="Storefront sync status">
        {sync.loading ? (
          <LoadingNote />
        ) : sync.error ? (
          <ErrorNote error={sync.error} onRetry={sync.reload} />
        ) : (
          <KeyValues
            entries={[
              ['Synced', syncRec.synced === true ? 'Yes' : 'Not yet'],
              ['Detail', str(syncRec.message ?? syncRec.note) || 'The storefront serves its ported policy text until it reads these documents.'],
            ]}
          />
        )}
      </Card>
      <Card title="Documents">
        {docs.loading ? (
          <LoadingNote />
        ) : docs.error ? (
          <ErrorNote error={docs.error} onRetry={docs.reload} />
        ) : (
          <DataTable
            emptyText="No legal documents stored yet."
            columns={[
              { key: 'title', label: 'Document', render: (r) => <button type="button" className="btn secondary small" onClick={() => { setSelectedSlug(str(r.slug)); setBody(str(r.body ?? r.content)); }}>{str(r.title ?? r.slug)}</button> },
              { key: 'slug', label: 'Slug' },
              { key: 'published', label: 'State', render: (r) => <Badge tone={r.published === true ? 'ok' : 'warn'}>{r.published === true ? 'Published' : 'Draft'}</Badge> },
              { key: 'updatedAt', label: 'Updated', date: true },
              {
                key: 'pub', label: 'Action',
                render: (r) => (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={action.busy}
                    onClick={async () => {
                      const slug = str(r.slug);
                      const fn = r.published === true ? 'unpublishLegalDocument' : 'publishLegalDocument';
                      if (await action.run((c) => c[fn](slug))) docs.reload();
                    }}
                  >
                    {r.published === true ? 'Unpublish' : 'Publish'}
                  </button>
                ),
              },
            ]}
            rows={items}
          />
        )}
      </Card>

      {selectedSlug ? (
        <>
          <Card title={`Edit: ${selectedSlug}`}>
            {detail.loading ? (
              <LoadingNote />
            ) : detail.error ? (
              <ErrorNote error={detail.error} onRetry={detail.reload} />
            ) : (
              <form onSubmit={saveBody}>
                <Field label="Document body">
                  <TextArea
                    style={{ minHeight: 220 }}
                    value={body || str(detailRec.body ?? detailRec.content)}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </Field>
                <button type="submit" className="btn" disabled={action.busy}>Save new version</button>
              </form>
            )}
          </Card>
          <Card title="Versions">
            {versions.loading ? (
              <LoadingNote />
            ) : (
              <DataTable
                searchable={false}
                emptyText="No earlier versions stored."
                columns={[
                  { key: 'id', label: 'Version', render: (r) => str(r.id ?? r.version).slice(0, 12) },
                  { key: 'createdAt', label: 'Saved', date: true },
                  { key: 'authorId', label: 'Author' },
                  {
                    key: 'restore', label: 'Action',
                    render: (r) => (
                      <button
                        type="button"
                        className="btn secondary small"
                        disabled={action.busy}
                        onClick={async () => {
                          if (await action.run((c) => c.restoreLegalVersion(selectedSlug, str(r.id ?? r.version)))) {
                            detail.reload();
                            versions.reload();
                          }
                        }}
                      >
                        Restore this version
                      </button>
                    ),
                  },
                ]}
                rows={versionItems}
              />
            )}
          </Card>
        </>
      ) : null}

      {creating ? (
        <Modal title="New legal document" onClose={() => setCreating(false)} wide>
          <form onSubmit={create}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Slug">
                <TextInput required value={newDoc.slug} onChange={(e) => setNewDoc({ ...newDoc, slug: e.target.value })} placeholder="warranty-policy" />
              </Field>
              <Field label="Title">
                <TextInput required value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} />
              </Field>
            </div>
            <Field label="Body">
              <TextArea required value={newDoc.body} onChange={(e) => setNewDoc({ ...newDoc, body: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Create document (draft)</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
