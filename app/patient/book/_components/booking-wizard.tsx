"use client";

import type {
  BookingDraft,
  ClinicianOption,
  ElsewhereOption,
  LineOption,
  SessionOption,
} from "../_lib/booking";
import type { BookingReceipt, BookInput } from "../actions";
import type { PatientReasonCode } from "@/supabase/functions/_shared/sessions-sql";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { TintedRow } from "@/app/patient/_components/tinted-row";
import { BottomActionBar, BottomActionBarSpacer } from "@/components/responsive/bottom-action-bar";
import { StepWizardShell } from "@/components/responsive/step-wizard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatArrivalWindow,
  formatFullDate,
  formatShortDate,
  formatTime,
} from "@/lib/patient/booking-format";
import { cn } from "@/lib/utils";
import {
  accessAlternatives,
  draftKey,
  firstOpenDay,
  INTERSTITIAL,
  INTERSTITIAL_REASON,
  MODE_LABEL,
  parseDraft,
  REASONS,
  splitDays,
  splitSessions,
  windowEndMs,
} from "../_lib/booking";
import { bookAppointmentAction } from "../actions";

/**
 * "Ask for a day — the clinic confirms" over three capacity modes (ADR 0088).
 *
 * One decision per screen (PRD §6.3), one POST at the end, and nothing
 * between here and the request touches the network — §2 prices a chatty
 * flow in shillings. The steps are React state, not the URL: a chip that
 * navigated would cost a document fetch per tap and lose the note typed two
 * screens ago. What survives a lost connection instead is the draft, kept in
 * localStorage per hospital and cleared on success (PRD §3.3.2 "resumable").
 *
 *   reason → (interstitial, when the reason is a new problem)
 *          → clinic (the lines that take this reason, with their mode)
 *          → the pick: clinician + day + time, or a clinic day
 *          → check → the receipt.
 *
 * No clinical question anywhere in this file, and none may be added: a
 * reason is an administrative word, the interstitial asks nothing, and the
 * note's example is about logistics (PRD §7.2 rule 1).
 */

type StepId = "reason" | "emergency" | "line" | "pick" | "check";

interface BookingWizardProps {
  hospitalId: string;
  hospitalName: string;
  emergencyPhone: string | null;
  /** Only lines with something to pick — the page filters before we see them. */
  lines: ReadonlyArray<LineOption>;
  /** The page's clock, so "within the window" is judged once, on the server's instant. */
  nowIso: string;
  /** "YYYY-MM-DD" today in the hospital's zone — never the device's. */
  todayIso: string;
}

/**
 * The wizard reads its draft from localStorage in a lazy initialiser, which
 * must not run during hydration (the server rendered no draft). So the shell
 * mounts only once the client owns the tree — `useSyncExternalStore` with a
 * server snapshot of `false` is the idiom the announcement bar uses.
 */
const subscribeNoop = () => () => {};
export function BookingWizard(props: BookingWizardProps) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  if (!mounted) {
    return (
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6" aria-busy>
        <Skeleton className="h-1 w-full" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }
  return <Wizard {...props} />;
}

function freshDraft(): BookingDraft {
  return {
    v: 1,
    reason: null,
    reasonNote: "",
    interstitialSeen: false,
    lineId: null,
    clinicianUserId: null,
    dateIso: "",
    slotStartsAtIso: null,
    sessionId: null,
    appointmentType: "in_person",
    idempotencyKey: crypto.randomUUID(),
  };
}

function readDraft(hospitalId: string): BookingDraft | null {
  try {
    return parseDraft(window.localStorage.getItem(draftKey(hospitalId)));
  } catch {
    return null;
  }
}

function writeDraft(hospitalId: string, draft: BookingDraft | null) {
  try {
    if (draft) window.localStorage.setItem(draftKey(hospitalId), JSON.stringify(draft));
    else window.localStorage.removeItem(draftKey(hospitalId));
  } catch {
    /* a private window; the draft simply does not survive a reload */
  }
}

/** Where a restored draft left off — the first step it cannot skip. */
function resumeStep(d: BookingDraft, lines: ReadonlyArray<LineOption>): StepId {
  if (!d.reason) return "reason";
  if (d.reason === INTERSTITIAL_REASON && !d.interstitialSeen) return "emergency";
  const line = lines.find((l) => l.id === d.lineId && l.reasonCodes.includes(d.reason as string));
  if (!line) return "line";
  return "pick";
}

function Wizard({
  hospitalId,
  hospitalName,
  emergencyPhone,
  lines,
  nowIso,
  todayIso,
}: BookingWizardProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<BookingDraft>(() => readDraft(hospitalId) ?? freshDraft());
  const [stepId, setStepId] = useState<StepId>(() => resumeStep(draft, lines));
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nowMs = new Date(nowIso).getTime();

  // Every change is a new attempt: the key is minted here and reused only
  // by a retry of the same, unchanged pick (ADR 0088).
  const update = (patch: Partial<BookingDraft>) => {
    const next = { ...draft, ...patch, idempotencyKey: crypto.randomUUID() };
    setDraft(next);
    writeDraft(hospitalId, next);
    setError(null);
  };

  const reason = draft.reason;
  const eligible = reason ? lines.filter((l) => l.reasonCodes.includes(reason)) : [];
  const line = eligible.find((l) => l.id === draft.lineId) ?? null;
  const clinician =
    line?.clinicians.find((c) => c.userId === draft.clinicianUserId) ?? line?.clinicians[0] ?? null;
  const slot =
    clinician?.slotsByDate[draft.dateIso]?.find((s) => s.startsAtIso === draft.slotStartsAtIso) ??
    null;
  const session = line?.sessions.find((s) => s.id === draft.sessionId) ?? null;
  const picked = line?.capacityMode === "session" ? session !== null : slot !== null;

  const steps: ReadonlyArray<{ id: StepId; label: string }> = [
    { id: "reason", label: "Reason" },
    ...(reason === INTERSTITIAL_REASON
      ? [{ id: "emergency" as const, label: "Before you book" }]
      : []),
    { id: "line", label: "Clinic" },
    { id: "pick", label: line?.capacityMode === "session" ? "Clinic day" : "Day and time" },
    { id: "check", label: "Check" },
  ];
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === stepId),
  );
  const goTo = (delta: 1 | -1) => {
    const next = steps[index + delta];
    if (next) setStepId(next.id);
  };
  const canAdvance =
    stepId === "reason"
      ? reason !== null
      : stepId === "emergency"
        ? true
        : stepId === "line"
          ? line !== null
          : picked;

  const submit = () => {
    if (!line || !reason || !picked) return;
    const input: BookInput = {
      reason,
      reason_note: draft.reasonNote || undefined,
      idempotency_key: draft.idempotencyKey,
      ...(line.capacityMode === "session" && session
        ? { session: { session_id: session.id } }
        : clinician && slot
          ? {
              slot: {
                clinician_user_id: clinician.userId,
                department_id: line.departmentId,
                service_line_id: line.id,
                starts_at: slot.startsAtIso,
                ends_at: slot.endsAtIso,
                type: draft.appointmentType,
              },
            }
          : {}),
    };
    setError(null);
    startTransition(async () => {
      const res = await bookAppointmentAction(input);
      if (res.ok) {
        writeDraft(hospitalId, null);
        setReceipt(res.receipt);
        return;
      }
      setError(res.error);
      // A full day or a slot that was just taken: the page re-derives the
      // offer and the wizard keeps every pick that is still on it.
      if (res.status === 409 || res.status === 404) router.refresh();
    });
  };

  if (receipt && line) {
    return (
      <Receipt
        receipt={receipt}
        line={line}
        hospitalName={hospitalName}
        whenIso={session?.startsAtIso ?? slot?.startsAtIso ?? nowIso}
        mode={line.capacityMode === "session" ? "session" : "slot"}
      />
    );
  }

  const titles: Record<StepId, { title: string; description?: string }> = {
    reason: { title: "Why are you coming?", description: "Pick the one that fits best." },
    emergency: { title: INTERSTITIAL.title },
    line: {
      title: "Which clinic?",
      description: `The clinics at ${hospitalName} that take this reason.`,
    },
    pick: {
      title: line?.capacityMode === "session" ? "Which clinic day?" : "Which day and time?",
      description: "Choose from the days the clinic has open.",
    },
    check: { title: "Check this before you ask" },
  };

  return (
    <StepWizardShell
      steps={steps}
      currentStepIndex={index}
      onBack={index > 0 ? () => goTo(-1) : undefined}
      title={titles[stepId].title}
      description={titles[stepId].description}
    >
      {stepId === "reason" ? (
        <ReasonStep
          reason={reason}
          note={draft.reasonNote}
          onReason={(value) => update({ reason: value, interstitialSeen: false, lineId: null })}
          onNote={(reasonNote) => update({ reasonNote })}
        />
      ) : null}

      {stepId === "emergency" ? (
        <Interstitial hospitalName={hospitalName} emergencyPhone={emergencyPhone} />
      ) : null}

      {stepId === "line" ? (
        <LineStep
          lines={eligible}
          hospitalName={hospitalName}
          lineId={line?.id ?? null}
          onPick={(id) =>
            update({
              lineId: id,
              clinicianUserId: null,
              dateIso: "",
              slotStartsAtIso: null,
              sessionId: null,
            })
          }
        />
      ) : null}

      {stepId === "pick" && line ? (
        line.capacityMode === "session" ? (
          <SessionStep
            line={line}
            sessionId={session?.id ?? null}
            nowMs={nowMs}
            onPick={(sessionId) => update({ sessionId })}
          />
        ) : (
          <SlotStep
            line={line}
            clinician={clinician}
            dateIso={draft.dateIso}
            slotStartsAtIso={slot?.startsAtIso ?? null}
            appointmentType={draft.appointmentType}
            nowMs={nowMs}
            todayIso={todayIso}
            onClinician={(userId) => {
              const next = line.clinicians.find((c) => c.userId === userId);
              update({
                clinicianUserId: userId,
                dateIso: next ? (firstOpenDay(next) ?? "") : "",
                slotStartsAtIso: null,
              });
            }}
            onDate={(dateIso) => update({ dateIso, slotStartsAtIso: null })}
            onSlot={(slotStartsAtIso) => update({ slotStartsAtIso })}
            onType={(appointmentType) => update({ appointmentType })}
          />
        )
      ) : null}

      {stepId === "check" && line ? (
        <CheckStep
          line={line}
          hospitalName={hospitalName}
          clinician={clinician}
          session={session}
          whenIso={session?.startsAtIso ?? slot?.startsAtIso ?? null}
          reason={reason}
          reasonNote={draft.reasonNote}
          appointmentType={draft.appointmentType}
        />
      ) : null}

      <BottomActionBar>
        <div className="flex w-full flex-col items-end gap-2">
          {error ? (
            <p role="alert" className="text-status-caution-fg text-body-s w-full">
              {error}
            </p>
          ) : null}
          {stepId === "check" ? (
            <Button
              type="button"
              size="lg"
              disabled={!picked || pending}
              onClick={submit}
              className="w-full md:w-auto"
            >
              {pending
                ? "Sending…"
                : line?.capacityMode === "session"
                  ? "Book a place"
                  : clinician?.autoConfirm
                    ? "Confirm this time"
                    : "Ask for this time"}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              disabled={!canAdvance}
              onClick={() => {
                if (stepId === "emergency") update({ interstitialSeen: true });
                goTo(1);
              }}
              className="w-full md:w-auto"
            >
              {stepId === "emergency" ? INTERSTITIAL.dismiss : "Continue"}
            </Button>
          )}
        </div>
      </BottomActionBar>
      <BottomActionBarSpacer />
    </StepWizardShell>
  );
}

/* ─── Steps ───────────────────────────────────────────────────────── */

function ReasonStep({
  reason,
  note,
  onReason,
  onNote,
}: {
  reason: PatientReasonCode | null;
  note: string;
  onReason: (v: PatientReasonCode) => void;
  onNote: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ChoiceList name="reason" value={reason} onChange={onReason} options={REASONS} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reason-note" className="text-foreground text-body-s font-medium">
          Add a note for the clinic{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="reason-note"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. I was told to come back once my results were in."
          className="border-input text-foreground placeholder:text-muted-foreground focus-visible:shadow-focus bg-card text-body-m min-h-20 resize-y rounded-lg border px-3 py-2 outline-none"
        />
        <p className="text-muted-foreground text-caption tabular">{note.length} / 500</p>
      </div>
    </div>
  );
}

/**
 * PRD §2.5's interstitial. Static: it asks nothing, reads nothing, branches
 * nowhere. Amber ring, not red — red is a clinician's declaration, and the
 * words carry the weight. The Call control is the hospital's own number,
 * verified at activation, and absent until then.
 */
function Interstitial({
  hospitalName,
  emergencyPhone,
}: {
  hospitalName: string;
  emergencyPhone: string | null;
}) {
  const phone = emergencyPhone?.trim();
  const dialable = phone && /\d/.test(phone) ? phone : null;
  return (
    <div className="bg-card ring-status-caution-fg/40 flex flex-col gap-4 rounded-xl p-5 shadow-xs ring-1">
      <p className="text-foreground text-body-l leading-relaxed">{INTERSTITIAL.body}</p>
      {dialable ? (
        <a
          href={`tel:${dialable.replace(/[^\d+]/g, "")}`}
          className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-fit")}
        >
          Call <span className="tabular font-mono">{dialable}</span>
          <span className="sr-only">, {hospitalName}</span>
        </a>
      ) : null}
    </div>
  );
}

function LineStep({
  lines,
  hospitalName,
  lineId,
  onPick,
}: {
  lines: ReadonlyArray<LineOption>;
  hospitalName: string;
  lineId: string | null;
  onPick: (id: string) => void;
}) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-body-s leading-relaxed">
          No clinic at {hospitalName} takes this reason on MedSync yet. You can still be seen —
          going to the hospital does not depend on this app.
        </p>
        <Link href="/patient/queue" className={cn(buttonVariants({ size: "lg" }), "w-fit")}>
          Coming to the hospital today
        </Link>
      </div>
    );
  }
  const pickable = lines.filter((l) => l.capacityMode !== "open_queue");
  const queues = lines.filter((l) => l.capacityMode === "open_queue");
  return (
    <div className="flex flex-col gap-4">
      {pickable.length > 0 ? (
        <ChoiceList
          name="line"
          value={lineId}
          onChange={onPick}
          options={pickable.map((l) => ({
            value: l.id,
            title: l.name,
            hint: l.departmentName,
            trailing: <Pill tone="neutral">{MODE_LABEL[l.capacityMode]}</Pill>,
          }))}
        />
      ) : null}
      {/* A same-day queue is a door, not a pick: it leads to the walk-in
          page, which already knows how to save a place in line. */}
      {queues.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {queues.map((l) => (
            <TintedRow
              key={l.id}
              tint="brand"
              iconKey="hospital"
              title={l.name}
              subtitle={`${l.departmentName} · ${MODE_LABEL.open_queue}`}
              href="/patient/queue"
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SlotStep({
  line,
  clinician,
  dateIso,
  slotStartsAtIso,
  appointmentType,
  nowMs,
  todayIso,
  onClinician,
  onDate,
  onSlot,
  onType,
}: {
  line: LineOption;
  clinician: ClinicianOption | null;
  dateIso: string;
  slotStartsAtIso: string | null;
  appointmentType: "in_person" | "virtual";
  nowMs: number;
  todayIso: string;
  onClinician: (userId: string) => void;
  onDate: (dateIso: string) => void;
  onSlot: (startsAtIso: string) => void;
  onType: (t: "in_person" | "virtual") => void;
}) {
  if (!clinician) {
    return <p className="text-muted-foreground text-body-s">Go back and choose a clinic.</p>;
  }
  const endMs = windowEndMs(nowMs, line.timeToCareDays);
  const { within, beyond } = splitDays(clinician, endMs);
  const alternatives = accessAlternatives(line, clinician, nowMs);
  const times = clinician.slotsByDate[dateIso] ?? [];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-body-s leading-relaxed">
        This day is with <span className="text-foreground font-medium">{clinician.fullName}</span>{" "}
        in {line.departmentName}.
        {clinician.seenBefore ? (
          <>
            {" "}
            <Pill tone="stable">Seen you before</Pill>
          </>
        ) : null}
      </p>

      {line.clinicians.length > 1 ? (
        <details>
          <summary className="text-primary text-body-s min-h-11 cursor-pointer py-3 underline-offset-4 hover:underline">
            Choose a different clinician
          </summary>
          <ChoiceList
            name="clinician"
            value={clinician.userId}
            onChange={onClinician}
            options={line.clinicians.map((c) => ({
              value: c.userId,
              title: c.fullName,
              hint: c.seenBefore ? "Seen you before" : line.departmentName,
            }))}
          />
        </details>
      ) : null}

      {alternatives ? (
        <Alternatives
          line={line}
          otherClinicians={alternatives.otherClinicians}
          elsewhere={alternatives.elsewhere}
          onClinician={onClinician}
        />
      ) : null}

      {within.length > 0 ? (
        <DayChips
          label="Choose a day"
          days={within}
          dateIso={dateIso}
          todayIso={todayIso}
          onDate={onDate}
        />
      ) : null}
      {beyond.length > 0 ? (
        <DayChips
          label={`Beyond this clinic's target of ${line.timeToCareDays} days`}
          days={beyond}
          dateIso={dateIso}
          todayIso={todayIso}
          onDate={onDate}
        />
      ) : null}

      {dateIso ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-foreground text-body-s font-medium">Choose a time</h3>
            <span className="text-muted-foreground text-caption font-mono tabular-nums">
              {times.length} {times.length === 1 ? "time" : "times"}
            </span>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Times">
            {times.map((t) => (
              <li key={t.startsAtIso}>
                <Chip
                  selected={t.startsAtIso === slotStartsAtIso}
                  onSelect={() => onSlot(t.startsAtIso)}
                >
                  {formatTime(t.startsAtIso)}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {clinician.allowVirtual ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-foreground text-body-s font-medium">How do you want to be seen?</h3>
          <ChoiceList
            name="visit-type"
            value={appointmentType}
            onChange={onType}
            options={[
              {
                value: "in_person",
                title: "Come to the clinic",
                hint: "You travel to the hospital.",
              },
              {
                value: "virtual",
                title: "Video or phone",
                hint: "Instead of travelling to the clinic.",
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

function SessionStep({
  line,
  sessionId,
  nowMs,
  onPick,
}: {
  line: LineOption;
  sessionId: string | null;
  nowMs: number;
  onPick: (id: string) => void;
}) {
  const endMs = windowEndMs(nowMs, line.timeToCareDays);
  const { within, beyond } = splitSessions(line.sessions, endMs);
  const alternatives = accessAlternatives(line, null, nowMs);
  const toOption = (s: SessionOption): Choice<string> => ({
    value: s.id,
    title: formatFullDate(s.startsAtIso),
    hint: [s.clinicianName ?? "Clinic team", s.venue].filter(Boolean).join(" · "),
    disabled: s.placesLeft === 0,
    trailing:
      s.placesLeft === 0 ? (
        <Pill tone="neutral">Full</Pill>
      ) : (
        <span className="text-muted-foreground text-body-s whitespace-nowrap tabular-nums">
          {s.placesLeft} {s.placesLeft === 1 ? "place" : "places"} left
        </span>
      ),
  });

  return (
    <div className="flex flex-col gap-5">
      {alternatives ? (
        <Alternatives line={line} otherClinicians={[]} elsewhere={alternatives.elsewhere} />
      ) : null}
      {within.length > 0 ? (
        <ChoiceList
          name="session"
          value={sessionId}
          onChange={onPick}
          options={within.map(toOption)}
        />
      ) : null}
      {beyond.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-foreground text-body-s font-medium">
            Beyond this clinic&rsquo;s target of {line.timeToCareDays} days
          </h3>
          <ChoiceList
            name="session"
            value={sessionId}
            onChange={onPick}
            options={beyond.map(toOption)}
          />
        </div>
      ) : null}
      {/* PRD §2.2: stated at the pick and again on the receipt. */}
      <p className="text-muted-foreground text-body-s leading-relaxed">
        A clinic day gives you a position and a time to arrive by, not an exact time. Arriving early
        does not change your position.
      </p>
    </div>
  );
}

/**
 * PRD §2.4, in its order, shown only when nothing falls inside the line's
 * own target: another clinician here, the same clinic elsewhere, the
 * same-day queue. The beyond-target days follow, labelled, in the step.
 */
function Alternatives({
  line,
  otherClinicians,
  elsewhere,
  onClinician,
}: {
  line: LineOption;
  otherClinicians: ReadonlyArray<ClinicianOption>;
  elsewhere: ReadonlyArray<ElsewhereOption>;
  onClinician?: (userId: string) => void;
}) {
  return (
    <section
      aria-label="Sooner options"
      className="bg-card dark:shadow-card flex flex-col gap-3 rounded-xl p-4 shadow-xs"
    >
      <p className="text-foreground text-body-s leading-relaxed">
        Nothing is open within this clinic&rsquo;s target of {line.timeToCareDays} days. Sooner
        options, in order:
      </p>
      <ol className="flex flex-col gap-2">
        {otherClinicians.map((c) => (
          <li key={c.userId}>
            <button
              type="button"
              onClick={() => onClinician?.(c.userId)}
              className="tap bg-accent text-accent-foreground text-body-s flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-4 text-left"
            >
              <span>
                <span className="font-medium">{c.fullName}</span> has a day open sooner
              </span>
              <span aria-hidden>→</span>
            </button>
          </li>
        ))}
        {elsewhere.map((h) => (
          <li key={h.hospitalId}>
            <Link
              href={`/patient/hospitals?q=${encodeURIComponent(line.name)}`}
              className="tap bg-accent text-accent-foreground text-body-s flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-4"
            >
              <span>
                <span className="font-medium">{line.name}</span> at {h.hospitalName}
                {h.region ? ` (${h.region})` : ""} has days open
              </span>
              <span aria-hidden>→</span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/patient/queue"
            className="tap bg-accent text-accent-foreground text-body-s flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-4"
          >
            <span className="font-medium">Coming to the hospital today</span>
            <span aria-hidden>→</span>
          </Link>
        </li>
      </ol>
    </section>
  );
}

function CheckStep({
  line,
  hospitalName,
  clinician,
  session,
  whenIso,
  reason,
  reasonNote,
  appointmentType,
}: {
  line: LineOption;
  hospitalName: string;
  clinician: ClinicianOption | null;
  session: SessionOption | null;
  whenIso: string | null;
  reason: PatientReasonCode | null;
  reasonNote: string;
  appointmentType: "in_person" | "virtual";
}) {
  if (!whenIso || !reason) {
    return (
      <p className="text-muted-foreground text-body-s">Go back and fill in what is missing.</p>
    );
  }
  const isSession = line.capacityMode === "session";
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        <TintedRow
          tint="brand"
          iconKey="user"
          title={
            isSession ? (session?.clinicianName ?? "Clinic team") : (clinician?.fullName ?? "")
          }
          subtitle={`${line.name} · ${hospitalName}`}
        />
        <TintedRow
          tint="mint"
          iconKey="calendar"
          title={formatFullDate(whenIso)}
          subtitle={isSession ? "Clinic day — a position, not an exact time" : formatTime(whenIso)}
        />
        <TintedRow
          tint="teal"
          iconKey="activity"
          title={REASONS.find((r) => r.value === reason)?.title ?? reason}
          subtitle={appointmentType === "virtual" ? "Video or phone" : "At the clinic"}
        />
      </ul>

      {reasonNote ? (
        <div className="bg-card dark:shadow-card flex flex-col gap-1 rounded-xl p-4 shadow-xs">
          <span className="text-overline text-muted-foreground">Your note</span>
          <p className="text-foreground text-body-s leading-relaxed">{reasonNote}</p>
        </div>
      ) : null}

      <p className="text-muted-foreground text-body-s leading-relaxed">
        {isSession
          ? "Your place is confirmed as soon as you book. You will get a code to show at the desk."
          : clinician?.autoConfirm
            ? "This time is yours as soon as you ask. You will find it under Visits."
            : "The clinic decides whether it can take this time. You will find the answer under Visits."}
      </p>
    </div>
  );
}

/**
 * The confirmation (PRD §3.3.2, §6.3): the code and the position big and
 * monospaced — they are read aloud to a relative and shown at a desk — and
 * the date in full. Screenshot-friendly: everything on one card.
 */
function Receipt({
  receipt,
  line,
  hospitalName,
  whenIso,
  mode,
}: {
  receipt: BookingReceipt;
  line: LineOption;
  hospitalName: string;
  whenIso: string;
  mode: "session" | "slot";
}) {
  const confirmed = receipt.status === "confirmed";
  const window =
    receipt.arrival_window_start && receipt.arrival_window_end
      ? formatArrivalWindow(receipt.arrival_window_start, receipt.arrival_window_end)
      : null;
  return (
    <section
      aria-labelledby="receipt-title"
      className="ncd-reveal mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6"
    >
      <div className="flex flex-col gap-2">
        <span
          aria-hidden
          className="bg-accent text-accent-foreground grid size-12 place-items-center rounded-full"
        >
          <CheckIcon className="size-6" strokeWidth={1.5} />
        </span>
        <p className="text-overline text-muted-foreground">{hospitalName}</p>
        <h1
          id="receipt-title"
          className="font-display text-foreground text-heading-m leading-tight font-medium tracking-[-0.015em]"
        >
          {mode === "session"
            ? "Your place is booked"
            : confirmed
              ? "This time is yours"
              : "We asked the clinic for this time"}
        </h1>
        <p className="text-muted-foreground text-body-s">
          {line.name} · {formatFullDate(whenIso)}
          {mode === "slot" ? ` · ${formatTime(whenIso)}` : ""}
        </p>
      </div>

      <dl className="bg-card dark:shadow-card flex flex-col gap-5 rounded-xl p-5 shadow-xs">
        {receipt.booking_code ? (
          <div className="flex flex-col gap-1">
            <dt className="text-overline text-muted-foreground">Booking code</dt>
            <dd className="text-foreground text-display-s font-mono tracking-[0.12em]">
              {receipt.booking_code}
            </dd>
          </div>
        ) : null}
        {mode === "session" && receipt.position_number !== null ? (
          <div className="flex flex-col gap-1">
            <dt className="text-overline text-muted-foreground">Your position</dt>
            <dd className="text-foreground text-display-s font-mono tabular-nums">
              {receipt.position_number}
            </dd>
          </div>
        ) : null}
        {window ? (
          <div className="flex flex-col gap-1">
            <dt className="text-overline text-muted-foreground">{formatFullDate(whenIso)}</dt>
            <dd className="text-foreground text-body-m">
              Arrive between {window}. Arriving early does not change your position.
            </dd>
          </div>
        ) : null}
        {receipt.booking_code ? (
          <p className="text-muted-foreground text-body-s leading-relaxed">
            Show this at the desk. A text message with the same code will follow.
          </p>
        ) : null}
      </dl>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/patient/appointments"
          className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
        >
          Your visits
        </Link>
        <Link
          href="/patient"
          className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full sm:w-auto")}
        >
          Home
        </Link>
      </div>
    </section>
  );
}

/* ─── Pieces ──────────────────────────────────────────────────────── */

interface Choice<T extends string> {
  value: T;
  title: string;
  hint?: string;
  disabled?: boolean;
  trailing?: ReactNode;
}

/**
 * Pick one of a short list. A real `<input type="radio">` rather than a
 * pressed button: arrow-key traversal, a single tab stop and an announced
 * selected state for no code — and the dot is a non-colour signal, so the
 * tint beside it never carries the state alone.
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
                "tap has-[:focus-visible]:shadow-focus flex min-h-16 items-start gap-3 rounded-xl px-4 py-3",
                o.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                selected ? "bg-accent" : "bg-card dark:shadow-card shadow-xs",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="accent-brand-500 mt-1 size-4 shrink-0 outline-none"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-foreground text-body-m font-medium">{o.title}</span>
                {o.hint ? (
                  <span className="text-muted-foreground text-body-s">{o.hint}</span>
                ) : null}
              </span>
              {o.trailing ? <span className="mt-0.5 shrink-0">{o.trailing}</span> : null}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({
  selected,
  onSelect,
  children,
  ariaLabel,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        "tap text-body-s min-h-11 rounded-lg px-3 tabular-nums",
        selected
          ? "bg-primary text-primary-foreground font-medium"
          : "bg-card text-muted-foreground dark:shadow-card shadow-xs",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A flat list of the days the clinic has open, not an `<input type="date">`:
 * on a low-end Android WebView that degrades to a typed yyyy-mm-dd field,
 * and date entry with low-literacy users is the largest hole in the
 * research. Full dates are always in the accessible name (PRD §6.3).
 */
function DayChips({
  label,
  days,
  dateIso,
  todayIso,
  onDate,
}: {
  label: string;
  days: ReadonlyArray<string>;
  dateIso: string;
  todayIso: string;
  onDate: (iso: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-foreground text-body-s font-medium">{label}</h3>
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {days.map((iso) => {
          // Noon UTC of the civil day keeps the label on that day in every zone.
          const day = new Date(`${iso}T12:00:00Z`);
          const relative = iso === todayIso ? "Today" : null;
          return (
            <li key={iso}>
              <Chip
                selected={iso === dateIso}
                onSelect={() => onDate(iso)}
                ariaLabel={
                  relative
                    ? `${relative}, ${formatFullDate(day.toISOString())}`
                    : formatFullDate(day.toISOString())
                }
              >
                {relative ?? formatShortDate(day.toISOString())}
              </Chip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
