import type { Rec } from './types';

/* Client-side CSV export of rows the page already loaded from the
   API. The export contains exactly what the table showed, nothing
   is fetched or invented for it. */

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Rec[], columns: string[]): string {
  const head = columns.join(',');
  const body = rows.map((row) => columns.map((col) => cell(row[col])).join(','));
  return [head, ...body].join('\n');
}

export function downloadCsv(filename: string, rows: Rec[], columns: string[]): void {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
