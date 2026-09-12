"use client";

import type { BookActionState } from "../actions";
import type { ClinicianOption, DaySession, SessionOffer } from "../page";
import { useActionState, useState } from "react";
import { ChevronLeftIcon } from "lucide-react";

import { addDays, fromDayIso, toDayIso } from "@/app/patient/_components/day-strip";
import { TintedRow } from "@/app/patient/_components/tinted-row";
import { BottomActionBar, BottomActionBarSpacer } from "@/components/responsive/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bookAppointmentAction } from "../actions";

/**
 * Door B — "Ask for a day — the clinic confirms" (ADR 0084 §2).
 *
 * Three screens, one decision each, and one POST at the end: §2 prices a
 * chatty flow in shillings, so nothing between here and the request touches
 * the network. The steps are React state rather than the URL for the same
 * reason — a day chip that navigated would cost a full document fetch per tap
 * and would throw away the note the patient typed two screens ago.
 *
 *   1. Why    — pick a reason, add an optional note.
 *   2. Day    — the assigned clinician, the days the clinic has open, and
 *               which half of the day. No clock numerals anywhere (§10).
 *   3. Check  — read it back, then ask.
 *
 * What is deliberately absent, and must stay absent (§12): how many places
 * are left in a session, how many people are looking at it, any countdown,
 * and any estimate of how long the patient will wait. None of those is a
 * number this system holds.
 */

type Step = 0 | 1 | 2;

const STEP_TITLES = [
  "Why are you coming?",
  "Which day?",
  "Check this before you ask",
] as const satisfies readonly string[];

/**
 * ADR 0084 §10. The patient surface names a day-part and never a clock
 * numeral: Luganda and Swahili run a dawn-anchored clock in which "two"
 * denotes 8:00am, so an English AM/PM word leaves the numeral to be re-read
 * against the local convention and "8 in the morning" plausibly parses toward
 * 2pm. A day-part has no numeral to misread.
 */
const SESSION_LABEL: Record<DaySession, string> = {
  morning: "Morning session",
  afternoon: "Afternoon session",
};

/** The one arrival instruction §10 ratifies. It is true of the morning only. */
const SESSION_HINT: Partial<Record<DaySession, string>> = {
  morning: "Come when the clinic opens.",
};

type ReasonValue = "follow_up" | "new_concern" | "refill" | "routine" | "other";

/**
 * `urgent_review` is not here and must not come back (§12). A patient-picked
 * "urgent" is not a triage signal, and it sat one query away from being read
 * as one beside the system-driven `system_urgent` origin.
 */
const REASONS: ReadonlyArray<Choice<ReasonValue>> = [
  { value: "follow_up", title: "Follow-up", hint: "You have been seen for this before." },
  { value: "new_concern", title: "New concern", hint: "Something you want looked at fresh." },
  { value: "refill", title: "Medicine refill", hint: "You need more, or need it reviewed." },
  { value: "routine", title: "Routine check-up", hint: "A regular check, not a new problem." },
  { value: "other", title: "Something else", hint: "Use the note below to say what it is." },
];

const TYPES: ReadonlyArray<Choice<"in_person" | "virtual">> = [
  { value: "in_person", title: "Come to the clinic", hint: "You travel to the hospital." },
  { value: "virtual", title: "Video or phone", hint: "Instead of travelling to the clinic." },
];

const SHORT_DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const LONG_DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

interface BookingWizardProps {
  /** Only clinicians with a day open — the page filters before we see them. */
  clinicians: ReadonlyArray<ClinicianOption>;
  hospitalName: string;
  /** `${userId}:${departmentId}` of the clinician the patient is assigned. */
  defaultKey: string;
  /** "YYYY-MM-DD" today, in the clinic's zone — never the device's. */
  todayIso: string;
}

const keyOf = (c: ClinicianOption) => `${c.userId}:${c.departmentId}`;
const openDays = (c: ClinicianOption) => Object.keys(c.sessionsByDate).sort();

export function BookingWizard({
  clinicians,
  hospitalName,
  defaultKey,
  todayIso,
}: BookingWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [reason, setReason] = useState<ReasonValue | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [clinicianKey, setClinicianKey] = useState(defaultKey);
  const [dateIso, setDateIso] = useState(() => {
    const start = clinicians.find((c) => keyOf(c) === defaultKey) ?? clinicians[0];
    return start ? (openDays(start)[0] ?? "") : "";
  });
  const [session, setSession] = useState<DaySession | null>(null);
  const [appointmentType, setAppointmentType] = useState<"in_person" | "virtual">("in_person");

  const chosen = clinicians.find((c) => keyOf(c) === clinicianKey) ?? clinicians[0];
  if (!chosen) return null;

  const days = openDays(chosen);
  const offers = chosen.sessionsByDate[dateIso] ?? [];
  const offer = offers.find((o) => o.session === session) ?? null;
  const canAdvance = step === 0 ? reason !== null : step === 1 ? offer !== null : true;

  // Changing who it is with changes which days exist, so the picks below it go.
  const pickClinician = (key: string) => {
    setClinicianKey(key);
    setSession(null);
    setDateIso(openDays(clinicians.find((c) => keyOf(c) === key) ?? chosen)[0] ?? "");
  };

  return (
    <section aria-labelledby="ask-step-title" className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 min-h-11"
            onClick={() => setStep((step - 1) as Step)}
          >
            <ChevronLeftIcon aria-hidden strokeWidth={1.5} />
            Back
          </Button>
        ) : null}
        <p className="text-muted-foreground text-caption ml-auto">Step {step + 1} of 3</p>
      </div>

      {/* Live, for the same reason the dose timeline's month heading is: the
          step swaps in place with no navigation, so without this a screen
          reader announces nothing at all when the panel underneath changes.
          Same idiom as `_components/day-strip.tsx`. */}
      <h2
        id="ask-step-title"
        aria-live="polite"
        className="font-display text-foreground text-heading-m font-medium"
      >
        {STEP_TITLES[step]}
      </h2>

      {step === 0 ? (
        <div className="flex flex-col gap-4">
          <ChoiceList name="reason" value={reason} onChange={setReason} options={REASONS} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reason-note" className="text-foreground text-body-s font-medium">
              Add a note for the clinic{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="reason-note"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. The chest pain comes on after climbing stairs."
              className="border-input text-foreground placeholder:text-muted-foreground focus-visible:shadow-focus bg-card text-body-m min-h-20 resize-y rounded-lg border px-3 py-2 outline-none"
            />
            <p className="text-muted-foreground text-caption tabular">{reasonNote.length} / 500</p>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-5">
          {/* §9: stated, not asked. Choosing between two registrars on a
              cover-and-rotate rota is choosing between equivalents, and a
              first-time patient has no basis on which to do it. */}
          <p className="text-muted-foreground text-body-s leading-relaxed">
            This day is with <span className="text-foreground font-medium">{chosen.fullName}</span>{" "}
            in {chosen.departmentName}. The clinic keeps your record either way.
          </p>

          {/* A native <details>, keeping its own triangle: the point of the
              disclosure is that it stays closed for the patient §9 describes
              and stays obvious to the returning one who is looking for it.
              Left at `display: list-item` so the marker survives. */}
          {clinicians.length > 1 ? (
            <details>
              <summary className="text-primary text-body-s min-h-11 cursor-pointer py-3 underline-offset-4 hover:underline">
                I was told to see a particular doctor
              </summary>
              <ChoiceList
                name="doctor"
                value={clinicianKey}
                onChange={pickClinician}
                options={clinicians.map((c) => ({
                  value: keyOf(c),
                  title: c.fullName,
                  hint: c.departmentName,
                }))}
              />
            </details>
          ) : null}

          <div className="flex flex-col gap-2">
            <h3 className="text-foreground text-body-s font-medium">Choose a day</h3>
            {/* §10. Not an <input type="date">: on a low-end Android WebView
                that degrades to a typed yyyy-mm-dd field, and date entry with
                low-literacy users is the single largest hole in the research.
                A flat list of the days the clinic actually has open is the
                shape the HCI4D evidence endorses — and it is less code. */}
            <ul className="flex flex-wrap gap-2">
              {days.map((iso) => (
                <li key={iso}>
                  <DayChip
                    iso={iso}
                    todayIso={todayIso}
                    selected={iso === dateIso}
                    onSelect={() => {
                      setDateIso(iso);
                      setSession(null);
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-foreground text-body-s font-medium">Which part of the day?</h3>
            <ChoiceList
              name="session"
              value={session}
              onChange={setSession}
              options={offers.map((o) => ({
                value: o.session,
                title: SESSION_LABEL[o.session],
                hint: SESSION_HINT[o.session],
              }))}
            />
          </div>

          {chosen.allowVirtual ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-foreground text-body-s font-medium">
                How do you want to be seen?
              </h3>
              <ChoiceList
                name="visit-type"
                value={appointmentType}
                onChange={setAppointmentType}
                options={TYPES}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <CheckStep
          clinician={chosen}
          hospitalName={hospitalName}
          dateIso={dateIso}
          session={session}
          reason={reason}
          reasonNote={reasonNote}
          appointmentType={appointmentType}
        />
      ) : null}

      <BottomActionBar>
        {step < 2 ? (
          <Button
            type="button"
            size="lg"
            disabled={!canAdvance}
            onClick={() => setStep((step + 1) as Step)}
            className="w-full md:ml-auto md:w-auto"
          >
            Continue
          </Button>
        ) : (
          <AskSubmit
            clinician={chosen}
            offer={offer}
            reason={reason}
            reasonNote={reasonNote}
            appointmentType={appointmentType}
          />
        )}
      </BottomActionBar>
      <BottomActionBarSpacer />
    </section>
  );
}

/* ─── Pieces ──────────────────────────────────────────────────────── */

interface Choice<T extends string> {
  value: T;
  title: string;
  hint?: string;
}

/**
 * Pick one of a short list. A real `<input type="radio">` rather than a
 * pressed button: it brings arrow-key traversal, a single tab stop and a
 * selected state a screen reader announces, for no code — and the dot is a
 * non-colour signal, so the tint beside it is never carrying the state alone.
 */
function ChoiceList<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T | null;
  onChange: (v: T) => void;
  options: ReadonlyArray<Choice<T>>;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <li key={o.value}>
            <label
              className={cn(
                "tap has-[:focus-visible]:shadow-focus flex min-h-16 cursor-pointer items-start gap-3 rounded-xl px-4 py-3",
                selected ? "bg-accent" : "bg-card dark:shadow-card shadow-xs",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="accent-brand-500 mt-1 size-4 shrink-0 outline-none"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-foreground text-body-m font-medium">{o.title}</span>
                {o.hint ? (
                  <span className="text-muted-foreground text-body-s">{o.hint}</span>
                ) : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Today / Tomorrow / Thu 18 Sep" — the shape §10 asks for, wearing the day
 * chip the dose timeline already ships (`_components/day-strip.tsx`). It is
 * not that component: the strip is seven contiguous `<Link>`s over a range,
 * and this is a button over a non-contiguous list of the days one clinic has
 * open, inside a form whose other answers a navigation would discard.
 */
function DayChip({
  iso,
  todayIso,
  selected,
  onSelect,
}: {
  iso: string;
  todayIso: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const day = fromDayIso(iso);
  const today = fromDayIso(todayIso);
  const tomorrowIso = today ? toDayIso(addDays(today, 1)) : "";
  const relative = iso === todayIso ? "Today" : iso === tomorrowIso ? "Tomorrow" : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      // "Today" alone does not say which date it is; the long form does, and
      // for a named day the visible label already reads correctly aloud.
      aria-label={relative && day ? `${relative}, ${LONG_DAY_FMT.format(day)}` : undefined}
      className={cn(
        "tap text-body-s min-h-11 rounded-lg px-3",
        selected
          ? "bg-primary text-primary-foreground font-medium"
          : "bg-card text-muted-foreground dark:shadow-card shadow-xs",
      )}
    >
      {relative ?? (day ? SHORT_DAY_FMT.format(day) : iso)}
    </button>
  );
}

function CheckStep({
  clinician,
  hospitalName,
  dateIso,
  session,
  reason,
  reasonNote,
  appointmentType,
}: {
  clinician: ClinicianOption;
  hospitalName: string;
  dateIso: string;
  session: DaySession | null;
  reason: ReasonValue | null;
  reasonNote: string;
  appointmentType: "in_person" | "virtual";
}) {
  const day = fromDayIso(dateIso);
  if (!session || !reason || !day) {
    return (
      <p className="text-muted-foreground text-body-s">Go back and fill in what is missing.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        <TintedRow
          tint="brand"
          iconKey="user"
          title={clinician.fullName}
          subtitle={`${clinician.departmentName} · ${hospitalName}`}
        />
        {/* A date and a day-part. No hour, on the screen most likely to be
            read aloud to somebody else (§10). */}
        <TintedRow
          tint="mint"
          iconKey="calendar"
          title={LONG_DAY_FMT.format(day)}
          subtitle={SESSION_LABEL[session]}
        />
        <TintedRow
          tint="teal"
          iconKey="activity"
          title={REASONS.find((r) => r.value === reason)?.title ?? "Something else"}
          subtitle={appointmentType === "virtual" ? "Video or phone" : "At the clinic"}
        />
      </ul>

      {reasonNote ? (
        <div className="bg-card dark:shadow-card flex flex-col gap-1 rounded-xl p-4 shadow-xs">
          <span className="text-overline text-muted-foreground">Your note</span>
          <p className="text-foreground text-body-s leading-relaxed">{reasonNote}</p>
        </div>
      ) : null}

      {/* §11: no notification is promised, because there is no transport that
          could carry one. What replaces it is where the answer will be. */}
      <p className="text-muted-foreground text-body-s leading-relaxed">
        {clinician.autoConfirm
          ? "This day is yours as soon as you ask. You will find it under Visits."
          : "The clinic decides whether it can take this day. You will find the answer under Visits."}
      </p>
    </div>
  );
}

function AskSubmit({
  clinician,
  offer,
  reason,
  reasonNote,
  appointmentType,
}: {
  clinician: ClinicianOption;
  offer: SessionOffer | null;
  reason: ReasonValue | null;
  reasonNote: string;
  appointmentType: "in_person" | "virtual";
}) {
  const [state, formAction, pending] = useActionState<BookActionState, FormData>(
    bookAppointmentAction,
    {},
  );
  const ready = offer !== null && reason !== null;

  return (
    <form action={formAction} className="flex w-full flex-col items-end gap-2">
      {ready ? (
        <>
          <input type="hidden" name="clinician_user_id" value={clinician.userId} />
          <input type="hidden" name="department_id" value={clinician.departmentId} />
          <input type="hidden" name="reason" value={reason} />
          <input type="hidden" name="reason_note" value={reasonNote} />
          {/* The instant the clinic works to. The patient asked for a session;
              the request still has to name a slot the engine can check. */}
          <input type="hidden" name="starts_at" value={offer.startsAtIso} />
          <input type="hidden" name="ends_at" value={offer.endsAtIso} />
          <input type="hidden" name="type" value={appointmentType} />
        </>
      ) : null}
      {/* Whatever the Edge Function said, word for word. */}
      {state.error ? (
        <p role="alert" className="text-destructive text-body-s">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={!ready || pending} className="w-full md:w-auto">
        {pending ? "Sending…" : clinician.autoConfirm ? "Confirm this day" : "Ask for this day"}
      </Button>
    </form>
  );
}
