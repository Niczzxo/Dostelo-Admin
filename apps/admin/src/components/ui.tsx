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
