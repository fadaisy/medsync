import type { UssdStep } from "@/db/schema/channels";
import type { Language, StringKey } from "@/lib/channels/strings";

import { DEFAULT_LANGUAGE, isLanguage, LANGUAGES, t } from "@/lib/channels/strings";

/**
 * The USSD menu (Gate F, ADR 0091; PRD §3.2 journey 2, §3.3.7) as a PURE
 * state machine. Two functions, no I/O:
 *
 *   applyInput(state, input, data) → { state', effect }   the transition
 *   render(state, data)            → "CON …" | "END …"    the screen
 *
 * The route owns the I/O around them: it loads the session row, fetches
 * `data` for the CURRENT step, applies the input, fetches `data` for the NEW
 * step, runs the effect (book / cancel / confirm through the service-role
 * functions), renders, stores. Africa's Talking sends the whole "*"-joined
 * history as `text`; the route hands this file only the LAST segment,
 * because the row already knows where the caller is — that is what makes a
 * session resumable and a replayed callback harmless.
 *
 * Budget (PRD §3.2.2): every screen ≤ 160 ASCII characters (`fit()` cuts
 * names, never sentences), ≤ 6 levels on the booking path:
 *   1 language → 2 hospital → 3 clinic → 4 day → 5 name+age → 6 confirm → END
 * A slot-mode clinic's day screen lists the next open slots as "day, time"
 * so it costs one level, not two. English only at launch; every word comes
 * from `strings.ts` (a test greps this file for literals).
 *
 * Identity: the carrier-verified phone books a PROVISIONAL patient (C4). A
 * phone the route recognises (patient_profiles blind index) is OFFERED
 * "Booking as {name}" — never auto-linked (PRD §2.8); the desk reconciles.
 */

export const SCREEN_MAX = 160;
export const PAGE_SIZE = 5;
export const DAYS_PER_SCREEN = 3;
export const MAX_LEVELS = 6;

export type { UssdStep };

export interface UssdSelections {
  hospitalPage?: number;
  hospitalId?: string;
  linePage?: number;
  lineId?: string;
  dayPage?: number;
  /** Exactly one of these once a day is picked. */
  sessionId?: string;
  slot?: SlotPick;
  /** The caller's declared identity — a provisional row's worth. */
  name?: string;
  age?: number;
  /** Set instead of `age` when the caller accepted "Booking as {name}". */
  dateOfBirth?: string;
  /** cancel / confirm by code. */
  code?: string;
  /** The root that led here: "book" | "next" | "cancel" | "confirm". */
  intent?: "book" | "next" | "cancel" | "confirm";
}

export interface SlotPick {
  clinician_user_id: string;
  department_id: string;
  starts_at: string;
  ends_at: string;
}

export interface UssdState {
  language: Language;
  step: UssdStep;
  selections: UssdSelections;
}

export const INITIAL_STATE: UssdState = {
  language: DEFAULT_LANGUAGE,
  step: "root",
  selections: {},
};

/* ─── what the route fetches for a step ──────────────────────────── */

export interface HospitalOption {
  id: string;
  name: string;
}
export interface LineOptionUssd {
  id: string;
  name: string;
  capacityMode: "session" | "slot" | "open_queue";
}
/** One pickable day: a clinic day (session) or an open slot (day + time). */
export interface DayOption {
  /** "Tue 22 Sep" (session) or "Tue 22 Sep 9:30 AM" (slot). */
  label: string;
  sessionId?: string;
  slot?: SlotPick;
}
export interface KnownPatient {
  firstName: string;
  dateOfBirth: string;
}
export interface NextVisit {
  dayLabel: string;
  /** "" for a clinic day (a position, not a time); " 9:30 AM" for a slot. */
  timeLabel: string;
  hospitalName: string;
  code: string;
}
export type BookOutcome =
  | {
      ok: true;
      code: string;
      position: number | null;
      window: string | null;
      day: string;
      time: string | null;
      /** The provisional row the booking was made for — stored on the session row. */
      provisionalId?: string | null;
    }
  | { ok: false; reason: string };
export type ActOutcome =
  | { ok: true; code: string }
  | { ok: false; key: "code_unknown" | "not_cancellable" | "not_confirmable" };

export interface UssdData {
  hospitals?: HospitalOption[];
  lines?: LineOptionUssd[];
  days?: DayOption[];
  known?: KnownPatient | null;
  nextVisit?: NextVisit | null;
  /** The `done` screen's material. */
  booked?: BookOutcome;
  acted?: ActOutcome;
  /** The route hit the per-phone limit: END with the sentence. */
  tooMany?: boolean;
  /** Names for the confirm line. */
  hospitalName?: string;
  lineName?: string;
  dayLabel?: string;
}

export type UssdEffect =
  | {
      kind: "book";
      hospitalId: string;
      lineId: string;
      sessionId?: string;
      slot?: SlotPick;
      name: string;
      age?: number;
      dateOfBirth?: string;
    }
  | { kind: "cancel"; code: string }
  | { kind: "confirm"; code: string };

/* ─── the transition ─────────────────────────────────────────────── */

/** The last "*"-segment of Africa's Talking's `text`; "" on the first callback. */
export function lastSegment(text: string): string {
  const parts = text.split("*");
  return (parts[parts.length - 1] ?? "").trim();
}

const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * One input on one screen. `input` is "" for the first callback (nothing to
 * apply — the root renders). An unrecognised input leaves the step where it
 * is; `render` then says so. Pure: same (state, input, data) → same result.
 */
export function applyInput(
  state: UssdState,
  input: string,
  data: UssdData,
): { state: UssdState; effect: UssdEffect | null; invalid: boolean } {
  const sel = state.selections;
  const next = (patch: Partial<UssdState>, effect: UssdEffect | null = null) => ({
    state: { ...state, ...patch, selections: { ...sel, ...(patch.selections ?? {}) } },
    effect,
    invalid: false,
  });
  const stay = { state, effect: null, invalid: true };

  if (input === "") return { state, effect: null, invalid: false };

  switch (state.step) {
    case "root": {
      if (input === "1") {
        // With one language on, the language screen is still level 1 of the
        // path (the contract's count); with two it is a real choice.
        return next({ step: "language", selections: { intent: "book" } });
      }
      if (input === "2") return next({ step: "done", selections: { intent: "next" } });
      if (input === "3") return next({ step: "cancel_code", selections: { intent: "cancel" } });
      if (input === "4") return next({ step: "confirm_code", selections: { intent: "confirm" } });
      return stay;
    }

    case "language": {
      const lang = LANGUAGES.find((l) => l.digit === input);
      if (!lang || !isLanguage(lang.code)) return stay;
      return next({ language: lang.code, step: "hospital", selections: { hospitalPage: 0 } });
    }

    case "hospital": {
      const pick = pickFromPage(input, data.hospitals ?? [], sel.hospitalPage ?? 0, PAGE_SIZE);
      if (pick.kind === "more") return next({ selections: { hospitalPage: pick.page } });
      if (pick.kind === "none") return stay;
      return next({ step: "line", selections: { hospitalId: pick.item.id, linePage: 0 } });
    }

    case "line": {
      const pick = pickFromPage(input, data.lines ?? [], sel.linePage ?? 0, PAGE_SIZE);
      if (pick.kind === "more") return next({ selections: { linePage: pick.page } });
      if (pick.kind === "none") return stay;
      return next({ step: "day", selections: { lineId: pick.item.id, dayPage: 0 } });
    }

    case "day": {
      const pick = pickFromPage(input, data.days ?? [], sel.dayPage ?? 0, DAYS_PER_SCREEN);
      if (pick.kind === "more") return next({ selections: { dayPage: pick.page } });
      if (pick.kind === "none") return stay;
      return next({
        step: "name",
        selections: pick.item.sessionId
          ? { sessionId: pick.item.sessionId, slot: undefined }
          : { slot: pick.item.slot, sessionId: undefined },
      });
    }

    case "name": {
      // A recognised phone: "1" takes the account's name and date of birth;
      // "2" (or anything else) falls through to typing a name and age.
      const offering = !!data.known && sel.name === undefined;
      if (offering && input === "1") {
        return next({
          step: "confirm",
          selections: {
            name: data.known?.firstName,
            dateOfBirth: data.known?.dateOfBirth,
            age: undefined,
          },
        });
      }
      if (offering && input === "2") return next({ selections: { name: "" } }); // now asks to type
      if (offering) return stay;
      const parsed = parseNameAge(input);
      if (!parsed) return stay;
      return next({ step: "confirm", selections: { ...parsed, dateOfBirth: undefined } });
    }

    case "confirm": {
      if (input === "2") return next({ step: "done", selections: { intent: undefined } });
      if (input !== "1") return stay;
      if (!sel.hospitalId || !sel.lineId || !sel.name || (!sel.sessionId && !sel.slot)) return stay;
      return next(
        { step: "done" },
        {
          kind: "book",
          hospitalId: sel.hospitalId,
          lineId: sel.lineId,
          ...(sel.sessionId ? { sessionId: sel.sessionId } : { slot: sel.slot as SlotPick }),
          name: sel.name,
          ...(sel.dateOfBirth ? { dateOfBirth: sel.dateOfBirth } : { age: sel.age as number }),
        },
      );
    }

    case "cancel_code":
    case "confirm_code": {
      const code = input.toUpperCase().replace(/\s+/g, "");
      if (!CODE.test(code)) return stay;
      const kind = state.step === "cancel_code" ? "cancel" : "confirm";
      return next({ step: "done", selections: { code } }, { kind, code });
    }

    case "done":
      return { state, effect: null, invalid: false };
  }
}

/** "Amina 34" → { name: "Amina", age: 34 }; anything else → null. */
export function parseNameAge(input: string): { name: string; age: number } | null {
  const m = /^(.*\S)\s+(\d{1,3})$/.exec(input.trim());
  if (!m) return null;
  const age = Number(m[2]);
  const name = (m[1] as string).replace(/\s+/g, " ").trim();
  if (age < 0 || age > 130 || name.length < 2 || name.length > 80) return null;
  return { name, age };
}

type Pick<T> = { kind: "item"; item: T } | { kind: "more"; page: number } | { kind: "none" };

/** Digit 1..N picks from the current page; "0" pages forward (wrapping to the first page). */
function pickFromPage<T>(input: string, items: readonly T[], page: number, size: number): Pick<T> {
  if (items.length === 0) return { kind: "none" };
  const pages = Math.ceil(items.length / size);
  if (input === "0" && pages > 1) return { kind: "more", page: (page + 1) % pages };
  const n = Number(input);
  if (!Number.isInteger(n) || n < 1 || n > size) return { kind: "none" };
  const item = items[page * size + (n - 1)];
  return item === undefined ? { kind: "none" } : { kind: "item", item };
}

/* ─── the screen ─────────────────────────────────────────────────── */

/**
 * The screen for `state`, ≤ 160 ASCII characters, "CON " to continue or
 * "END " to finish. `invalid` prefixes the one-line refusal.
 */
export function render(state: UssdState, data: UssdData, invalid = false): string {
  const L = state.language;
  const sel = state.selections;
  const s = (key: StringKey, vars?: Record<string, string | number | null | undefined>) =>
    t(L, key, vars);
  const head = invalid ? `${s("invalid")}\n` : "";

  if (data.tooMany) return end(s("too_many"));

  switch (state.step) {
    case "root":
      return con([
        s("brand"),
        s("root_book"),
        s("root_next"),
        s("root_cancel"),
        s("root_confirm"),
        s("emergency"),
      ]);

    case "language":
      return con([head + s("pick_language"), ...LANGUAGES.map((l) => `${l.digit} ${l.name}`)]);

    case "hospital": {
      const items = data.hospitals ?? [];
      if (items.length === 0) return end(s("no_hospitals"));
      return paged(
        head + s("pick_hospital"),
        items.map((h) => h.name),
        sel.hospitalPage ?? 0,
        PAGE_SIZE,
        s("more"),
      );
    }

    case "line": {
      const items = data.lines ?? [];
      if (items.length === 0) return end(s("no_lines"));
      return paged(
        head + s("pick_line"),
        items.map((l) => l.name),
        sel.linePage ?? 0,
        PAGE_SIZE,
        s("more"),
      );
    }

    case "day": {
      const items = data.days ?? [];
      if (items.length === 0) return end(s("no_days"));
      return paged(
        head + s("pick_day"),
        items.map((d) => d.label),
        sel.dayPage ?? 0,
        DAYS_PER_SCREEN,
        s("more"),
      );
    }

    case "name":
      if (data.known && sel.name === undefined) {
        return con([head + fit(s("known_name", { name: data.known.firstName }), SCREEN_MAX - 4)]);
      }
      return con([invalid ? s("name_age_invalid") : s("ask_name_age")]);

    case "confirm":
      return con([
        head +
          fitConfirm(L, {
            line: data.lineName ?? "",
            hospital: data.hospitalName ?? "",
            day: data.dayLabel ?? "",
          }),
      ]);

    case "cancel_code":
      return con([head + s("ask_code_cancel")]);
    case "confirm_code":
      return con([head + s("ask_code_confirm")]);

    case "done": {
      if (sel.intent === "next") {
        const v = data.nextVisit;
        if (!v) return end(s("next_none"));
        return end(
          fit(
            s("next_visit", {
              day: v.dayLabel,
              time: v.timeLabel,
              hospital: v.hospitalName,
              code: v.code,
            }),
            SCREEN_MAX - 4 - s("emergency").length - 1,
          ) + `\n${s("emergency")}`,
        );
      }
      if (sel.intent === "cancel" || sel.intent === "confirm") {
        const a = data.acted;
        if (!a) return end(s("unavailable"));
        if (!a.ok) return end(s(a.key, { code: sel.code }));
        return end(s(sel.intent === "cancel" ? "cancelled" : "confirmed", { code: a.code }));
      }
      if (sel.intent === "book") {
        const b = data.booked;
        if (!b) return end(s("unavailable"));
        if (!b.ok) return end(fit(s("book_failed", { reason: b.reason }), SCREEN_MAX - 4));
        return end(
          b.position !== null
            ? s("booked_position", { position: b.position, window: b.window, code: b.code })
            : s("booked_time", { day: b.day, time: b.time, code: b.code }),
        );
      }
      return end(s("cancelled_by_user"));
    }
  }
}

function con(lines: string[]): string {
  return `CON ${lines.join("\n")}`;
}
function end(text: string): string {
  return `END ${text}`;
}

/**
 * A numbered page of names under a heading, with "0 More" when there is
 * another page. Names are cut to share the remaining budget equally; the
 * heading and the paging line are never cut.
 */
function paged(heading: string, names: string[], page: number, size: number, more: string): string {
  const slice = names.slice(page * size, page * size + size);
  const hasMore = names.length > size;
  const fixed = 4 + heading.length + (hasMore ? more.length + 1 : 0) + slice.length; // "CON " + newlines
  const digits = slice.reduce((n, _, i) => n + `${i + 1} `.length, 0);
  const perName = Math.max(
    6,
    Math.floor((SCREEN_MAX - fixed - digits) / Math.max(1, slice.length)),
  );
  const lines = slice.map((name, i) => `${i + 1} ${fit(ascii(name), perName)}`);
  return con([heading, ...lines, ...(hasMore ? [more] : [])]);
}

/** The confirm sentence, cutting the hospital then the clinic name until it fits. */
function fitConfirm(L: Language, v: { line: string; hospital: string; day: string }): string {
  let line = ascii(v.line);
  let hospital = ascii(v.hospital);
  let out = t(L, "confirm", { line, hospital, day: v.day });
  while (out.length > SCREEN_MAX - 4 && (hospital.length > 4 || line.length > 4)) {
    if (hospital.length >= line.length) hospital = hospital.slice(0, -1).trimEnd();
    else line = line.slice(0, -1).trimEnd();
    out = t(L, "confirm", { line, hospital, day: v.day });
  }
  return out;
}

/** GSM-7-safe: ASCII only, whitespace collapsed. */
export function ascii(value: string): string {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut to `max` characters, never mid-word when a space is near. */
export function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(1, max));
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}

/** The path's depth so far — the ≤ 6 rule, asserted by a test over every route through the menu. */
export function level(step: UssdStep): number {
  const order: Record<UssdStep, number> = {
    root: 0,
    language: 1,
    hospital: 2,
    line: 3,
    day: 4,
    name: 5,
    confirm: 6,
    cancel_code: 1,
    confirm_code: 1,
    done: 0,
  };
  return order[step];
}
