import { ApiError, createApiClient } from '@dostelo/api-client';
import type { Money } from '@dostelo/types';
import { getAccessToken } from './session';

/**
 * The portal's API client and error vocabulary.
 *
 * The base URL comes from NEXT_PUBLIC_API_URL (inlined by Next.js
 * at build time) and defaults to the API's local development
 * address, matching API_PORT in apps/api/src/main.ts.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  accessToken: () => getAccessToken(),
});

export type UiErrorKind = 'unauthorized' | 'forbidden' | 'unreachable' | 'api';

export interface UiError {
  kind: UiErrorKind;
  message: string;
  status?: number;
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

function bodyMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as ApiErrorBody).message;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : null;
}

/** Maps anything a page can catch onto the portal's error kinds:
 * 401 session expiry, 403 missing permission, a network failure
 * (API unreachable), or a plain API error with its message. */
export function toUiError(caught: unknown): UiError {
  if (caught instanceof ApiError) {
    if (caught.status === 401) {
      return {
        kind: 'unauthorized',
        status: 401,
        message: 'Your session has expired. Please sign in again.',
      };
    }
    if (caught.status === 403) {
      return {
        kind: 'forbidden',
        status: 403,
        message:
          bodyMessage(caught.body) ??
          'Your role does not have permission for this.',
      };
    }
    return {
      kind: 'api',
      status: caught.status,
      message:
        bodyMessage(caught.body) ??
        `The API answered with status ${caught.status}.`,
    };
  }
  // fetch itself rejected: DNS, connection refused, CORS. The API
  // is not reachable from this browser right now.
  return {
    kind: 'unreachable',
    message: `Cannot reach the API at ${API_BASE_URL}. Is it running?`,
  };
}

/** Formats integer minor units as taka, for example ৳1,850.00. */
export function formatMoney(money: Money): string {
  const taka = money.amountMinor / 100;
  return `৳${taka.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatMinor(amountMinor: number): string {
  return formatMoney({ amountMinor, currency: 'BDT' });
}

/** Compact local date and time for tables and timelines. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
