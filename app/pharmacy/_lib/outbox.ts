"use client";

import { useSyncExternalStore } from "react";

/**
 * The offline outbox (rework PRD §6.8, scenario 13). A write made with no network is kept on this device in
 * IndexedDB under its key and sent when the network is back (the runners in outbox-runners.ts). A later write
 * under the same key replaces the waiting one.
 * ponytail: one flush in time order; per-action ordering if two queued writes ever depend on each other.
 */
export interface Queued {
  key: string;
  action: string;
  payload: unknown;
  at: number;
  error?: string;
}
type Runner = (payload: unknown) => Promise<{ ok: boolean; error?: string }>;

const DB = "medsync-pharmacy-outbox";
const STORE = "writes";
const listeners = new Set<() => void>();
let cached: Queued[] = [];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "key" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function refresh() {
  try {
    cached = await tx<Queued[]>("readonly", (s) => s.getAll() as IDBRequest<Queued[]>);
  } catch {
    cached = [];
  }
  listeners.forEach((l) => l());
}

export async function enqueue(action: string, key: string, payload: unknown) {
  await tx("readwrite", (s) => s.put({ key, action, payload, at: Date.now() } satisfies Queued));
  await refresh();
}

let flushing = false;
/** Send everything queued; a refusal stays listed with its words, a network failure stays for next time. */
export async function flush(runners: Record<string, Runner>) {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    await refresh();
    for (const q of [...cached].sort((a, b) => a.at - b.at)) {
      const run = runners[q.action];
      if (!run || q.error) continue;
      let r: { ok: boolean; error?: string };
      try {
        r = await run(q.payload);
      } catch {
        break;
      }
      if (r.ok) await tx("readwrite", (s) => s.delete(q.key));
      else await tx("readwrite", (s) => s.put({ ...q, error: r.error ?? "Refused" }));
    }
  } finally {
    flushing = false;
    await refresh();
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  if (listeners.size === 1) void refresh();
  return () => void listeners.delete(l);
};

/** What is still waiting on this device. */
export const useOutbox = () =>
  useSyncExternalStore(
    subscribe,
    () => cached,
    () => cached,
  );
