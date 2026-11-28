'use client';

import { BarList } from './ui';

/* Chart primitives for the admin portal, fresh rebuild 2026-11-28.
   Deliberately simple: labelled bar lists drawn from real API
   aggregates, with the exact values beside every bar. No chart
   library, no decorative sparklines, and nothing is rendered from
   invented data: an empty aggregate renders the empty state in
   BarList. */

export function ValueBars({
  rows,
  format,
}: {
  rows: Array<{ label: string; value: number }>;
  format?: (value: number) => string;
}) {
  return <BarList rows={rows} format={format} />;
}
