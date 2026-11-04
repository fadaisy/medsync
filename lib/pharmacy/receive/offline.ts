import type { ReceiveDelivery } from "@/lib/pharmacy/derive/receive";

/**
 * Working without the network (RECEIVE §H). IndexedDB holds a device's deliveries in progress and those finished
 * offline. Sync runs each queued delivery through the same server steps, in order; the server's refusal returns it to
 * Counting with the reason, and a delivery is never committed partly.
 */
const DB = "medsync-receive";
const STORE = "deliveries";

export interface DeviceDelivery {
  delivery: ReceiveDelivery;
  /** Finished here, waiting for the network. */
  queued: boolean;
  /** The line ids removed while offline. */
  removed: string[];
  savedAt: number;
}

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "delivery.id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const tx = async <T>(mode: IDBTransactionMode, go: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const q = go(db.transaction(STORE, mode).objectStore(STORE));
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  }).finally(() => db.close());
};

export const putDevice = (d: DeviceDelivery) => tx("readwrite", (s) => s.put(d));
export const dropDevice = (id: string) => tx("readwrite", (s) => s.delete(id));
export const allDevice = () => tx<DeviceDelivery[]>("readonly", (s) => s.getAll());

export interface SyncSteps {
  /** The head and lines; a duplicate note comes back as `duplicate`. */
  push(d: DeviceDelivery): Promise<{ ok: true; duplicate?: boolean } | { ok: false; error: string }>;
  finish(d: DeviceDelivery): Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface SyncResult {
  added: string[];
  /** Back to Counting, with why. */
  conflicts: { id: string; reason: string }[];
}

/**
 * Oldest first. Each queued delivery commits once: `finish` is idempotent on the delivery id, so a replay after a dropped
 * reply finds it already received. A network failure stops the run and leaves the rest queued.
 */
export async function syncQueue(
  items: readonly DeviceDelivery[],
  steps: SyncSteps,
  duplicateWords: string,
  store: { put(d: DeviceDelivery): Promise<unknown>; drop(id: string): Promise<unknown> },
): Promise<SyncResult> {
  const out: SyncResult = { added: [], conflicts: [] };
  const back = async (d: DeviceDelivery, reason: string) => {
    await store.put({ ...d, queued: false, delivery: { ...d.delivery, state: "counting", conflict: reason } });
    out.conflicts.push({ id: d.delivery.id, reason });
  };
  for (const d of [...items].filter((x) => x.queued).sort((a, b) => a.savedAt - b.savedAt)) {
    let pushed;
    try {
      pushed = await steps.push(d);
    } catch {
      return out;
    }
    if (!pushed.ok) {
      await back(d, pushed.error);
      continue;
    }
    if (pushed.duplicate) {
      await back(d, duplicateWords);
      continue;
    }
    let done;
    try {
      done = await steps.finish(d);
    } catch {
      return out;
    }
    if (!done.ok) {
      await back(d, done.error);
      continue;
    }
    await store.drop(d.delivery.id);
    out.added.push(d.delivery.id);
  }
  return out;
}
