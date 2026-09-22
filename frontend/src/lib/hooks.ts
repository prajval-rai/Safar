"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { ApiError, api } from "./api";

interface FetchState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Update the cached value without a round trip — used after mutations. */
  set: (value: T) => void;
}

interface Result<T> {
  key: string | null;
  data?: T;
  error: string | null;
}

/**
 * Small data hook: enough for this app, and no extra dependency to install.
 * Pass `null` as the path to skip fetching (e.g. while an id is unknown).
 *
 * `loading` is derived from which request the stored result belongs to, so the
 * effect never has to set state synchronously just to flip a flag.
 */
export function useApi<T>(path: string | null): FetchState<T> {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T>>({ key: null, error: null });

  const key = path ? `${path}#${nonce}` : null;

  useEffect(() => {
    if (!path || !key) return;

    const controller = new AbortController();
    let active = true;

    api
      .get<T>(path, controller.signal)
      .then((data) => {
        if (active) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setResult({
          key,
          error: err instanceof ApiError ? err.message : "Couldn't load this right now.",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [path, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const set = useCallback((value: T) => {
    setResult((previous) => ({ ...previous, data: value, error: null }));
  }, []);

  return {
    data: result.data,
    loading: key !== null && result.key !== key,
    error: result.key === key ? result.error : null,
    reload,
    set,
  };
}

/**
 * Matches a CSS media query. Built on useSyncExternalStore so it hydrates
 * cleanly instead of correcting itself after mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Locks background scrolling while a sheet or dialog is open. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
