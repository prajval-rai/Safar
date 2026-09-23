"use client";

import { useEffect, useSyncExternalStore } from "react";

import { useCelebration } from "@/components/providers/CelebrationProvider";
import { api, ApiError } from "./api";

/**
 * A tiny offline queue for the one class of action where losing the tap
 * genuinely matters: checking in or completing a stop out on a trip, where
 * signal is unreliable but the location reading itself doesn't need the
 * network at all. GPS is captured up front (works offline); only the POST
 * to save it needs connectivity, so that's the only part that waits.
 *
 * Deliberately narrow — this is not a general offline-first data layer for
 * the whole app, just this one path where "no signal" is the normal case,
 * not an edge case.
 */

const QUEUE_KEY = "safar.offlineQueue";
/** Give up on an action after this many failed sync attempts, rather than
 *  queuing it forever — covers the rare case where the failure isn't really
 *  "no signal" (a misconfigured URL, CORS, …) but looks identical to fetch(). */
const MAX_ATTEMPTS = 5;

export interface QueuedAction {
  id: string;
  path: string;
  body: unknown;
  /** Shown in the "still pending" list — e.g. 'Check in at Baga Beach'. */
  label: string;
  createdAt: string;
  attempts: number;
}

function readQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    // Private mode, blocked storage, or server-side (no localStorage at all).
    return [];
  }
}

function writeQueue(queue: QueuedAction[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage unavailable — the queue just won't persist across a reload */
  }
}

const listeners = new Set<() => void>();
function notifyListeners() {
  listeners.forEach((listener) => listener());
}

/** Thrown instead of a real error when an action was saved for later rather
 *  than failing outright — callers should show this as a calm "saved" toast,
 *  not an error one. */
export class OfflineQueuedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineQueuedError";
  }
}

/** A true network failure — the request never reached the server at all —
 *  as opposed to the server responding with a real rejection (too far away,
 *  already completed, …), which should surface normally, never queue. */
function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiError) return false; // the server did respond
  return err instanceof TypeError; // fetch() throws a plain TypeError when it can't reach the network
}

export function queueAction(path: string, body: unknown, label: string): void {
  const queue = readQueue();
  queue.push({
    id: crypto.randomUUID(),
    path,
    body,
    label,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  writeQueue(queue);
  notifyListeners();
}

/**
 * POSTs immediately if there's any chance of reaching the network; queues
 * for later otherwise. Checking navigator.onLine first skips a guaranteed-
 * to-fail request (and its timeout) when it's already known there's no
 * connection at all — the actual fetch is still the real fallback check,
 * since navigator.onLine can say "online" when there's no real signal.
 */
export async function postOrQueue<T>(path: string, body: unknown, label: string): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    queueAction(path, body, label);
    throw new OfflineQueuedError(`Saved — "${label}" will go through once you're back online.`);
  }
  try {
    return await api.post<T>(path, body);
  } catch (err) {
    if (isNetworkFailure(err)) {
      queueAction(path, body, label);
      throw new OfflineQueuedError(`Saved — "${label}" will go through once you're back online.`);
    }
    throw err;
  }
}

/** Replays every queued action, oldest first. Stops at the first one that's
 *  still a network failure — no point trying the rest this round — but a
 *  real rejection from the server drops that one action and moves on,
 *  rather than blocking everything behind it forever. */
export async function syncQueue(): Promise<{ synced: number; dropped: number }> {
  const queue = readQueue();
  let synced = 0;
  let dropped = 0;

  for (let i = 0; i < queue.length; i++) {
    const action = queue[i];
    try {
      await api.post(action.path, action.body);
      synced += 1;
    } catch (err) {
      if (isNetworkFailure(err)) {
        action.attempts += 1;
        if (action.attempts < MAX_ATTEMPTS) {
          writeQueue(queue.slice(i)); // this one and everything after it, for next time
          notifyListeners();
          return { synced, dropped };
        }
        // Tried enough times — this isn't really "no signal", stop pretending it is.
        dropped += 1;
      } else {
        // The server actually looked at it and said no (too far away by
        // now, already done by someone else, …) — never retry that.
        dropped += 1;
      }
    }
  }
  writeQueue([]);
  notifyListeners();
  return { synced, dropped };
}

export function pendingActions(): QueuedAction[] {
  return readQueue();
}

/** Live count of what's still waiting to sync — for a small badge. Reads
 *  through useSyncExternalStore, same pattern as the theme/mode stores, so
 *  it's always 0 on the server and correct on the client with no effect-based
 *  setState or hydration mismatch. */
export function usePendingSyncCount(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => readQueue().length,
    () => 0,
  );
}

/**
 * Replays the queue the moment the browser comes back online, and once more
 * on mount in case connectivity returned while the tab was closed (so no
 * 'online' event ever fired for this page load). Meant to be called once,
 * app-wide — see AppShell — not per component that happens to use the queue.
 */
export function useOfflineSync() {
  const { toast } = useCelebration();

  useEffect(() => {
    function trySync() {
      syncQueue().then(({ synced, dropped }) => {
        if (synced > 0) {
          toast(`Synced ${synced} update${synced === 1 ? "" : "s"} saved while you were offline.`);
        }
        if (dropped > 0) {
          toast(
            `${dropped} offline update${dropped === 1 ? "" : "s"} couldn't be saved — you may need to redo ${
              dropped === 1 ? "it" : "them"
            }.`,
            "error",
          );
        }
      });
    }
    window.addEventListener("online", trySync);
    if (navigator.onLine) trySync();
    return () => window.removeEventListener("online", trySync);
  }, [toast]);
}
