import type { Row, SaveResult } from "@/offline/outbox";
import type { LogKind, LogRow } from "@patient-core/log";
import { useEffect } from "react";

import { createStore, useStore } from "@/data/store";
import { currentUserId, db, insertOrQueue, newId, readOutbox, unqueue } from "@/offline/outbox";

export type { LogKind, LogRow } from "@patient-core/log";
export { dayKey, lastDays, latestByDay } from "@patient-core/log";

/** The columns one new row fills; the store adds id, owner and time. */
export interface NewLog {
  kind: LogKind;
  v1?: number | null;
  v2?: number | null;
  unit?: string | null;
  note?: string | null;
}

type Status = "idle" | "loading" | "ready" | "error";

interface LogState {
  userId: string | null;
  status: Status;
  /** Newest first. */
  rows: LogRow[];
}

const EMPTY: LogState = { userId: null, status: "idle", rows: [] };
const store = createStore<LogState>(EMPTY);

/** How far back the phone reads: enough for the mood year. */
const WINDOW_DAYS = 400;
// ponytail: one bounded read of the whole window. Ceiling: a patient logging
// more than ROW_LIMIT rows in 400 days loses the oldest from the year views.
// Upgrade path is a per-kind read or a server-side daily roll-up.
const ROW_LIMIT = 3000;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** One database (or queued) row to the shape the screens read. */
export function fromDb(r: Record<string, unknown>): LogRow {
  return {
    id: String(r.id),
    kind: String(r.kind) as LogKind,
    recordedAt: String(r.recorded_at),
    v1: num(r.numeric_value_1),
    v2: num(r.numeric_value_2),
    unit: typeof r.unit === "string" ? r.unit : null,
    note: typeof r.note === "string" ? r.note : null,
  };
}

/** Server rows plus anything still waiting in the outbox, newest first, one per id. */
export function mergeRows(server: LogRow[], queued: LogRow[]): LogRow[] {
  const seen = new Set(server.map((r) => r.id));
  return [...server, ...queued.filter((r) => !seen.has(r.id))].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  );
}

let watching = false;
/** One load at a time: several hooks on one screen all ask on mount. */
let inflight: Promise<void> | null = null;

/**
 * Calls `reset` on every auth change, so a store can forget everything when
 * the account changes (sign-out, or someone else signs in on this phone) and
 * one person's log never shows to another.
 */
export async function onAccountChange(reset: (userId: string | null) => void): Promise<void> {
  const client = await db();
  client.auth.onAuthStateChange((_event, session) => reset(session?.user.id ?? null));
}

async function load(): Promise<void> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) {
    store.set(EMPTY);
    return;
  }
  store.set((s) => ({ ...s, userId, status: "loading" }));
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
    const { data, error } = await (await db())
      .from("personal_health_logs")
      .select("id, kind, recorded_at, numeric_value_1, numeric_value_2, unit, note")
      .eq("patient_user_id", userId)
      .eq("state", "active")
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) throw error;
    const queued = (await readOutbox()).flatMap((i) => {
      const row = i.payload.row as Row | undefined;
      return i.kind === "insert" &&
        i.payload.table === "personal_health_logs" &&
        row?.patient_user_id === userId
        ? [fromDb(row)]
        : [];
    });
    store.set({ userId, status: "ready", rows: mergeRows((data ?? []).map(fromDb), queued) });
  } catch {
    store.set((s) => ({ ...s, status: s.rows.length ? "ready" : "error" }));
  }
}

/** Load once per account; `retry` reloads. */
export function ensureLogLoaded(force = false): void {
  if (!watching) {
    watching = true;
    void onAccountChange((id) => {
      const current = store.get().userId;
      if (current && id !== current) {
        store.set(EMPTY);
        if (id) void load();
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

/** The whole log, newest first, with its loading state. */
export function useHealthLog(): {
  rows: LogRow[];
  loading: boolean;
  error: boolean;
  retry: () => void;
} {
  const s = useStore(store);
  useEffect(() => ensureLogLoaded(), []);
  return {
    rows: s.rows,
    loading: s.status === "idle" || s.status === "loading",
    error: s.status === "error",
    retry: () => ensureLogLoaded(true),
  };
}

/**
 * Save one row. It shows at once; a save the database refused is taken back
 * out, and a queued one stays (it is on this phone, and will send).
 */
export async function addLog(entry: NewLog, at: Date = new Date()): Promise<SaveResult> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return "failed";
  const row: Row = {
    id: newId(),
    patient_user_id: userId,
    kind: entry.kind,
    recorded_at: at.toISOString(),
    numeric_value_1: entry.v1 ?? null,
    numeric_value_2: entry.v2 ?? null,
    unit: entry.unit ?? null,
    note: entry.note ?? null,
  };
  const view = fromDb(row);
  store.set((s) => ({ ...s, rows: mergeRows([view], s.rows) }));
  const result = await insertOrQueue("personal_health_logs", row);
  if (result === "failed")
    store.set((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== view.id) }));
  return result;
}

/**
 * Take one row back. A row still in the outbox just leaves it; a sent one is
 * marked deleted (the patient's own update, migration 0029), never removed.
 * Offline, a sent row cannot be taken back yet, so it comes back on screen.
 */
export async function removeLog(id: string): Promise<SaveResult> {
  const row = store.get().rows.find((r) => r.id === id);
  if (!row) return "failed";
  store.set((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== id) }));
  if (await unqueue(id)) return "sent";
  try {
    const { error } = await (await db())
      .from("personal_health_logs")
      .update({ state: "deleted" })
      .eq("id", id);
    if (!error) return "sent";
  } catch {
    // Offline: falls through to put the row back.
  }
  store.set((s) => ({ ...s, rows: mergeRows([row], s.rows) }));
  return "failed";
}

/* ─── Calendar helpers, shared by the views ──────────────────────────── */
