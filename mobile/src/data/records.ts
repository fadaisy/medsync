import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { createStore, useStore } from "@/data/store";
import { supabase } from "@/lib/supabase";

/**
 * The patient's shared visit records (ADR 0342 §2). Real: the web's
 * `/api/mobile/visit-summaries` decrypts what a clinician chose to share and
 * sends the patient's own copies, so the key never reaches the phone. A held
 * copy never reaches a patient (ADR 0203), so every record here is shared.
 *
 * The last good list is kept on the phone, per account, so a record can be
 * read offline. Medicines carry a name only (law L5): the route drops the
 * prescription as written before it leaves the server.
 */

/** Mirrors `MobileVisitSummary` in app/api/mobile/visit-summaries/_lib/shape.ts. */
export interface VisitRecord {
  id: string;
  sharedAt: string;
  updated: boolean;
  hospitalName: string;
  startedAt: string;
  clinician: string | null;
  outcome: string;
  outcomeNote: string | null;
  found: { id: string; text: string; detail: string | null }[];
  medicines: { prescriptionId: string; name: string; inMyMedicines: boolean }[];
  stopped: { id: string; name: string }[];
  tests: { id: string; name: string }[];
  testsNote: string | null;
  next: string | null;
  comeBackIf: string | null;
}

const ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN;
const BASE = ORIGIN ? `${ORIGIN.replace(/\/$/, "")}/api/mobile/visit-summaries` : null;

export const RECORDS_OFF = "Records are not switched on in this build.";
const OFFLINE = "Couldn't reach MedSync. Showing what was saved on this phone.";
const OFFLINE_EMPTY = "Couldn't reach MedSync. Check your connection and try again.";
const FAILED = "Couldn't load your visit records. Try again.";

export type RecordsStatus = "loading" | "ready" | "error" | "off";
export interface RecordsState {
  status: RecordsStatus;
  items: VisitRecord[];
  /** Plain words for the error or off state; null when ready. */
  message: string | null;
  /** The items came from the phone's copy, not the server, this time. */
  fromPhone: boolean;
}

const store = createStore<RecordsState>(
  BASE
    ? { status: "loading", items: [], message: null, fromPhone: false }
    : { status: "off", items: [], message: RECORDS_OFF, fromPhone: false },
);

const cacheKey = (userId: string) => `medsync-records-v1:${userId}`;

async function session(): Promise<{ token: string; userId: string } | null> {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  return s ? { token: s.access_token, userId: s.user.id } : null;
}

/** The server's own sentence when it sent one, else ours. */
async function errorWords(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

let inFlight: Promise<void> | null = null;

/** Fetch the list; on any failure fall back to the phone's copy and say so. */
export function loadRecords(): Promise<void> {
  if (!BASE) return Promise.resolve();
  inFlight ??= (async () => {
    store.set((s) => ({ ...s, status: s.items.length ? s.status : "loading" }));
    const me = await session();
    if (!me) {
      store.set({ status: "error", items: [], message: "Sign in again.", fromPhone: false });
      return;
    }
    let message = FAILED;
    let offline = false;
    try {
      const res = await fetch(BASE, { headers: { Authorization: `Bearer ${me.token}` } });
      if (res.ok) {
        const { summaries } = (await res.json()) as { summaries: VisitRecord[] };
        store.set({ status: "ready", items: summaries, message: null, fromPhone: false });
        void AsyncStorage.setItem(cacheKey(me.userId), JSON.stringify(summaries)).catch(() => {});
        return;
      }
      message = await errorWords(res, FAILED);
    } catch {
      offline = true;
    }
    const cached = await readCache(me.userId);
    store.set({
      status: cached ? "ready" : "error",
      items: cached ?? [],
      message: offline ? (cached ? OFFLINE : OFFLINE_EMPTY) : message,
      fromPhone: cached !== null,
    });
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function readCache(userId: string): Promise<VisitRecord[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as VisitRecord[]) : null;
  } catch {
    return null;
  }
}

/** Every shared record, newest first, loading on first use. `reload` is the retry. */
export function useRecords(): RecordsState & { reload: () => void } {
  const s = useStore(store);
  useEffect(() => {
    void loadRecords();
  }, []);
  return { ...s, reload: () => void loadRecords() };
}

/** One record from the list (the list carries the whole copy). */
export function useRecord(
  id: string,
): RecordsState & { record: VisitRecord | null; reload: () => void } {
  const all = useRecords();
  return { ...all, record: all.items.find((r) => r.id === id) ?? null };
}

export type AddOutcome = { ok: true } | { ok: false; message: string };

/**
 * "Add to my medicines" (ADR 0203 §7): the server checks it is a take-home item
 * on this shared copy and writes the row with no dose times. Not queued when
 * offline: the server's check is the point, so the patient tries again online.
 */
export async function addToMyMedicines(
  summaryId: string,
  prescriptionId: string,
): Promise<AddOutcome> {
  if (!BASE) return { ok: false, message: RECORDS_OFF };
  const me = await session();
  if (!me) return { ok: false, message: "Sign in again." };
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(summaryId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${me.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prescriptionId }),
    });
    if (!res.ok) {
      const words = await errorWords(res, "Couldn't save that. Try again later.");
      // Already there is the outcome the patient wanted.
      if (words !== "Already in your medicines.") return { ok: false, message: words };
    }
  } catch {
    return { ok: false, message: "Couldn't reach MedSync. Try again when you are online." };
  }
  store.set((s) => ({
    ...s,
    items: s.items.map((r) =>
      r.id !== summaryId
        ? r
        : {
            ...r,
            medicines: r.medicines.map((m) =>
              m.prescriptionId === prescriptionId ? { ...m, inMyMedicines: true } : m,
            ),
          },
    ),
  }));
  return { ok: true };
}

/** The current state, outside React (tests). */
export const peekRecords = (): RecordsState => store.get();
