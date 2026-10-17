import type { Row, SaveResult } from "@/offline/outbox";
import { useEffect } from "react";

import { createStore, useStore } from "@/data/store";
import { currentUserId, db, insertOrQueue, newId, readOutbox } from "@/offline/outbox";

/**
 * The patient's own log, `personal_health_logs` (migration 0029, kinds widened
 * by 0170, ADR 0342). Readings, mood, water and minutes walked all live in
 * this one table, so one store loads it once and every repository reads its
 * own kinds from it. RLS gives the patient their own rows and nobody else's;
 * no clinician can read this table, which is why no screen says they can.
 *
 * Append-only from the phone: a save is an insert with a client-made id
 * (see the outbox), never an update, so it can be queued offline.
 */
export type LogKind =
  | "bp"
  | "glucose"
  | "weight"
  | "pulse"
  | "mood"
  | "water"
  | "activity"
  | "symptom"
  | "note"
  | "spo2"
  | "temperature"
  | "other";

export interface LogRow {
  id: string;
  kind: LogKind;
  /** ISO instant. */
  recordedAt: string;
  v1: number | null;
  v2: number | null;
  unit: string | null;
  note: string | null;
}

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

/* ─── Calendar helpers, shared by the views ──────────────────────────── */

/** "2026-10-17" in the phone's own zone: the patient's day, as on the web. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The latest row of `kind` on each day, by `dayKey`. Rows come newest first. */
export function latestByDay(rows: LogRow[], kind: LogKind): Map<string, LogRow> {
  const out = new Map<string, LogRow>();
  for (const r of rows) {
    if (r.kind !== kind) continue;
    const k = dayKey(new Date(r.recordedAt));
    if (!out.has(k)) out.set(k, r);
  }
  return out;
}

/** The seven days ending today, oldest first. */
export function lastDays(now: Date, n = 7): Date[] {
  return Array.from(
    { length: n },
    (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1) + i),
  );
}
