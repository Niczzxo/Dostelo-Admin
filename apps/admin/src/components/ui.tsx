'use client';

import type { ReactNode } from 'react';
import type { UiError } from '../lib/api';

/** Small shared building blocks for the admin pages, styled with
 * Tailwind utility classes whose values resolve to the Dostelo
 * design tokens through the theme mapping in
 * tailwind.config.ts (see the Tailwind notes in this app's
 * README). The utility values below reproduce, value for value,
 * the hand-written classes these components used before:
 * page-head, note, muted, error-note, card, stat-card, badge and
 * the btn plus btn-small pair. The btn pair keeps its
 * font: inherit declaration through the arbitrary property
 * utility, because no font-family utility expresses inherit. */

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center flex-wrap gap-3 justify-between mb-5">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function LoadingNote({ label = 'Loading...' }: { label?: string }) {
  return <p className="leading-[1.6] my-3 text-muted">{label}</p>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="leading-[1.6] my-3 text-muted">{children}</p>;
}

export function ErrorNote({
  error,
  onRetry,
}: {
  error: UiError;
  onRetry?: () => void;
}) {
  return (
    <div
      className="leading-[1.6] my-3 flex items-center gap-3 justify-between bg-surface border border-solid border-line rounded-sm text-ink px-4 py-3"
      role="alert"
    >
      <span>{error.message}</span>
      {onRetry && error.kind !== 'forbidden' ? (
        <button
          type="button"
          className="bg-dark border border-solid border-dark rounded-sm text-on-dark cursor-pointer [font:inherit] px-3 py-[6px] text-[13px]"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-surface border border-solid border-line rounded-md p-5">
      <div className="text-muted text-[13px]">{label}</div>
      <div className="text-ink text-[28px] font-bold mt-[6px]">{value}</div>
      {note ? <div className="text-muted text-[13px] mt-[6px]">{note}</div> : null}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="bg-chip rounded-[999px] text-ink inline-block text-[12px] px-[10px] py-[2px] whitespace-nowrap">
      {children}
    </span>
  );
}

/* Redesign components (2026-11-25): the shared building blocks of
 * the premium portal look, styled by the component classes in
 * globals.css (module-head, kpi-card, band-chip, status-tabs,
 * pager, switch, drawer, modal). Pages compose these so every
 * module shares one card, table, filter and badge language. */

import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

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
          <Icon size={23} strokeWidth={1.9} />
        </span>
        <div>
          <h1>{title}</h1>
          {description ? <p className="module-desc">{description}</p> : null}
        </div>
      </div>
      {children ? <div className="module-head-actions">{children}</div> : null}
    </div>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  note,
  delta,
  tone = 'purple',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
  delta?: { text: string; direction: 'up' | 'down' } | null;
  tone?: 'purple' | 'green' | 'blue' | 'orange';
}) {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <div className="kpi-top">
        <span className="kpi-icon">
          <Icon size={21} strokeWidth={2} />
        </span>
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-note">
        {delta ? (
          <span
            className={`kpi-delta ${delta.direction === 'down' ? 'down' : 'up'}`}
          >
            {delta.direction === 'down' ? '▼' : '▲'} {delta.text}
          </span>
        ) : null}
        {note ? <span>{note}</span> : null}
      </div>
    </div>
  );
}

export function DeltaChip({
  current,
  previous,
  suffix = '',
}: {
  current: number;
  previous: number;
  suffix?: string;
}) {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  const down = change < 0;
  return (
    <span className={`delta-chip${down ? ' down' : ''}`}>
      {down ? '▼' : '▲'} {Math.abs(change).toFixed(1)}%{suffix}
    </span>
  );
}

export function BandChip({
  band,
}: {
  band: 'hot' | 'warm' | 'cold' | 'green' | 'grey' | 'purple';
}) {
  const labels: Record<string, string> = {
    hot: 'Hot',
    warm: 'Warm',
    cold: 'Cold',
    green: 'Yes',
    grey: 'No',
    purple: 'Info',
  };
  return <span className={`band-chip ${band}`}>{labels[band] ?? band}</span>;
}

export function ScoreBand({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="muted">Not scored</span>;
  }
  const band = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  return (
    <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
      <strong className="num">{score}</strong>
      <BandChip band={band} />
    </span>
  );
}

export function StatusTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="status-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`status-tab${active === tab.key ? ' active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className="tab-count">{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const pages: number[] = [];
  for (let i = 1; i <= pageCount; i += 1) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
  }
  const shown = [...new Set(pages)];
  return (
    <div className="pager">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        ‹
      </button>
      {shown.map((value, index) => (
        <span key={value} style={{ display: 'inline-flex', gap: 6 }}>
          {index > 0 && shown[index - 1] !== value - 1 ? (
            <span className="muted">…</span>
          ) : null}
          <button
            type="button"
            className={value === page ? 'active' : ''}
            onClick={() => onChange(value)}
          >
            {value}
          </button>
        </span>
      ))}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className="switch-track" />
    </label>
  );
}

export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <div className="drawer-head">
          <h2 style={{ margin: 0, fontSize: 19 }}>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <h2 style={{ margin: 0, fontSize: 19 }}>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CardHead({
  icon: Icon,
  title,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card-head">
      <span className="card-title">
        {Icon ? (
          <span className="card-title-icon">
            <Icon size={17} strokeWidth={2} />
          </span>
        ) : null}
        {title}
      </span>
      {children}
    </div>
  );
}

/** Percentage change between two periods, or null when the
 * previous period has no data (the portal omits deltas it cannot
 * compute rather than inventing them). */
export function deltaFor(
  current: number,
  previous: number,
): { text: string; direction: 'up' | 'down' } | null {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return {
    text: `${Math.abs(change).toFixed(1)}% vs previous period`,
    direction: change < 0 ? 'down' : 'up',
  };
}

/** Client-side pagination helper for list pages. */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
