'use client';

import { useState, type FormEvent } from 'react';
import type { LegalDocumentSlug } from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Legal & Compliance: the six legal documents from the master
 * structure, stored through the API as settings documents.
 * Honest status: the migrated storefront still serves its
 * ported policy text from the legacy build, so edits saved here
 * are the canonical stored copy but are not yet what the
 * storefront displays. Wiring the storefront policy views to
 * these documents is the remaining step, stated here rather
 * than hidden.
 */
export default function LegalPage() {
  const { session } = useAuth();
  const canManage =
    session.principal?.permissions.includes('settings.manage') ?? false;
  const documents = useData((client) => client.listLegalDocuments(), []);
  const [selectedSlug, setSelectedSlug] =
    useState<LegalDocumentSlug | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected =
    documents.data?.items.find((doc) => doc.slug === selectedSlug) ?? null;

  function openDocument(slug: LegalDocumentSlug): void {
    const doc = documents.data?.items.find((entry) => entry.slug === slug);
    setSelectedSlug(slug);
    setTitle(doc?.title ?? '');
    setBody(doc?.body ?? '');
    setMessage(null);
    setError(null);
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedSlug) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.updateLegalDocument(selectedSlug, {
        title: title.trim(),
        body,
      });
      setTitle(saved.title);
      setBody(saved.body);
      setMessage(`Saved ${saved.title}.`);
      documents.reload();
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
      <PageHeader title="Legal & Compliance" />
      <p className="note" style={{ marginTop: 0, maxWidth: 760 }}>
        Storefront link pending: the storefront still displays the
        policy text ported from the legacy site. Documents saved here
        are stored in the API and are the canonical copy, but they do
        not change the storefront until its policy views are wired to
        read them.
      </p>
      {documents.loading ? (
        <LoadingNote label="Loading documents..." />
      ) : null}
      {documents.error ? (
        <ErrorNote error={documents.error} onRetry={documents.reload} />
      ) : null}
      {documents.data ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Document</th>
                <th>Stored copy</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {documents.data.items.map((doc) => (
                <tr
                  key={doc.slug}
                  className="clickable"
                  onClick={() => openDocument(doc.slug)}
                >
                  <td>{doc.title}</td>
                  <td>
                    <Badge>{doc.stored ? 'Saved' : 'Not saved yet'}</Badge>
                  </td>
                  <td>
                    {doc.updatedAt ? formatDateTime(doc.updatedAt) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <div className="card" style={{ marginTop: 20, maxWidth: 820 }}>
          <h2 style={{ fontSize: 17, marginTop: 0 }}>{selected.title}</h2>
          {canManage ? (
            <form onSubmit={save}>
              <label className="field">
                Title
                <input
                  className="input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ marginTop: 10 }}>
                Body (plain text)
                <textarea
                  className="input"
                  rows={14}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Nothing is stored for this document yet. Write the policy text here and save."
                />
              </label>
              <button
                type="submit"
                className="btn btn-small"
                disabled={busy}
                style={{ marginTop: 12 }}
              >
                {busy ? 'Saving...' : 'Save document'}
              </button>
              {message ? (
                <p className="note" style={{ margin: '8px 0 0' }}>
                  {message}
                </p>
              ) : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          ) : (
            <>
              <p className="note muted">
                Your role cannot edit legal documents (the
                settings.manage permission is required).
              </p>
              <p style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {selected.body || 'Nothing stored for this document yet.'}
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
