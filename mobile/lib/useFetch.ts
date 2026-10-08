import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from './api';

interface FetchState<T> {
  data: T | null;
  /** True only when there's nothing to show yet — a first load with no cache. */
  loading: boolean;
  /** True while a pull-to-refresh is running — bind RefreshControl to this. */
  refreshing: boolean;
  error: string | null;
  /** Pull-to-refresh: refetch and show the spinner. Stable between renders. */
  refresh: () => Promise<void>;
  /** Updates the cached value without a round trip — for an optimistic edit
   *  after a mutation (e.g. marking a notification read locally). */
  set: (value: T) => void;
}

interface Options {
  /** Refetch quietly when the screen comes back into focus, if what's shown
   *  is older than this many ms. Off by default. */
  refetchOnFocusAfter?: number;
}

/** Last response per path, shared by every screen: coming back to a screen
 *  shows what it had straight away, and refreshes behind it. */
const cache = new Map<string, { data: unknown; at: number }>();

/** Forget cached responses — after signing out, so the next person never sees
 *  the last one's data. */
export function clearFetchCache() {
  cache.clear();
}

/**
 * Loads `path` and keeps it fresh — the pattern every list/detail screen here
 * needs, written once.
 *
 * - Shows the cached response for `path` instantly when there is one, and
 *   refetches in the background (stale-while-revalidate), so switching tabs
 *   never blanks the screen behind a spinner.
 * - `refresh` is stable, so it's safe in effect and callback dependencies. (It
 *   used to be a new function every render, which made the focus effects on
 *   Home and Feed refetch in an endless loop: the app crawled, and the
 *   pull-to-refresh spinner at the top never stopped.)
 */
export function useFetch<T>(path: string | null, options: Options = {}): FetchState<T> {
  const cached = path ? (cache.get(path)?.data as T | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(Boolean(path) && cached === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The path the screen currently wants — read by `load` so a slow answer
  // for an old path (typing in a search box) never lands on screen.
  const pathRef = useRef(path);

  const load = useCallback(async (mode: 'initial' | 'pull' | 'quiet') => {
    const current = pathRef.current;
    if (!current) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (mode === 'pull') setRefreshing(true);
    setError(null);
    try {
      const result = await api<T>(current);
      cache.set(current, { data: result, at: Date.now() });
      // A newer path may have been requested meanwhile (typing in a search
      // box); only the latest one's answer may land on screen.
      if (pathRef.current === current) setData(result);
    } catch (e) {
      if (pathRef.current === current) {
        setError(e instanceof ApiError ? e.message : "Couldn't reach the server. Check your connection.");
      }
    } finally {
      if (pathRef.current === current) {
        setLoading(false);
        if (mode === 'pull') setRefreshing(false);
      }
    }
  }, []);

  // A new path: show its cache (if any) at once, then fetch it. Syncing
  // state to the path here is the point of the effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    pathRef.current = path;
    if (!path) {
      setLoading(false);
      return;
    }
    const hit = cache.get(path);
    if (hit) {
      setData(hit.data as T);
      setLoading(false);
    } else {
      setLoading(true);
    }
    load('initial');
  }, [path, load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const focusAfter = options.refetchOnFocusAfter;
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // The mount effect above already fetched for the first focus.
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (focusAfter === undefined || !pathRef.current) return;
      const hit = cache.get(pathRef.current);
      if (!hit || Date.now() - hit.at > focusAfter) load('quiet');
    }, [focusAfter, load]),
  );

  const refresh = useCallback(() => load('pull'), [load]);
  const set = useCallback((value: T) => {
    if (pathRef.current) cache.set(pathRef.current, { data: value, at: Date.now() });
    setData(value);
  }, []);

  return { data, loading, refreshing, error, refresh, set };
}
