'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, toUiError, type UiError } from './api';
import { expireSession } from './session';

export interface DataState<T> {
  data: T | null;
  error: UiError | null;
  loading: boolean;
  reload: () => void;
}

/* Loads data from the API with the portal shared error handling:
   a 401 expires the session and redirects to login, a 403 and an
   unreachable API surface as a UiError the page renders in place,
   and nothing here throws into a component. Each widget uses its
   own useData so one failing read does not blank the whole page. */
export function useData<T>(
  fetcher: (client: typeof api) => Promise<T>,
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

/** Runs a mutation, reports its error as a UiError, and returns
 * true only when the API confirmed the change. */
export function useAction(): {
  busy: boolean;
  error: UiError | null;
  run: (fn: (client: typeof api) => Promise<unknown>) => Promise<boolean>;
  clear: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const run = useCallback(async (fn: (client: typeof api) => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn(api);
      setBusy(false);
      return true;
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') expireSession();
      setError(uiError);
      setBusy(false);
      return false;
    }
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { busy, error, run, clear };
}
