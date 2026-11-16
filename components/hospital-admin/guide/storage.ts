"use client";

/**
 * The guide's per-person memory in this browser (ADR 0522): whether the welcome was shown, whether Set up Tether is
 * hidden, and whether the hospital profile was opened. Keyed by a hash of the user's id, so two admins on one
 * computer each get their own. Every call is wrapped: storage can be blocked, full or missing (a private window),
 * and then the guide simply does not remember. Read through `useSyncExternalStore`, so the server and the first
 * render agree (nothing is known there) and a write updates every reader.
 */
const PREFIX = "medsync.admin-guide.v1";

export type GuideMemo = "welcomed" | "setupHidden" | "profileVisited";

const keyOf = (user: string, what: GuideMemo) => `${PREFIX}.${user}.${what}`;
const listeners = new Set<() => void>();

/** The stored flag; null when storage could not be read. */
export function readMemo(user: string, what: GuideMemo): boolean | null {
  try {
    return window.localStorage.getItem(keyOf(user, what)) === "1";
  } catch {
    return null;
  }
}

export function writeMemo(user: string, what: GuideMemo, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(keyOf(user, what), "1");
    else window.localStorage.removeItem(keyOf(user, what));
  } catch {
    /* storage blocked: the guide does not remember */
  }
  for (const l of listeners) l();
}

export function subscribeMemo(cb: () => void): () => void {
  listeners.add(cb);
  try {
    window.addEventListener("storage", cb);
  } catch {
    /* no window events */
  }
  return () => {
    listeners.delete(cb);
    try {
      window.removeEventListener("storage", cb);
    } catch {
      /* no window events */
    }
  };
}
