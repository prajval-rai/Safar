import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from './api';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Updates the cached value without a round trip — for an optimistic edit
   *  after a mutation (e.g. marking a notification read locally). */
  set: (value: T) => void;
}

/** Loads `path` on mount, and exposes a `refresh` for pull-to-refresh — the pattern
 *  every list/detail screen here needs, written once. */
export function useFetch<T>(path: string | null): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!path) {
        // Nothing to fetch yet (a param that hasn't resolved, a condition
        // that's off) is not the same as "still loading" — without this,
        // `loading` stays stuck at its initial `true` forever, since the
        // early return skipped the one place that would ever set it false.
        setLoading(false);
        setRefreshing(false);
        return;
      }
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const result = await api<T>(path);
        setData(result);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't reach the server. Check your connection.");
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  return { data, loading, refreshing, error, refresh: () => load(true), set: setData };
}
