/**
 * The offline read cache (§9): deliberately small — today's clinic list, the patients scheduled or
 * opened today with their trajectory data, and the overdue list as last fetched. Encrypted with the
 * device key; replaced whole at every refresh (so records removed on the server, such as demo
 * patients after demo data is turned off, leave the device at the next sync); purged on sign-out
 * once the outbox is empty. Never the full register.
 */
import { getSealed, idbClear, idbKeys, putSealed } from "./store";

export type OfflinePatient = {
  personId: string;
  name: string;
  registryNumber: string;
  sex: "female" | "male";
  age: number;
  conditions: { code: string; label: string }[];
  visitId: string | null;
  stage: string;
  heightCm: number | null;
  glucose: boolean;
  trajectory: { date: string; bp: string | null; glucose: string | null; weight: number | null }[];
};
export type OfflineSnapshot = {
  fetchedAt: string;
  date: string;
  clinic: OfflinePatient[];
  overdue: {
    personId: string;
    name: string;
    registryNumber: string;
    daysOverdue: number;
    phoneMasked: string | null;
    demo: boolean;
  }[];
};

export async function saveSnapshot(db: IDBDatabase, s: OfflineSnapshot) {
  await idbClear(db, "cache");
  await putSealed(db, "cache", "snapshot", s);
}

/** A device that has not synced for this long holds no patient data any more (finding 14, HZ-13). */
export const SNAPSHOT_TTL_MS = 72 * 3600 * 1000;

export async function readSnapshot(
  db: IDBDatabase,
  now = Date.now(),
): Promise<OfflineSnapshot | null> {
  const s = (await getSealed<OfflineSnapshot>(db, "cache", "snapshot")) ?? null;
  if (s && now - Date.parse(s.fetchedAt) > SNAPSHOT_TTL_MS) {
    await idbClear(db, "cache");
    return null;
  }
  return s;
}

/** Sign-out: purge the cache and the device key, but only once nothing is waiting to be sent. */
export async function purgeOnSignOut(
  db: IDBDatabase,
): Promise<{ purged: boolean; waiting: number }> {
  const waiting = (await idbKeys(db, "outbox")).length;
  if (waiting) return { purged: false, waiting };
  await idbClear(db, "cache");
  await idbClear(db, "notes");
  await idbClear(db, "meta");
  return { purged: true, waiting: 0 };
}
