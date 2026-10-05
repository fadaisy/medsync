/**
 * The device store (§9): one IndexedDB database holding the outbox, the small offline read cache and
 * a non-extractable AES-GCM key. Everything written here is encrypted with that key; the key itself
 * can be used by this origin but never exported. Purged on sign-out once the outbox is empty.
 */
const DB = "ncdsync";
const VERSION = 1;
export const STORES = ["outbox", "cache", "notes", "meta"] as const;
export type StoreName = (typeof STORES)[number];

export function openStore(idb: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB, VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES)
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
export const idbGet = <T>(db: IDBDatabase, s: StoreName, k: string) =>
  tx<T | undefined>(db, s, "readonly", (o) => o.get(k) as IDBRequest<T | undefined>);
export const idbPut = (db: IDBDatabase, s: StoreName, k: string, v: unknown) =>
  tx(db, s, "readwrite", (o) => o.put(v, k));
export const idbDel = (db: IDBDatabase, s: StoreName, k: string) =>
  tx(db, s, "readwrite", (o) => o.delete(k));
export const idbKeys = (db: IDBDatabase, s: StoreName) =>
  tx<IDBValidKey[]>(db, s, "readonly", (o) => o.getAllKeys());
export const idbClear = (db: IDBDatabase, s: StoreName) => tx(db, s, "readwrite", (o) => o.clear());

/** The device key: generated once, non-extractable, kept in IndexedDB as a CryptoKey object. */
export async function deviceKey(db: IDBDatabase): Promise<CryptoKey> {
  const k = await idbGet<CryptoKey>(db, "meta", "key");
  if (k) return k;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await idbPut(db, "meta", "key", key);
  return key;
}

export type Sealed = { iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer };
export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { iv, ct };
}
export async function open<T>(key: CryptoKey, s: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: s.iv }, key, s.ct);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/** Encrypted put/get for any store. */
export async function putSealed(db: IDBDatabase, s: StoreName, k: string, v: unknown) {
  await idbPut(db, s, k, await seal(await deviceKey(db), v));
}
export async function getSealed<T>(
  db: IDBDatabase,
  s: StoreName,
  k: string,
): Promise<T | undefined> {
  const raw = await idbGet<Sealed>(db, s, k);
  return raw ? open<T>(await deviceKey(db), raw) : undefined;
}
