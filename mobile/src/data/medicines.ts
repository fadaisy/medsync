import type { SaveResult } from "@/offline/outbox";
import type { MedicationRow, TakeRow, DoseSlot as WebSlot } from "@patient/doses";
import { useEffect } from "react";
import { buildDayDoses, DOSE_GRACE_MINUTES, pendingSlotAt } from "@patient/doses";

import { onAccountChange } from "@/data/health-log";
import { createStore, useStore } from "@/data/store";
import { track } from "@/lib/analytics";
import { currentUserId, db, insertOrQueue, newId, unqueue } from "@/offline/outbox";

/**
 * Medicines and today's doses, from the patient's own list (ADR 0342):
 * `self_medications` and `self_medication_takes` (migration 0029, RLS = the
 * patient's own rows). The dose list is the web's own derivation,
 * `lib/patient/doses.ts`, imported rather than copied, so the phone and
 * `/patient/track/doses` can never disagree about a dose.
 *
 * No dose amount exists anywhere in this model (law L5): the `dose` column
 * is never read. A dose is a medicine, a time of day and "As your clinician
 * prescribed". Nothing here reaches a clinician: the list is the patient's.
 */
export type DoseSlot = "morning" | "midday" | "evening" | "night";
/** `noEntry`: past its time with nothing recorded, where a miss cannot be claimed (a guessed time). */
export type DoseStatus = "taken" | "due" | "later" | "missed" | "noEntry";

export interface Dose {
  /** The web's slot key, `${medicationId}@${HH:MM}`. */
  id: string;
  slot: DoseSlot;
  /** 24-hour "HH:MM". */
  time: string;
  medicine: string;
  instruction: string;
  takenAt: string | null;
  snoozedUntil: string | null;
  /** The slot's instant, which a take records as `scheduled_for`. */
  scheduledForIso: string;
}

export interface Medicine {
  id: string;
  name: string;
  /** "Morning and evening", "When you need it", "No times set". */
  when: string;
  instructions: string | null;
  state: "active" | "paused";
}

export const SLOT_WORDS: Record<DoseSlot, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  night: "Night",
};

/** The clock time each time-of-day chip writes to `schedule_times` when a patient adds a medicine. */
export const SLOT_TIMES: Record<DoseSlot, string> = {
  morning: "08:00",
  midday: "13:00",
  evening: "20:00",
  night: "22:00",
};

const PRESCRIBED = "As your clinician prescribed";

export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The time-of-day word for a clock time: morning 04–11, midday 11–16, evening 16–21, night after. */
export function slotOf(timeLabel: string): DoseSlot {
  const h = Number(timeLabel.slice(0, 2));
  if (h >= 4 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "midday";
  if (h >= 16 && h < 21) return "evening";
  return "night";
}

/**
 * The phone's word for a slot: due from an hour before its time until the
 * web's grace ends; an open slot past that is the web's own "No entry" (a
 * guessed time can never be missed).
 */
export function doseStatus(slot: Pick<WebSlot, "state" | "at">, now: Date): DoseStatus {
  if (slot.state === "taken") return "taken";
  if (slot.state === "missed") return "missed";
  const t = now.getTime();
  const at = slot.at.getTime();
  if (t < at - 60 * 60_000) return "later";
  if (t <= at + DOSE_GRACE_MINUTES * 60_000) return "due";
  return "noEntry";
}

/** One web slot to the phone's dose. Instructions follow the fixed words; the dose column never shows. */
export function toDose(slot: WebSlot, snoozedUntil: string | null = null): Dose {
  const extra = slot.instructions?.trim();
  return {
    id: slot.key,
    slot: slotOf(slot.timeLabel),
    time: slot.timeLabel,
    medicine: slot.name,
    instruction: extra ? `${PRESCRIBED} · ${extra}` : PRESCRIBED,
    takenAt: slot.state === "taken" ? (slot.takenAtLabel ?? slot.timeLabel) : null,
    snoozedUntil,
    scheduledForIso: slot.at.toISOString(),
  };
}

/* ─── rows ─────────────────────────────────────────────────────────── */

export interface MedRow extends MedicationRow {
  /** ISO; a medicine added on Wednesday has no doses to count on Monday. */
  createdAt: string;
}

export interface TakeRec extends TakeRow {
  id: string;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The takes that belong to one day, filed by `coalesce(scheduled_for, taken_at)` like the web's `listTakesForDay`. */
export function takesForDay(takes: TakeRec[], day: Date): TakeRec[] {
  const from = startOfDay(day).getTime();
  const to = addDays(day, 1).getTime();
  return takes.filter((t) => {
    const at = new Date(t.scheduledForIso ?? t.takenAtIso).getTime();
    return at >= from && at < to;
  });
}

/** The active medicines that existed by the end of `day`. */
function medsOn(meds: MedRow[], day: Date): MedRow[] {
  const end = addDays(day, 1).getTime();
  return meds.filter((m) => m.state === "active" && new Date(m.createdAt).getTime() < end);
}

export function dayDoses(meds: MedRow[], takes: TakeRec[], day: Date, now: Date) {
  return buildDayDoses({
    medications: medsOn(meds, day),
    takes: takesForDay(takes, day),
    day: startOfDay(day),
    now,
  });
}

/** Doses taken and doses scheduled on each of the six days before today and today, oldest first. */
export function weekCounts(
  meds: MedRow[],
  takes: TakeRec[],
  now: Date,
): { taken: number[]; totals: number[] } {
  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
  const built = days.map((d) => dayDoses(meds, takes, d, now));
  return { taken: built.map((b) => b.taken), totals: built.map((b) => b.total) };
}

const WHEN_ORDER: DoseSlot[] = ["morning", "midday", "evening", "night"];

/** "Morning and evening" from the clock times, in plain words. */
export function whenWords(med: MedicationRow): string {
  if (med.schedulePattern === "as_needed") return "When you need it";
  const slots = new Set((med.scheduleTimes ?? []).map((x) => slotOf(x.slice(0, 5))));
  const words = WHEN_ORDER.filter((s) => slots.has(s)).map((s) => SLOT_WORDS[s].toLowerCase());
  if (!words.length) return "No times set";
  const list =
    words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0];
  return list[0].toUpperCase() + list.slice(1);
}

/** The pattern a set of chips writes, so the web's adherence reads it the same way. */
export function patternFor(times: string[]): string {
  if (times.length === 0) return "as_needed";
  return ["once_daily", "twice_daily", "thrice_daily"][times.length - 1] ?? "custom";
}

/* ─── store ────────────────────────────────────────────────────────── */

interface MedState {
  userId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  meds: MedRow[];
  takes: TakeRec[];
  /** Slot key → "HH:MM": a snooze is a reminder on this phone, not a record. */
  snoozed: Record<string, string>;
}

const EMPTY: MedState = { userId: null, status: "idle", meds: [], takes: [], snoozed: {} };
const store = createStore<MedState>(EMPTY);

function fromMedRow(r: Record<string, unknown>): MedRow {
  return {
    id: String(r.id),
    name: String(r.name),
    dose: null,
    instructions: typeof r.instructions === "string" ? r.instructions : null,
    schedulePattern: String(r.schedule_pattern),
    scheduleTimes: Array.isArray(r.schedule_times) ? r.schedule_times.map(String) : null,
    state: String(r.state),
    createdAt: String(r.created_at),
  };
}

function fromTakeRow(r: Record<string, unknown>): TakeRec {
  return {
    id: String(r.id),
    medicationId: String(r.medication_id),
    takenAtIso: String(r.taken_at),
    scheduledForIso: typeof r.scheduled_for === "string" ? r.scheduled_for : null,
  };
}

async function load(): Promise<void> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) {
    store.set(EMPTY);
    return;
  }
  store.set((s) => ({ ...s, userId, status: "loading" }));
  try {
    const client = await db();
    // Eight days back: the week plus last night's doses taken after midnight.
    const since = addDays(new Date(), -8).toISOString();
    const [meds, takes] = await Promise.all([
      client
        .from("self_medications")
        .select("id, name, instructions, schedule_pattern, schedule_times, state, created_at")
        .eq("patient_user_id", userId)
        .in("state", ["active", "paused"])
        .order("created_at", { ascending: true }),
      client
        .from("self_medication_takes")
        .select("id, medication_id, taken_at, scheduled_for")
        .eq("patient_user_id", userId)
        .gte("taken_at", since),
    ]);
    if (meds.error) throw meds.error;
    if (takes.error) throw takes.error;
    store.set((s) => ({
      ...s,
      userId,
      status: "ready",
      meds: (meds.data ?? []).map(fromMedRow),
      takes: (takes.data ?? []).map(fromTakeRow),
    }));
  } catch {
    store.set((s) => ({ ...s, status: s.meds.length ? "ready" : "error" }));
  }
}

let watching = false;
/** One load at a time: several hooks on one screen all ask on mount. */
let inflight: Promise<void> | null = null;

function ensureLoaded(force = false): void {
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

function today(now: Date) {
  const s = store.get();
  return dayDoses(s.meds, s.takes, now, now);
}

/** The take that put a slot into "taken": its own `scheduled_for`, else the same medicine at the same minute. */
function takeFor(slot: WebSlot, takes: TakeRec[]): TakeRec | undefined {
  const mine = takesForDay(takes, slot.at).filter((t) => t.medicationId === slot.medicationId);
  return (
    mine.find(
      (t) => t.scheduledForIso && new Date(t.scheduledForIso).getTime() === slot.at.getTime(),
    ) ?? mine.find((t) => hhmm(new Date(t.takenAtIso)) === slot.takenAtLabel)
  );
}

export const medicinesRepo = {
  /** "I took it": a take against this slot, exactly as the web's `markMedicationTakenAction`. */
  async take(id: string, at: Date = new Date()): Promise<SaveResult> {
    const slot = today(at).slots.find((s) => s.key === id);
    const userId = await currentUserId().catch(() => null);
    if (!slot || !userId) return "failed";
    const take: TakeRec = {
      id: newId(),
      medicationId: slot.medicationId,
      takenAtIso: at.toISOString(),
      scheduledForIso: slot.at.toISOString(),
    };
    store.set((s) => {
      const snoozed = { ...s.snoozed };
      delete snoozed[id];
      return { ...s, takes: [...s.takes, take], snoozed };
    });
    track("dose_confirmed", { slot: slotOf(slot.timeLabel) });
    const result = await insertOrQueue("self_medication_takes", {
      id: take.id,
      patient_user_id: userId,
      medication_id: take.medicationId,
      scheduled_for: take.scheduledForIso,
      taken_at: take.takenAtIso,
    });
    if (result === "failed")
      store.set((s) => ({ ...s, takes: s.takes.filter((x) => x.id !== take.id) }));
    return result;
  },

  /**
   * Undo a take: patients may delete their own takes (0029 policy
   * `self_medication_takes_delete_own`). A take still waiting in the outbox is
   * simply taken out of it. A delete is not queued: offline, the take stays
   * and the screen says it could not be undone.
   */
  async undo(id: string): Promise<SaveResult> {
    const now = new Date();
    const slot = today(now).slots.find((s) => s.key === id);
    const take = slot ? takeFor(slot, store.get().takes) : undefined;
    if (!take) return "failed";
    store.set((s) => ({ ...s, takes: s.takes.filter((x) => x.id !== take.id) }));
    track("dose_undone", { slot: slot ? slotOf(slot.timeLabel) : "unknown" });
    if (await unqueue(take.id)) return "sent";
    try {
      const { error } = await (await db()).from("self_medication_takes").delete().eq("id", take.id);
      if (!error) return "sent";
    } catch {
      // Offline: put it back below.
    }
    store.set((s) => ({ ...s, takes: [...s.takes, take] }));
    return "failed";
  },

  /** A reminder in fifteen minutes, on this phone only. */
  snooze(id: string, at: Date = new Date()) {
    const until = hhmm(new Date(at.getTime() + 15 * 60 * 1000));
    store.set((s) => ({ ...s, snoozed: { ...s.snoozed, [id]: until } }));
    track("dose_snoozed", { slot: slotOf(id.slice(-5)) });
  },

  /** "Something not on my list": the patient adds it, by name and times of day. No amount is asked (law L5). */
  async add(name: string, slots: DoseSlot[]): Promise<SaveResult> {
    const userId = await currentUserId().catch(() => null);
    const clean = name.trim().slice(0, 120);
    if (!userId || !clean) return "failed";
    const times = [...new Set(slots.map((s) => SLOT_TIMES[s]))].sort();
    const row: MedRow = {
      id: newId(),
      name: clean,
      dose: null,
      instructions: null,
      schedulePattern: patternFor(times),
      scheduleTimes: times.length ? times : null,
      state: "active",
      createdAt: new Date().toISOString(),
    };
    store.set((s) => ({ ...s, meds: [...s.meds, row] }));
    const result = await insertOrQueue("self_medications", {
      id: row.id,
      patient_user_id: userId,
      name: row.name,
      schedule_pattern: row.schedulePattern,
      schedule_times: row.scheduleTimes,
      state: "active",
    });
    if (result === "failed")
      store.set((s) => ({ ...s, meds: s.meds.filter((m) => m.id !== row.id) }));
    return result;
  },

  /** Pause, resume or stop a medicine, like the web. Online only: it changes a row, not adds one. */
  async setState(id: string, state: "active" | "paused" | "ended"): Promise<SaveResult> {
    const before = store.get().meds;
    store.set((s) => ({
      ...s,
      meds:
        state === "ended"
          ? s.meds.filter((m) => m.id !== id)
          : s.meds.map((m) => (m.id === id ? { ...m, state } : m)),
    }));
    try {
      const update: { state: string; ended_on?: string } = { state };
      if (state === "ended") update.ended_on = new Date().toISOString().slice(0, 10);
      const { error } = await (await db()).from("self_medications").update(update).eq("id", id);
      if (!error) return "sent";
    } catch {
      // Offline: undone below.
    }
    store.set((s) => ({ ...s, meds: before }));
    return "failed";
  },
};

/**
 * Today's doses, the week and the medicine list. Keeps the round-1 contract
 * (`doses`, `dueNow`, `taken`, `total`, `week`, `medicines`, `otherReported`)
 * and adds `weekTotals`, `loading`, `error` and `retry`. `dueNow` puts the
 * dose a tap now belongs to first (`pendingSlotAt`).
 */
export function useMedicines(now: Date) {
  const s = useStore(store);
  useEffect(() => ensureLoaded(), []);
  const day = dayDoses(s.meds, s.takes, now, now);
  const doses = day.slots.map((slot) => ({
    ...toDose(slot, s.snoozed[slot.key] ?? null),
    status: doseStatus(slot, now),
  }));
  const pending = pendingSlotAt(day.slots, now)?.key;
  const dueNow = doses
    .filter((d) => d.status === "due")
    .sort((a, b) => Number(b.id === pending) - Number(a.id === pending));
  const week = weekCounts(s.meds, s.takes, now);
  const medicines: Medicine[] = s.meds.map((m) => ({
    id: m.id,
    name: m.name,
    when: whenWords(m),
    instructions: m.instructions,
    state: m.state === "paused" ? "paused" : "active",
  }));
  return {
    doses,
    dueNow,
    taken: day.taken,
    total: day.total,
    week: week.taken,
    weekTotals: week.totals,
    medicines,
    otherReported: false,
    loading: s.status === "idle" || s.status === "loading",
    error: s.status === "error",
    retry: () => ensureLoaded(true),
  };
}
