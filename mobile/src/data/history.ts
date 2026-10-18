import type { ReportedInput, ReportedItem } from "@patient/reported-history";
import { useEffect } from "react";
import { fromRow, REPORTED_COLUMNS, toRow } from "@patient/reported-history";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { onAccountChange } from "@/data/health-log";
import { isMissingTable } from "@/data/places";
import { createStore, useStore } from "@/data/store";
import { currentUserId, db } from "@/offline/outbox";

/**
 * My health history (ADR 0355, migration 0175): the conditions, allergies and family history the
 * patient reports, in the clerking desk's own catalogue (`@patient/reported-history`).
 *
 * REAL: `patient_reported_history` under RLS. The patient inserts and retires their own rows (an
 * edit is a new row naming the old one, which the database retires); the care team reads them and
 * the clerking desk shows them as patient-reported, not yet confirmed. Cached per account so the
 * Me tab and the card's back read offline; writes need a connection.
 *
 * Before 0175 is applied the table is missing: the screens say saving is not switched on yet
 * (`off`) and nothing throws.
 */

type Status = "idle" | "loading" | "ready" | "error" | "off";
interface HistoryState {
  userId: string | null;
  status: Status;
  items: ReportedItem[];
}
const EMPTY: HistoryState = { userId: null, status: "idle", items: [] };
const store = createStore<HistoryState>(EMPTY);
const cacheKey = (userId: string) => `medsync:reported-history:${userId}`;

export const HISTORY_OFF = "Saving your health history is not switched on yet.";

async function load(): Promise<void> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) {
    store.set(EMPTY);
    return;
  }
  store.set((s) => ({ ...s, userId, status: s.items.length ? "ready" : "loading" }));
  if (!store.get().items.length) {
    const raw = await AsyncStorage.getItem(cacheKey(userId)).catch(() => null);
    try {
      if (raw) store.set({ userId, status: "loading", items: JSON.parse(raw) as ReportedItem[] });
    } catch {
      // A broken copy is no copy.
    }
  }
  try {
    const { data, error } = await (await db())
      .from("patient_reported_history")
      .select(REPORTED_COLUMNS)
      .eq("patient_user_id", userId)
      .eq("state", "active")
      .order("created_at", { ascending: true });
    if (isMissingTable(error)) {
      store.set({ userId, status: "off", items: [] });
      return;
    }
    if (error) throw error;
    const items = (data ?? []).flatMap((r) => fromRow(r as Record<string, unknown>) ?? []);
    store.set({ userId, status: "ready", items });
    void AsyncStorage.setItem(cacheKey(userId), JSON.stringify(items)).catch(() => {});
  } catch {
    store.set((s) => ({ ...s, status: s.items.length ? "ready" : "error" }));
  }
}

let watching = false;
let inflight: Promise<void> | null = null;

export function ensureHistoryLoaded(force = false): void {
  if (!watching) {
    watching = true;
    // Another account on this phone never sees the last one's history.
    void onAccountChange((id) => {
      const current = store.get().userId;
      if (current && id !== current) {
        store.set(EMPTY);
        if (id) ensureHistoryLoaded(true);
      }
    }).catch(() => {
      watching = false;
    });
  }
  const s = store.get();
  if (!inflight && (force || s.status === "idle" || s.status === "error"))
    inflight = load().finally(() => {
      inflight = null;
    });
}

export interface History {
  items: ReportedItem[];
  conditions: ReportedItem[];
  allergies: ReportedItem[];
  family: ReportedItem[];
  noKnownAllergies: boolean;
  loading: boolean;
  error: boolean;
  off: boolean;
  retry: () => void;
}

export function useHistory(): History {
  const s = useStore(store);
  useEffect(() => ensureHistoryLoaded(), []);
  const of = (k: ReportedItem["kind"]) => s.items.filter((i) => i.kind === k);
  return {
    items: s.items,
    conditions: of("condition"),
    allergies: of("allergy"),
    family: of("family"),
    noKnownAllergies: of("no_known_allergies").length > 0,
    loading: (s.status === "idle" || s.status === "loading") && !s.items.length,
    error: s.status === "error",
    off: s.status === "off",
    retry: () => ensureHistoryLoaded(true),
  };
}

/* ─── Writes ─────────────────────────────────────────────────────────── */

export type HistorySave = "saved" | "off" | "failed";

async function write(
  run: (
    client: Awaited<ReturnType<typeof db>>,
    userId: string,
  ) => PromiseLike<{
    error: { code?: string } | null;
  }>,
): Promise<HistorySave> {
  try {
    const userId = await currentUserId();
    if (!userId) return "failed";
    const { error } = await run(await db(), userId);
    if (isMissingTable(error)) return "off";
    if (error) return "failed";
    ensureHistoryLoaded(true);
    return "saved";
  } catch {
    return "failed";
  }
}

/**
 * Add one or several (a family condition in two relatives is two rows), or with `replaces` a new
 * version of one row, which the database retires in the same statement.
 */
export function saveReported(
  input: ReportedInput | ReportedInput[],
  replaces?: string,
): Promise<HistorySave> {
  const rows = Array.isArray(input) ? input : [input];
  return write((client, userId) =>
    client.from("patient_reported_history").insert(
      rows.map((i) => ({
        ...toRow(i),
        patient_user_id: userId,
        ...(replaces ? { supersedes_id: replaces } : {}),
      })),
    ),
  );
}

/** Retire one (it stays in the audited history; the care team stops seeing it). */
export function removeReported(id: string): Promise<HistorySave> {
  return write((client, userId) =>
    client
      .from("patient_reported_history")
      .update({ state: "removed", removed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("patient_user_id", userId),
  );
}

/** "No known allergies": allowed only while no allergy is listed (an allergy retires it). */
export function setNoKnownAllergies(on: boolean, current: History): Promise<HistorySave> {
  if (on)
    return saveReported({
      kind: "no_known_allergies",
      itemId: null,
      otherText: null,
      onsetYear: null,
      resolved: null,
      relation: null,
      reactions: [],
      severity: null,
    });
  const row = current.items.find((i) => i.kind === "no_known_allergies");
  return row ? removeReported(row.id) : Promise.resolve("saved");
}
