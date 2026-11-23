'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DosteloApiClient } from '@dostelo/api-client';
import { api, toUiError, type UiError } from './api';
import { expireSession } from './session';

export interface DataState<T> {
  data: T | null;
  error: UiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data from the API for a page or widget, with the portal's
 * shared error handling: a 401 expires the session and redirects
 * to login, a 403 and an unreachable API surface as a UiError the
 * page renders in place, and nothing here ever throws into a
 * component. Each widget uses its own useData so one failing read
 * does not blank the whole page.
 */
export function useData<T>(
  fetcher: (client: DosteloApiClient) => Promise<T>,
  deps: unknown[] = [],
): DataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcherRef
      .current(api)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const uiError = toUiError(caught);
        if (uiError.kind === 'unauthorized') {
          expireSession();
          return;
        }
        setError(uiError);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, ...deps]);

  return { data, error, loading, reload };
}
