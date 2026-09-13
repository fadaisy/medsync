/**
 * Dose-slot derivation for the patient workspace.
 *
 * Pure and client-safe on purpose: `mark-taken-button.tsx` imports these
 * types, so this file must never import `server-only`. It also means the
 * whole derivation is unit-testable without a database — which matters,
 * because getting it wrong tells a patient they missed a dose they took.
 *
 * The shape of the problem: `self_medications` stores a schedule
 * (`schedule_times`, or a coarse `schedule_pattern`) and
 * `self_medication_takes` stores confirmed takes. Neither is a dose list.
 * This file turns the two into one ordered list of slots for a chosen day,
 * each with a state the UI may show.
 */

/* ─── tints ──────────────────────────────────────────────────────── */

export const ROW_TINTS = ["brand", "mint", "teal"] as const;
export type RowTint = (typeof ROW_TINTS)[number] | "neutral";

export const TINT_ROW: Record<RowTint, string> = {
  brand: "bg-brand-50",
  mint: "bg-mint-50",
  teal: "bg-teal-50",
  // Two steps darker than the coloured tints, and deliberately so. Those
  // three separate from the page on hue, so `-50` is enough; a grey has no
  // hue to spend, and `gray-100` on the layout's `bg-muted` ground is
  // #f5f5f5 on #fafafa in light and #171717 on #111111 in dark — a row that
  // reads as flat page, which is the one tint that also carries meaning.
  neutral: "bg-gray-150",
};

export const TINT_GLYPH: Record<RowTint, string> = {
  brand: "bg-brand-200 text-brand-800",
  mint: "bg-mint-200 text-mint-800",
  teal: "bg-teal-200 text-teal-800",
  // Moved up with the row above it: `gray-200` sat 4% off `gray-150` and the
  // glyph disc vanished into its own row.
  neutral: "bg-gray-300 text-gray-800",
};

/**
 * Stable per-medication recognition tint. Identity only — never state.
 *
 * Hashed on the medication id and never on the list index: a re-sort or a
 * stopped medication would otherwise recolour every row below it and
 * destroy the recognition the tint exists to give.
 *
 * `neutral` is outside the rotation. It is assigned only to a medication
 * that is no longer active, which is the one case where the tint carries
 * meaning — and that row always ships a "Stopped" pill beside it, because
 * colour alone never conveys state.
 */
export function rowTint(id: string): RowTint {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ROW_TINTS[h % ROW_TINTS.length] ?? ROW_TINTS[0];
}

/* ─── slots ──────────────────────────────────────────────────────── */

export type SlotState = "taken" | "missed" | "open";

/** How long after a slot's clock time a dose still reads as due, not missed. */
export const DOSE_GRACE_MINUTES = 60;

/**
 * The times we are willing to guess when a patient set a pattern but never
 * set the clock times. A guessed slot is `presumed` and can never reach
 * `missed` — see `slotState` below.
 */
const DEFAULT_TIMES: Record<string, string[]> = {
  once_daily: ["08:00"],
  twice_daily: ["08:00", "20:00"],
  thrice_daily: ["08:00", "14:00", "20:00"],
};

export interface DoseSlot {
  /** `${medicationId}@${timeLabel}` — unique, because times are deduped. */
  key: string;
  medicationId: string;
  name: string;
  dose: string | null;
  instructions: string | null;
  /** 24-hour "08:00". */
  timeLabel: string;
  /** The local instant on the selected day. */
  at: Date;
  /** Derived from `schedule_pattern` — the patient never set this time. */
  presumed: boolean;
  state: SlotState;
  /** 24-hour "08:12" of the take that claimed this slot. */
  takenAtLabel: string | null;
  tint: RowTint;
}

/** A take that claimed no slot. Never an error — people take extra doses. */
export interface ExtraDose {
  key: string;
  medicationId: string;
  name: string;
  timeLabel: string;
  at: Date;
  tint: RowTint;
}

/** A medication with no slots on this day: as-needed, or times never set. */
export interface AsNeededRow {
  medicationId: string;
  name: string;
  dose: string | null;
  instructions: string | null;
  schedulePattern: string;
  /**
   * True when the medication claims a scheduled pattern we could not turn
   * into times (a custom schedule cannot be guessed). The UI offers "Set
   * times" here; an as-needed medication gets no such prompt.
   */
  hasNoTimes: boolean;
  /** 24-hour labels of every take recorded against this row on the day. */
  takenTimeLabels: string[];
  tint: RowTint;
}

export interface DayDoses {
  /** Chronological. */
  slots: DoseSlot[];
  extras: ExtraDose[];
  asNeeded: AsNeededRow[];
  /** `slots.length` — never includes extras or as-needed rows. */
  total: number;
  taken: number;
  /** The earliest slot still ahead of the patient, or null. */
  next: DoseSlot | null;
}

/** The medication columns the derivation reads. */
export interface MedicationRow {
  id: string;
  name: string;
  dose: string | null;
  instructions: string | null;
  schedulePattern: string;
  /** Drizzle returns postgres `time` as "08:00:00". */
  scheduleTimes: string[] | null;
  state: string;
}

export interface TakeRow {
  medicationId: string;
  takenAtIso: string;
  scheduledForIso: string | null;
}

export interface BuildDayDosesInput {
  medications: ReadonlyArray<MedicationRow>;
  takes: ReadonlyArray<TakeRow>;
  /** Local midnight of the selected day. */
  day: Date;
  now: Date;
}

// ponytail: slot instants use the server's local midnight. A patient in a
// different TZ from the server sees slots shifted. Upgrade path is a
// patient_profiles.timezone column read here — one param, no new table.

export function buildDayDoses(input: BuildDayDosesInput): DayDoses {
  const { medications, takes, now } = input;
  const dayStart = startOfLocalDay(input.day);

  const slots: DoseSlot[] = [];
  const asNeeded: AsNeededRow[] = [];
  const asNeededByMed = new Map<string, AsNeededRow>();
  /** Unclaimed slots per medication, chronological — the claim pool. */
  const poolByMed = new Map<string, DoseSlot[]>();
  const medById = new Map<string, { name: string; tint: RowTint; active: boolean }>();

  for (const med of medications) {
    const active = med.state === "active";
    const tint: RowTint = active ? rowTint(med.id) : "neutral";
    medById.set(med.id, { name: med.name, tint, active });

    const setTimes = normaliseTimes(med.scheduleTimes);
    const presumed = setTimes.length === 0;
    const times = presumed ? (DEFAULT_TIMES[med.schedulePattern] ?? []) : setTimes;

    // An as-needed medication has no slots ever, even if times were set:
    // there is no dose it can be late for.
    if (med.schedulePattern === "as_needed" || times.length === 0) {
      const row: AsNeededRow = {
        medicationId: med.id,
        name: med.name,
        dose: med.dose,
        instructions: med.instructions,
        schedulePattern: med.schedulePattern,
        hasNoTimes: med.schedulePattern !== "as_needed",
        takenTimeLabels: [],
        tint,
      };
      asNeeded.push(row);
      asNeededByMed.set(med.id, row);
      continue;
    }

    const medSlots = times.map<DoseSlot>((timeLabel) => ({
      key: `${med.id}@${timeLabel}`,
      medicationId: med.id,
      name: med.name,
      dose: med.dose,
      instructions: med.instructions,
      timeLabel,
      at: atOnDay(dayStart, timeLabel),
      presumed,
      state: "open",
      takenAtLabel: null,
      tint,
    }));
    slots.push(...medSlots);
    poolByMed.set(med.id, [...medSlots]);
  }

  /* ─── claim takes ─────────────────────────────────────────────── */

  const takenLabelByKey = new Map<string, string | null>();
  const claim = (slot: DoseSlot, takenAt: Date, pool: DoseSlot[]) => {
    // A take recorded after midnight against the previous evening's slot is
    // a real thing (that is what `scheduled_for` is for), but its clock time
    // printed beside that slot would read as that time on the slot's own day
    // — "Taken 00:20" on a 20:00 dose. A null label makes `slotStateLabel`
    // say a bare "Taken", which is the part we actually know.
    const sameDay = startOfLocalDay(takenAt).getTime() === startOfLocalDay(slot.at).getTime();
    takenLabelByKey.set(slot.key, sameDay ? timeLabelOf(takenAt) : null);
    pool.splice(pool.indexOf(slot), 1);
  };

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const parsed = takes
    // A take for a medication outside this day's list has no name to render.
    .flatMap((t) => {
      const med = medById.get(t.medicationId);
      const takenAt = new Date(t.takenAtIso);
      if (!med || Number.isNaN(takenAt.getTime())) return [];
      const raw = t.scheduledForIso ? new Date(t.scheduledForIso) : null;
      const scheduledFor = raw && !Number.isNaN(raw.getTime()) ? raw : null;
      // A take that names a slot on another day belongs to that day's list,
      // never to this one. Without this, a 20:00 dose recorded at 00:20 is
      // handed to the greedy pass on the following day, where 08:00 is the
      // nearest slot (7h40 vs 19h40) — a "Taken 00:20" on a dose nobody has
      // taken yet. `listTakesForDay` windows on the same
      // coalesce(scheduled_for, taken_at); this is the second lock.
      if (scheduledFor && !withinDay(scheduledFor, dayStart, dayEnd)) return [];
      return [
        {
          medicationId: t.medicationId,
          name: med.name,
          tint: med.tint,
          takenAt,
          scheduledFor,
          claimed: false,
        },
      ];
    })
    .sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());

  // Pass one: an exact `scheduled_for` match. Every take written after this
  // redesign carries one, so this is the normal path and it is unambiguous.
  for (const t of parsed) {
    const scheduledFor = t.scheduledFor;
    const pool = poolByMed.get(t.medicationId);
    if (!scheduledFor || !pool) continue;
    const exact = pool.find((s) => s.at.getTime() === scheduledFor.getTime());
    if (!exact) continue;
    claim(exact, t.takenAt, pool);
    t.claimed = true;
  }

  // Pass two: legacy takes (and takes whose slot time has since changed)
  // greedily claim that medication's nearest unclaimed slot — with NO
  // distance window. A window is how a patient's own home screen ends up
  // saying "Missed" for a dose they took: with a ±2h window a 08:00 dose
  // taken at 19:00 leaves 08:00 unclaimed and libelled. Unwindowed, the
  // take claims its nearest slot and only a genuinely unrecorded slot is
  // left over. Ties go to the earlier slot.
  for (const t of parsed) {
    if (t.claimed) continue;
    const pool = poolByMed.get(t.medicationId);
    if (!pool) continue;
    const best = nearestByInstant(pool, t.takenAt);
    if (!best) continue;
    claim(best, t.takenAt, pool);
    t.claimed = true;
  }

  // Whatever is left claimed nothing. For an as-needed medication that is
  // simply the normal case — the take is the record, there was no slot to
  // hit — so it lands on that row. Otherwise takes outnumbered slots, which
  // is an extra dose, not a failure.
  const extras: ExtraDose[] = [];
  for (const t of parsed) {
    if (t.claimed) continue;
    const row = asNeededByMed.get(t.medicationId);
    if (row) {
      row.takenTimeLabels.push(timeLabelOf(t.takenAt));
      continue;
    }
    extras.push({
      key: `${t.medicationId}@extra@${t.takenAt.toISOString()}`,
      medicationId: t.medicationId,
      name: t.name,
      timeLabel: timeLabelOf(t.takenAt),
      at: t.takenAt,
      tint: t.tint,
    });
  }

  /* ─── state ───────────────────────────────────────────────────── */

  for (const slot of slots) {
    const label = takenLabelByKey.get(slot.key);
    if (label !== undefined) {
      slot.state = "taken";
      slot.takenAtLabel = label;
      continue;
    }
    slot.state = slotState(slot, now, medById.get(slot.medicationId)?.active ?? true);
  }

  slots.sort(byInstantThenName);

  const takenCount = slots.reduce((n, s) => n + (s.state === "taken" ? 1 : 0), 0);
  const graceMs = DOSE_GRACE_MINUTES * 60_000;
  const next =
    slots.find((s) => s.state === "open" && s.at.getTime() + graceMs >= now.getTime()) ?? null;

  return {
    slots,
    extras,
    asNeeded,
    total: slots.length,
    taken: takenCount,
    next,
  };
}

/**
 * The slot a "Take" tapped *now* belongs to — the non-taken slot nearest the
 * clock, and never simply the earliest one.
 *
 * A surface that offers one button for a whole medicine has to name the slot
 * it is recording against. Taking the first unrecorded slot gets this wrong
 * in the one case that matters: twice-daily 08:00/20:00, morning never
 * recorded, patient taps at 19:55 — the take is written against 08:00, and
 * the 20:00 dose they just swallowed is left unclaimed and flips to "Missed"
 * at 21:00. Telling a patient they missed a dose they took is the harm this
 * whole file exists to prevent.
 *
 * Nearest-to-now is also exactly what the greedy pass in `buildDayDoses`
 * would choose for a take carrying no slot at all, so the surface that names
 * a slot and the derivation that infers one can never disagree.
 *
 * Pass a chronological list (`DayDoses.slots` is one): ties go to the earlier
 * slot, which is the same tie-break the greedy pass uses.
 */
export function pendingSlotAt(slots: ReadonlyArray<DoseSlot>, now: Date): DoseSlot | undefined {
  return nearestByInstant(
    slots.filter((s) => s.state !== "taken"),
    now,
  );
}

/**
 * Whether a dose belonging to `day` can still be recorded: today, and
 * yesterday, and nothing further back.
 *
 * Yesterday, because midnight is not a boundary a patient's evening
 * respects. A 20:00 dose swallowed at 00:20 is yesterday's dose, and while
 * recording was today-only it was unreachable from either screen — today's
 * timeline has no 20:00 row for it, and yesterday's had no button — so it
 * stayed "Missed" forever for a dose that was taken. The take carries
 * `scheduled_for`, so `listTakesForDay` files it under the evening it names
 * rather than the clock it was tapped on.
 *
 * Nothing further back, because `markMedicationTakenAction` stamps
 * `taken_at` with the clock. One night's rounding is defensible; writing
 * Friday into the record as the moment Tuesday's pill was swallowed is a
 * fabrication.
 */
export function isRecordableDay(day: Date, now: Date): boolean {
  const dayStart = startOfLocalDay(day).getTime();
  const today = startOfLocalDay(now);
  const earliest = startOfLocalDay(now);
  earliest.setDate(earliest.getDate() - 1);
  return dayStart >= earliest.getTime() && dayStart <= today.getTime();
}

/**
 * The single sentence the UI renders beside a slot's tint and icon. Colour
 * never carries state on its own, so this is always shown.
 */
export function slotStateLabel(slot: DoseSlot, day: Date, now: Date): string {
  if (slot.state === "taken") {
    return slot.takenAtLabel ? `Taken ${slot.takenAtLabel}` : "Taken";
  }
  if (slot.state === "missed") return "Missed";

  // Open. A day still ahead of us is scheduled, not due.
  if (startOfLocalDay(day).getTime() > startOfLocalDay(now).getTime()) return "Scheduled";
  if (slot.at.getTime() + DOSE_GRACE_MINUTES * 60_000 >= now.getTime()) {
    return `Due ${slot.timeLabel}`;
  }
  // A presumed slot past its grace, or any slot on a past day. We know
  // nothing was recorded; we do not know that anything was missed.
  return "No entry";
}

/* ─── internals ──────────────────────────────────────────────────── */

function slotState(slot: DoseSlot, now: Date, active: boolean): SlotState {
  // A presumed slot can never be missed. We invented the time; inventing
  // the failure on top of it would be two fabrications in one row.
  if (slot.presumed) return "open";
  // Nor can a medicine the patient is no longer taking. `listMedicationsForDay`
  // returns paused rows on every day (there is no paused-on date to bound them
  // with) and rows ended *on* the day (`ended_on` is a date, so it cannot say
  // at what hour) — so without this a paused medicine would accuse its owner of
  // missing a dose every day forever, and a stopped one for the rest of the day
  // it was stopped. Same principle as `presumed`, and it only ever moves a slot
  // toward `open`, which is the safe direction.
  if (!active) return "open";
  return slot.at.getTime() + DOSE_GRACE_MINUTES * 60_000 < now.getTime() ? "missed" : "open";
}

/**
 * Nearest entry by instant. Ties go to the earlier one, so the caller passes
 * a chronological list. One rule, two callers — the greedy claim pass and
 * `pendingSlotAt` — because a surface that picks a different slot from the
 * one the derivation would infer is how a dose ends up on the wrong row.
 */
function nearestByInstant<T extends { at: Date }>(
  entries: ReadonlyArray<T>,
  instant: Date,
): T | undefined {
  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    const distance = Math.abs(instant.getTime() - entry.at.getTime());
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

function withinDay(d: Date, dayStart: Date, dayEnd: Date): boolean {
  return d.getTime() >= dayStart.getTime() && d.getTime() < dayEnd.getTime();
}

/**
 * Host-local, and NOT the engine's `startOfLocalDay(instant, zone)`: this
 * module, `day-strip.tsx` (`fromDayIso`/`toDayIso`) and `self-tracking.ts`
 * form one calendar in the PATIENT's zone — `atOnDay` and `timeLabelOf`
 * read the same clock — and a patient is not a hospital. Re-basing one
 * midnight alone would put "08:00" on the wrong day. See the ponytail note
 * on `buildDayDoses` for the upgrade path (`patient_profiles.timezone`).
 */
function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function atOnDay(dayStart: Date, timeLabel: string): Date {
  const out = new Date(dayStart);
  out.setHours(Number(timeLabel.slice(0, 2)), Number(timeLabel.slice(3, 5)), 0, 0);
  return out;
}

function timeLabelOf(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * "08:00:00" → "08:00", deduped and sorted. Anything that is not a real
 * clock time is dropped rather than trusted: a bad row would otherwise
 * produce an Invalid Date and poison the whole day's ordering.
 */
function normaliseTimes(times: string[] | null): string[] {
  if (!times) return [];
  const seen = new Set<string>();
  for (const raw of times) {
    const m = /^(\d{2}):(\d{2})/.exec(raw ?? "");
    if (!m) continue;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) continue;
    seen.add(`${m[1]}:${m[2]}`);
  }
  return [...seen].sort();
}

function byInstantThenName(a: DoseSlot, b: DoseSlot): number {
  return a.at.getTime() - b.at.getTime() || a.name.localeCompare(b.name);
}
