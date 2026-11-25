'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  BadgeCheck,
  BookOpen,
  Check,
  Eye,
  FileText,
  History,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Scale,
  ShieldCheck,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type {
  LegalDocument,
  LegalDocumentVersion,
  LegalSyncStatus,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import {
  CardHead,
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

/**
 * Legal and Compliance (redesign): the store's legal documents
 * and policy content, stored through the API. Draft and published
 * stay separate: saving edits the draft only, publishing copies
 * the draft to the public endpoint (GET /v1/legal/<slug>) and
 * stores a version, and unpublishing removes it from that
 * endpoint. Descriptions, statuses and timestamps all come from
 * the API records; nothing is hardcoded here.
 *
 * Storefront boundary, stated plainly: the Next.js storefront
 * policy routes exist for shipping, returns and warranty; the
 * static GitHub Pages live site has its policy text built in and
 * does not read this API.
 */

const PAGE_SIZE = 10;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SLUG_ICONS: Record<string, LucideIcon> = {
  privacy: ShieldCheck,
  terms: FileText,
  returns: RotateCcw,
  refund: Wallet,
  shipping: Truck,
  warranty: BadgeCheck,
};

function iconFor(slug: string): LucideIcon {
  return SLUG_ICONS[slug] ?? FileText;
}

function StatusChip({ status }: { status: LegalDocument['status'] }) {
  if (status === 'published') {
    return <span className="band-chip green">Published</span>;
  }
  if (status === 'draft') {
    return <span className="band-chip warm">Draft</span>;
  }
  return <span className="band-chip grey">Not saved yet</span>;
}

/** The one plain rendering used for previews on this page: blank
 * lines start a new paragraph and lines starting with "# " render
 * as headings. The public endpoint serves the stored text. */
function RenderedBody({ text }: { text: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  if (blocks.length === 0) {
    return <EmptyNote>Nothing is stored for this document yet.</EmptyNote>;
  }
  return (
    <div>
      {blocks.map((block, index) => {
        if (block.startsWith('# ')) {
          return (
            <h3 key={index} style={{ fontSize: 15.5, margin: '14px 0 6px' }}>
              {block.slice(2).trim()}
            </h3>
          );
        }
        return (
          <p
            key={index}
            style={{ lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: '0 0 10px' }}
          >
            {block}
          </p>
        );
      })}
    </div>
  );
}

type DocTab = 'all' | 'published' | 'draft';

export default function LegalPage() {
  const { session } = useAuth();
  const canManage =
    session.principal?.permissions.includes('settings.manage') ?? false;
  const documents = useData((client) => client.listLegalDocuments(), []);
  const sync = useData((client) => client.getLegalSyncStatus(), []);
  const [tab, setTab] = useState<DocTab>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [menuSlug, setMenuSlug] = useState<string | null>(null);
  const [editorDoc, setEditorDoc] = useState<LegalDocument | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<LegalDocument | null>(null);
  const [versionsDoc, setVersionsDoc] = useState<LegalDocument | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [storePreviewOpen, setStorePreviewOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const items = documents.data?.items ?? [];
  const publishedCount = items.filter(
    (doc) => doc.status === 'published',
  ).length;
  const draftCount = items.length - publishedCount;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((doc) => {
      if (tab === 'published' && doc.status !== 'published') return false;
      if (tab === 'draft' && doc.status === 'published') return false;
      if (!query) return true;
      return (
        doc.title.toLowerCase().includes(query) ||
        doc.slug.toLowerCase().includes(query)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents.data, tab, search]);

  const pageRows = paginate(filtered, page, PAGE_SIZE);
  const publishedDocs = items.filter((doc) => doc.status === 'published');

  function reloadAll(): void {
    documents.reload();
    sync.reload();
  }

  async function openEditor(doc: LegalDocument): Promise<void> {
    setEditorLoading(true);
    setActionError(null);
    setNote(null);
    try {
      const fresh = await api.getLegalDocument(doc.slug);
      setEditorDoc(fresh);
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setActionError(uiError.message);
      setEditorDoc(doc);
    } finally {
      setEditorLoading(false);
    }
  }

  async function act(
    doc: LegalDocument,
    kind: 'publish' | 'unpublish',
  ): Promise<void> {
    setBusySlug(doc.slug);
    setActionError(null);
    setNote(null);
    try {
      if (kind === 'publish') {
        await api.publishLegalDocument(doc.slug);
        setNote(`Published ${doc.title}.`);
      } else {
        await api.unpublishLegalDocument(doc.slug);
        setNote(`Unpublished ${doc.title}.`);
      }
      reloadAll();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setActionError(uiError.message);
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <section>
      <ModuleHeader
        icon={Scale}
        title="Legal and Compliance"
        description="Manage your store's legal documents and policy content. These documents are used on your storefront."
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setStorePreviewOpen(true)}
        >
          <Eye size={15} /> Preview Store Policies
        </button>
        {canManage ? (
          <button
            type="button"
            className="btn"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={15} /> Add Custom Document
          </button>
        ) : null}
      </ModuleHeader>

      {!canManage ? (
        <p className="note muted" style={{ marginTop: 0 }}>
          Your role can view legal documents; editing, publishing and
          adding documents needs the settings.manage permission.
        </p>
      ) : null}
      {note ? <p className="note">{note}</p> : null}
      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {documents.loading ? (
        <div className="kpi-grid">
          <KpiCard icon={FileText} label="Total Documents" value="..." tone="purple" />
          <KpiCard icon={BadgeCheck} label="Published" value="..." tone="green" />
          <KpiCard icon={Pencil} label="Draft or Not Saved" value="..." tone="orange" />
          <KpiCard icon={Link2} label="Storefront Linked" value="..." tone="blue" />
        </div>
      ) : documents.error || !documents.data ? (
        <div className="kpi-grid">
          <KpiCard icon={FileText} label="Total Documents" value="Unavailable" note="Could not load the documents list." tone="purple" />
          <KpiCard icon={BadgeCheck} label="Published" value="Unavailable" note="Could not load the documents list." tone="green" />
          <KpiCard icon={Pencil} label="Draft or Not Saved" value="Unavailable" note="Could not load the documents list." tone="orange" />
          <KpiCard icon={Link2} label="Storefront Linked" value="Unavailable" note="Could not load the documents list." tone="blue" />
        </div>
      ) : (
        <div className="kpi-grid">
          <KpiCard
            icon={FileText}
            label="Total Documents"
            value={items.length.toLocaleString('en-US')}
            note="Built-in and custom documents stored in the API"
            tone="purple"
          />
          <KpiCard
            icon={BadgeCheck}
            label="Published"
            value={publishedCount.toLocaleString('en-US')}
            note="Served by the public endpoint"
            tone="green"
          />
          <KpiCard
            icon={Pencil}
            label="Draft or Not Saved"
            value={draftCount.toLocaleString('en-US')}
            note="Working copies not on the public endpoint"
            tone="orange"
          />
          {sync.loading ? (
            <KpiCard icon={Link2} label="Storefront Linked" value="..." tone="blue" />
          ) : sync.error || !sync.data ? (
            <KpiCard
              icon={Link2}
              label="Storefront Linked"
              value="Unavailable"
              note="The sync status could not be loaded."
              tone="blue"
            />
          ) : (
            <KpiCard
              icon={Link2}
              label="Storefront Linked"
              value={sync.data.publishedCount.toLocaleString('en-US')}
              note="Published documents reported by the sync status"
              tone="blue"
            />
          )}
        </div>
      )}

      {editorLoading ? (
        <LoadingNote label="Loading document..." />
      ) : editorDoc ? (
        <DocumentEditor
          key={`${editorDoc.slug}-${editorDoc.updatedAt ?? 'new'}`}
          doc={editorDoc}
          canManage={canManage}
          onClose={() => setEditorDoc(null)}
          onChanged={(message) => {
            setNote(message);
            reloadAll();
          }}
          onOpenVersions={(doc) => setVersionsDoc(doc)}
        />
      ) : (
        <>
          <StatusTabs
            tabs={[
              { key: 'all', label: 'All Documents', count: items.length },
              { key: 'published', label: 'Published', count: publishedCount },
              { key: 'draft', label: 'Draft', count: draftCount },
            ]}
            active={tab}
            onChange={(key) => {
              setTab(key as DocTab);
              setPage(1);
            }}
          />

          <div className="card filter-card">
            <div className="filter-row">
              <label className="field">
                Search
                <input
                  className="input"
                  placeholder="Title or slug"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <div className="filter-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearch('');
                    setTab('all');
                    setPage(1);
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="dash-row" style={{ marginTop: 16 }}>
            <div className="card">
              <CardHead icon={FileText} title="Documents" />
              {documents.loading ? (
                <LoadingNote label="Loading documents..." />
              ) : null}
              {documents.error ? (
                <ErrorNote error={documents.error} onRetry={documents.reload} />
              ) : null}
              {documents.data && filtered.length === 0 ? (
                <EmptyNote>No documents match this filter.</EmptyNote>
              ) : null}
              {filtered.length > 0 ? (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Status</th>
                          <th>Stored Copy</th>
                          <th>Last Updated</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((doc) => {
                          const Icon = iconFor(doc.slug);
                          return (
                            <tr key={doc.slug}>
                              <td>
                                <span className="identity-cell">
                                  <span className="thumb" aria-hidden="true">
                                    <Icon size={17} />
                                  </span>
                                  <span>
                                    <span className="identity-main">
                                      {doc.title}
                                    </span>
                                    <span className="identity-sub">
                                      {doc.description}
                                    </span>
                                  </span>
                                </span>
                              </td>
                              <td>
                                <StatusChip status={doc.status} />
                              </td>
                              <td>
                                {doc.stored ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      gap: 6,
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Check size={15} /> Stored
                                  </span>
                                ) : (
                                  <span className="muted">-</span>
                                )}
                              </td>
                              <td>
                                {doc.updatedAt
                                  ? formatDateTime(doc.updatedAt)
                                  : 'Not saved yet'}
                              </td>
                              <td>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    gap: 6,
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="btn btn-small"
                                    onClick={() => void openEditor(doc)}
                                  >
                                    <Pencil size={13} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-small"
                                    onClick={() => setPreviewDoc(doc)}
                                  >
                                    <Eye size={13} /> Preview
                                  </button>
                                  <span className="menu-wrap">
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-small"
                                      aria-label={`More actions for ${doc.title}`}
                                      onClick={() =>
                                        setMenuSlug((current) =>
                                          current === doc.slug
                                            ? null
                                            : doc.slug,
                                        )
                                      }
                                    >
                                      <MoreHorizontal size={15} />
                                    </button>
                                    {menuSlug === doc.slug ? (
                                      <span className="topbar-menu">
                                        {canManage &&
                                        doc.status !== 'published' ? (
                                          <button
                                            type="button"
                                            className="topbar-menu-item"
                                            disabled={busySlug !== null}
                                            onClick={() => {
                                              setMenuSlug(null);
                                              void act(doc, 'publish');
                                            }}
                                          >
                                            <BadgeCheck size={14} /> Publish
                                          </button>
                                        ) : null}
                                        {canManage &&
                                        doc.status === 'published' ? (
                                          <button
                                            type="button"
                                            className="topbar-menu-item"
                                            disabled={busySlug !== null}
                                            onClick={() => {
                                              setMenuSlug(null);
                                              void act(doc, 'unpublish');
                                            }}
                                          >
                                            <RotateCcw size={14} /> Unpublish
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          className="topbar-menu-item"
                                          onClick={() => {
                                            setMenuSlug(null);
                                            setVersionsDoc(doc);
                                          }}
                                        >
                                          <History size={14} /> Version History
                                        </button>
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-foot">
                    <span className="muted">
                      {filtered.length} document{filtered.length === 1 ? '' : 's'}
                    </span>
                    <Pagination
                      page={page}
                      pageCount={pageCountFor(filtered.length, PAGE_SIZE)}
                      onChange={setPage}
                    />
                  </div>
                </>
              ) : null}
            </div>

            <div>
              <SyncCard sync={sync.data} loading={sync.loading} error={sync.error} onRetry={sync.reload} />
              <div className="card" style={{ marginTop: 16 }}>
                <CardHead icon={BookOpen} title="Guidelines" />
                <ul className="timeline">
                  <li>Write clear and customer-friendly policies.</li>
                  <li>Follow your business and local regulations.</li>
                  <li>Use plain language and avoid legal jargon.</li>
                  <li>Keep your policies up to date.</li>
                </ul>
              </div>
              <div className="card" style={{ marginTop: 16 }}>
                <CardHead icon={Scale} title="Need Help?" />
                <p className="note muted" style={{ marginTop: 0 }}>
                  Learn how to write effective policy documents for
                  your store.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => setGuideOpen(true)}
                >
                  <BookOpen size={14} /> View Policy Guide
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {previewDoc ? (
        <Modal title={previewDoc.title} onClose={() => setPreviewDoc(null)}>
          <p className="note muted" style={{ marginTop: 0 }}>
            {previewDoc.status === 'published' &&
            previewDoc.publishedBody !== null &&
            previewDoc.publishedBody !== previewDoc.body
              ? 'Showing the current draft. The published version on the public endpoint differs from this draft.'
              : previewDoc.status === 'published'
                ? 'Showing the published document.'
                : 'Showing the current draft. This document is not published.'}
          </p>
          <RenderedBody
            text={
              previewDoc.status === 'published' &&
              previewDoc.publishedBody !== null &&
              previewDoc.publishedBody === previewDoc.body
                ? previewDoc.publishedBody
                : previewDoc.body
            }
          />
          <p className="muted" style={{ fontSize: 12.5 }}>
            Public path: /v1/legal/{previewDoc.slug}
          </p>
        </Modal>
      ) : null}

      {versionsDoc ? (
        <VersionsModal
          doc={versionsDoc}
          canManage={canManage}
          onClose={() => setVersionsDoc(null)}
          onRestored={(message) => {
            setVersionsDoc(null);
            setEditorDoc(null);
            setNote(message);
            reloadAll();
          }}
        />
      ) : null}

      {addOpen ? (
        <AddDocumentModal
          onClose={() => setAddOpen(false)}
          onCreated={(created) => {
            setAddOpen(false);
            setNote(`Created ${created.title} as a draft.`);
            reloadAll();
          }}
        />
      ) : null}

      {storePreviewOpen ? (
        <Modal
          title="Store Policies"
          onClose={() => setStorePreviewOpen(false)}
        >
          <p className="note muted" style={{ marginTop: 0 }}>
            The published documents served by the public endpoint.
            Each one is available as text at its public path.
          </p>
          {documents.loading ? (
            <LoadingNote label="Loading documents..." />
          ) : null}
          {documents.error ? (
            <ErrorNote error={documents.error} onRetry={documents.reload} />
          ) : null}
          {documents.data && publishedDocs.length === 0 ? (
            <EmptyNote>
              No documents are published yet, so the public endpoint
              serves none.
            </EmptyNote>
          ) : null}
          {publishedDocs.length > 0 ? (
            <ul className="timeline">
              {publishedDocs.map((doc) => (
                <li key={doc.slug}>
                  <strong>{doc.publishedTitle ?? doc.title}</strong>
                  <br />
                  <code>/v1/legal/{doc.slug}</code>
                  {doc.publishedAt ? (
                    <span className="muted">
                      {' '}
                      (published {formatDateTime(doc.publishedAt)})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="note muted">
            Boundary: the Next.js storefront policy routes exist for
            shipping, returns and warranty; the static GitHub Pages
            live site has its policy text built in and does not read
            this API.
          </p>
        </Modal>
      ) : null}

      {guideOpen ? (
        <Modal title="Policy Writing Guide" onClose={() => setGuideOpen(false)}>
          <p className="note muted" style={{ marginTop: 0 }}>
            A short, practical guide for writing the policy documents
            your customers actually read.
          </p>
          <h3 style={{ fontSize: 15, margin: '14px 0 6px' }}>
            Write clear and customer-friendly policies
          </h3>
          <p style={{ lineHeight: 1.65, margin: '0 0 10px' }}>
            Start each document with the answer a customer came for:
            what is covered, what is not, and what to do next. Put the
            most common case first and the exceptions after it.
          </p>
          <h3 style={{ fontSize: 15, margin: '14px 0 6px' }}>
            Follow your business and local regulations
          </h3>
          <p style={{ lineHeight: 1.65, margin: '0 0 10px' }}>
            A policy is a promise the store has to keep. Write only
            what your operation can deliver, and check the wording
            against the consumer and commerce rules that apply to
            your business before publishing.
          </p>
          <h3 style={{ fontSize: 15, margin: '14px 0 6px' }}>
            Use plain language and avoid legal jargon
          </h3>
          <p style={{ lineHeight: 1.65, margin: '0 0 10px' }}>
            Use short sentences and everyday words. If a term needs a
            definition, define it in the sentence where it first
            appears. A customer who understands the policy is less
            likely to dispute it later.
          </p>
          <h3 style={{ fontSize: 15, margin: '14px 0 6px' }}>
            Keep your policies up to date
          </h3>
          <p style={{ lineHeight: 1.65, margin: '0 0 10px' }}>
            Review each document whenever delivery charges, return
            windows, warranty coverage or payment methods change.
            Save edits as a draft, read the preview, and publish only
            when the draft says exactly what the store does today.
          </p>
        </Modal>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Storefront sync card                                               */
/* ------------------------------------------------------------------ */

function SyncCard({
  sync,
  loading,
  error,
  onRetry,
}: {
  sync: LegalSyncStatus | null;
  loading: boolean;
  error: import('../../../lib/api').UiError | null;
  onRetry: () => void;
}) {
  return (
    <div className="card">
      <CardHead icon={Link2} title="Storefront Sync" />
      {loading ? <LoadingNote label="Loading sync status..." /> : null}
      {error ? <ErrorNote error={error} onRetry={onRetry} /> : null}
      {sync ? (
        <>
          <p className="note" style={{ marginTop: 0 }}>
            {sync.publishedCount === 0
              ? 'Storefront link pending. Save and publish your policy documents to make them available on the storefront.'
              : `Serving ${sync.publishedCount} published document${sync.publishedCount === 1 ? '' : 's'} through the public endpoint.`}
          </p>
          <dl className="kv">
            <dt>Published documents</dt>
            <dd>{sync.publishedCount}</dd>
            <dt>Last synchronization</dt>
            <dd>
              {sync.lastSyncAt
                ? formatDateTime(sync.lastSyncAt)
                : 'No publish or unpublish event recorded yet'}
            </dd>
            <dt>Sync errors</dt>
            <dd>
              {sync.errors.length === 0
                ? 'None recorded'
                : sync.errors.join('; ')}
            </dd>
          </dl>
          <p className="note muted">
            The endpoint serves directly from the same store, so
            there is no separate sync step: publishing here is what
            makes a document available.
          </p>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                             */
/* ------------------------------------------------------------------ */

function DocumentEditor({
  doc,
  canManage,
  onClose,
  onChanged,
  onOpenVersions,
}: {
  doc: LegalDocument;
  canManage: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
  onOpenVersions: (doc: LegalDocument) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const dirty = title !== doc.title || body !== doc.body;
  const draftDiffers =
    doc.status === 'published' &&
    doc.publishedBody !== null &&
    body !== doc.publishedBody;

  function requestClose(): void {
    if (
      dirty &&
      !window.confirm(
        'You have unsaved changes in this document. Close the editor and discard them?',
      )
    ) {
      return;
    }
    onClose();
  }

  async function saveDraft(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    setSavedNote(null);
    try {
      const saved = await api.updateLegalDocument(doc.slug, {
        title: title.trim(),
        body,
      });
      setTitle(saved.title);
      setBody(saved.body);
      setSavedNote(`Draft saved for ${saved.title}.`);
      onChanged(`Draft saved for ${saved.title}.`);
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function publish(): Promise<void> {
    if (
      dirty &&
      !window.confirm(
        'This document has unsaved changes. Publishing uses the last saved draft, not the text currently in the editor. Continue?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const published = await api.publishLegalDocument(doc.slug);
      onChanged(`Published ${published.title}.`);
      onClose();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function unpublish(): Promise<void> {
    if (
      !window.confirm(
        `Unpublish ${doc.title}? It will no longer be served by the public endpoint.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.unpublishLegalDocument(doc.slug);
      onChanged(`Unpublished ${updated.title}.`);
      onClose();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  const Icon = iconFor(doc.slug);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <CardHead icon={Icon} title={doc.title}>
        <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          <StatusChip status={doc.status} />
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => onOpenVersions(doc)}
          >
            <History size={14} /> Version History
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={requestClose}
          >
            Back to documents
          </button>
        </span>
      </CardHead>
      <p className="note muted" style={{ marginTop: 0 }}>
        {doc.description}
      </p>
      {draftDiffers ? (
        <p className="note" role="status">
          Draft differs from the published version. The public
          endpoint still serves the published version until you
          publish again.
        </p>
      ) : null}
      {dirty ? (
        <p className="note muted">You have unsaved changes.</p>
      ) : null}

      {canManage ? (
        <form onSubmit={saveDraft}>
          <label className="field">
            Title
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            Body
            <textarea
              className="input"
              rows={16}
              style={{ fontFamily: 'monospace' }}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Nothing is stored for this document yet. Write the policy text here and save it as a draft."
            />
          </label>
          <p className="note muted">
            Formatting: a blank line starts a new paragraph, and
            lines starting with &quot;# &quot; render as headings in
            the preview. The public endpoint serves the stored text.
          </p>
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Working...' : 'Save as Draft'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowPreview((value) => !value)}
            >
              <Eye size={15} /> {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            {doc.status !== 'published' ? (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void publish()}
              >
                <BadgeCheck size={15} /> Publish
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void unpublish()}
              >
                <RotateCcw size={15} /> Unpublish
              </button>
            )}
          </div>
          <p className="note muted">
            Publishing copies the draft to the public endpoint at{' '}
            <code>/v1/legal/{doc.slug}</code> and stores a version.
            Saving a draft never changes what the public endpoint
            serves.
          </p>
          {savedNote ? <p className="note">{savedNote}</p> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="note muted">
          Your role cannot edit legal documents (the settings.manage
          permission is required). The current draft is shown in the
          preview below.
        </p>
      )}

      {showPreview || !canManage ? (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>
            Preview: {title || doc.title}
          </h3>
          <RenderedBody text={body} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Version history                                                    */
/* ------------------------------------------------------------------ */

function VersionsModal({
  doc,
  canManage,
  onClose,
  onRestored,
}: {
  doc: LegalDocument;
  canManage: boolean;
  onClose: () => void;
  onRestored: (message: string) => void;
}) {
  const versions = useData(
    (client) => client.listLegalVersions(doc.slug),
    [doc.slug],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(version: LegalDocumentVersion): Promise<void> {
    if (
      !window.confirm(
        `Restore version ${version.version} of ${doc.title} as a new draft? The published version and the history stay unchanged.`,
      )
    ) {
      return;
    }
    setBusyId(version.id);
    setError(null);
    try {
      const restored = await api.restoreLegalVersion(doc.slug, version.id);
      onRestored(
        `Restored version ${version.version} of ${restored.title} as a new draft.`,
      );
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title={`Version History: ${doc.title}`} onClose={onClose}>
      <p className="note muted" style={{ marginTop: 0 }}>
        Restoring creates a new draft from that version. It never
        rewrites history and never publishes.
      </p>
      {versions.loading ? (
        <LoadingNote label="Loading versions..." />
      ) : null}
      {versions.error ? (
        <ErrorNote error={versions.error} onRetry={versions.reload} />
      ) : null}
      {versions.data && versions.data.items.length === 0 ? (
        <EmptyNote>
          No versions yet. A version is stored each time this
          document is published.
        </EmptyNote>
      ) : null}
      {versions.data && versions.data.items.length > 0 ? (
        <ul className="timeline">
          {versions.data.items.map((version) => (
            <li key={version.id}>
              <strong>Version {version.version}</strong>: {version.title}
              <br />
              <span className="muted">
                Published {formatDateTime(version.publishedAt)}
                {version.publishedById
                  ? ` by ${version.publishedById}`
                  : ''}
              </span>
              {canManage ? (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={busyId !== null}
                    onClick={() => void restore(version)}
                  >
                    <RotateCcw size={13} />{' '}
                    {busyId === version.id ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Add custom document                                                */
/* ------------------------------------------------------------------ */

function AddDocumentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (doc: LegalDocument) => void;
}) {
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const cleanSlug = slug.trim();
    if (!SLUG_PATTERN.test(cleanSlug)) {
      setError(
        'The slug must be lowercase letters, numbers and single hyphens, for example cookie-policy.',
      );
      return;
    }
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createLegalDocument({
        slug: cleanSlug,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      onCreated(created);
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add Custom Document" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          Slug
          <input
            className="input"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="cookie-policy"
            required
          />
        </label>
        <p className="note muted">
          Lowercase letters, numbers and single hyphens only. The
          slug becomes the public path if the document is published:{' '}
          <code>/v1/legal/&lt;slug&gt;</code>.
        </p>
        <label className="field" style={{ marginTop: 10 }}>
          Title
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="field" style={{ marginTop: 10 }}>
          Description (optional)
          <input
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Creating...' : 'Create Document'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
        <p className="note muted">
          The new document appears in the table as a Draft. Write its
          content in the editor, then publish when it is ready.
        </p>
      </form>
    </Modal>
  );
}
