'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search, X, type LucideIcon } from 'lucide-react';
import type { UiError } from '../lib/api';
import { formatDateTime, moneyOf } from '../lib/api';
import { asRec, str, type Rec } from '../lib/types';

/* Shared building blocks for the admin pages, fresh rebuild
   2026-11-28. One vocabulary across every module: module header,
   stat cards, status badges, data tables with search and paging,
   form fields, modals, timelines and honest state notes. Styled by
   the component classes in globals.css, which carry the Dostelo
   storefront colour system. */

export function ModuleHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="module-head">
      <div className="module-head-main">
        <span className="module-icon">
          <Icon size={21} strokeWidth={1.9} />
        </span>
        <div>
          <h1>{title}</h1>
          {description ? <p className="module-desc">{description}</p> : null}
        </div>
      </div>
      {children ? <div className="btn-row">{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="module-head">
      <h1>{title}</h1>
      {children ? <div className="btn-row">{children}</div> : null}
    </div>
  );
}

export function LoadingNote({ label = 'Loading...' }: { label?: string }) {
  return <p className="note" role="status">{label}</p>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

export function ErrorNote({ error, onRetry }: { error: UiError; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <span>{error.message}</span>
      {onRetry && error.kind !== 'forbidden' ? (
        <button type="button" className="btn small" onClick={onRetry}>Retry</button>
      ) : null}
    </div>
  );
}

export function ActionError({ error }: { error: UiError | null }) {
  if (!error) return null;
  return (
    <div className="error-note" role="alert">
      <span>{error.message}</span>
    </div>
  );
}

/** Honest placeholder for a capability the running API does not
 * provide yet. Names the missing contract instead of faking data. */
export function Unavailable({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="unavailable-note">
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="card">
      {title ? (
        <div className="card-head">
          <h2>{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | 'dark';
}) {
  return <span className={tone ? `badge ${tone}` : 'badge'}>{children}</span>;
}

/** Status tone from the status word itself, so every module colours
 * the same states the same way. */
export function statusTone(status: string): 'ok' | 'warn' | 'bad' | 'dark' | undefined {
  const s = status.toLowerCase();
  if (['paid', 'delivered', 'completed', 'complete', 'approved', 'active', 'sent', 'delivered', 'published', 'resolved', 'closed', 'verified', 'succeeded', 'success'].includes(s)) return 'ok';
  if (['pending', 'processing', 'in-transit', 'in_transit', 'scheduled', 'draft', 'open', 'awaiting', 'partially-paid'].includes(s)) return 'warn';
  if (['failed', 'cancelled', 'canceled', 'rejected', 'refunded', 'not-configured', 'overdue', 'breached'].includes(s)) return 'bad';
  return undefined;
}

export function StatusBadge({ status }: { status: unknown }) {
  const text = str(status);
  if (!text) return <span className="note">Not set</span>;
  return <Badge tone={statusTone(text)}>{text.replace(/_/g, ' ')}</Badge>;
}

/* Table */

export interface Column {
  key: string;
  label: string;
  /** Render override. Receives the whole row. */
  render?: (row: Rec) => ReactNode;
  money?: boolean;
  date?: boolean;
}

export function cellText(row: Rec, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const rec = asRec(value);
    return str(rec.name ?? rec.title ?? rec.label ?? rec.id ?? '');
  }
  return String(value);
}

export function DataTable({
  columns,
  rows,
  emptyText = 'No records found.',
  pageSize = 25,
  searchable = true,
}: {
  columns: Column[];
  rows: Rec[];
  emptyText?: string;
  pageSize?: number;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((col) => cellText(row, col.key).toLowerCase().includes(q)),
    );
  }, [rows, query, columns]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div>
      {searchable ? (
        <div className="toolbar">
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <Search size={15} style={{ position: 'absolute', left: 9, color: 'var(--muted)' }} />
            <input
              className="input search-input"
              style={{ paddingLeft: 30 }}
              placeholder="Search this table"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              aria-label="Search this table"
            />
          </span>
          <span className="note">{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
        </div>
      ) : null}
      {visible.length === 0 ? (
        <EmptyNote>{emptyText}</EmptyNote>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr key={str(row.id ?? row.orderNumber ?? row.paymentId ?? row.sessionId ?? index)}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render
                        ? col.render(row)
                        : col.money
                          ? moneyOf(row[col.key]) || cellText(row, col.key)
                          : col.date
                            ? formatDateTime(row[col.key])
                            : cellText(row, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pageCount > 1 ? (
        <div className="pager">
          <button type="button" className="btn secondary small" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Previous
          </button>
          <span className="note">Page {safePage + 1} of {pageCount}</span>
          <button type="button" className="btn secondary small" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* Forms */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {hint ? <span className="hint"> {hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="input" />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="textarea" />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="select" />;
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={wide ? 'modal wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatusTabs({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="status-tabs" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'status-tab active' : 'status-tab'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Timeline({ items }: { items: Rec[] }) {
  if (items.length === 0) return <EmptyNote>No history recorded yet.</EmptyNote>;
  return (
    <ul className="timeline">
      {items.map((item, index) => (
        <li key={str(item.id ?? index)}>
          <div>
            <div style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {str(item.status ?? item.type ?? item.action ?? item.event ?? 'Event')}
            </div>
            <div className="note">
              {str(item.note ?? item.message ?? item.result ?? '')}
              {item.createdAt || item.occurredAt ? ` ${formatDateTime(item.createdAt ?? item.occurredAt)}` : ''}
              {item.actorId ? ` by ${str(item.actorId)}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function KeyValues({ entries }: { entries: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value === '' || value === null || value === undefined ? 'Not set' : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Horizontal bar list for report breakdowns, scaled to the
 * largest real value in the set. Values come from the caller. */
export function BarList({
  rows,
  format,
}: {
  rows: Array<{ label: string; value: number }>;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <EmptyNote>No data for this period.</EmptyNote>;
  return (
    <div>
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span>{row.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ display: 'block', width: `${Math.round((row.value / max) * 100)}%` }} />
          </span>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {format ? format(row.value) : row.value.toLocaleString('en-US')}
          </span>
        </div>
      ))}
    </div>
  );
}
