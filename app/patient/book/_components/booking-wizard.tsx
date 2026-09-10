"use client";

import type { BookActionState } from "../actions";
import type { ClinicianOption } from "../page";
import { useActionState, useMemo, useState } from "react";
import { CheckIcon, ClockIcon, StethoscopeIcon, UserIcon } from "lucide-react";

import { BottomActionBar, BottomActionBarSpacer } from "@/components/responsive/bottom-action-bar";
import { StepWizardShell } from "@/components/responsive/step-wizard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bookAppointmentAction } from "../actions";

/**
 * Patient booking wizard — the responsive primitives' first real
 * consumer.
 *
 * One decision per screen on mobile (StepWizardShell handles chrome);
 * the same single-step-at-a-time on desktop with more breathing room.
 * Primary CTA pinned to BottomActionBar — thumb-reachable on phones,
 * in-flow on desktop.
 *
 * State stays in this component (not URL) because the wizard is a
 * single transactional decision; a refresh restarts it cleanly.
 *
 * Steps:
 *   1. Reason  — pick why (radio cards) + optional note.
 *   2. Clinician — pick a clinician (grouped by department).
 *   3. Slot     — pick a date, then a time slot.
 *   4. Confirm  — review + submit.
 */

type Step = 0 | 1 | 2 | 3;

const STEPS = [
  { id: "reason", label: "Reason" },
  { id: "clinician", label: "Clinician" },
  { id: "slot", label: "Time" },
  { id: "confirm", label: "Confirm" },
] as const;

const REASONS: ReadonlyArray<{
  value: ReasonValue;
  title: string;
  hint: string;
}> = [
  { value: "follow_up", title: "Follow-up", hint: "A continuation of care from a previous visit." },
  {
    value: "new_concern",
    title: "New concern",
    hint: "Something you'd like the clinician to look at fresh.",
  },
  { value: "refill", title: "Prescription refill", hint: "A medication review or refill." },
  { value: "routine", title: "Routine check-up", hint: "Regular monitoring, not problem-driven." },
  { value: "other", title: "Something else", hint: "Use the note field to tell the clinician." },
];

type ReasonValue = "follow_up" | "new_concern" | "refill" | "routine" | "urgent_review" | "other";

interface BookingWizardProps {
  clinicians: ReadonlyArray<ClinicianOption>;
  hospitalId: string;
  hospitalName: string;
}

interface Slot {
  startsAtIso: string;
  endsAtIso: string;
  label: string;
}

export function BookingWizard({ clinicians, hospitalName }: BookingWizardProps) {
  const [step, setStep] = useState<Step>(0);

  // Wizard state.
  const [reason, setReason] = useState<ReasonValue | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [clinicianKey, setClinicianKey] = useState<string | null>(null);
  // Date as YYYY-MM-DD (local). Slot picker shows times within that day.
  const [dateLocal, setDateLocal] = useState<string>(todayLocalIso());
  const [slot, setSlot] = useState<Slot | null>(null);
  const [appointmentType, setAppointmentType] = useState<"in_person" | "virtual">("in_person");

  const cliniciansByKey = useMemo(
    () => new Map(clinicians.map((c) => [`${c.userId}:${c.departmentId}`, c])),
    [clinicians],
  );
  const cliniciansByDept = useMemo(() => {
    const m = new Map<string, ClinicianOption[]>();
    for (const c of clinicians) {
      const list = m.get(c.departmentName) ?? [];
      list.push(c);
      m.set(c.departmentName, list);
    }
    return m;
  }, [clinicians]);
  const chosenClinician = clinicianKey ? (cliniciansByKey.get(clinicianKey) ?? null) : null;

  const slotsForDay = useMemo(
    () => (chosenClinician ? computeSlotsForDay(chosenClinician, dateLocal) : []),
    [chosenClinician, dateLocal],
  );

  // Reset downstream picks when an upstream pick changes.
  function setStepGoingForward(target: Step) {
    setStep(target);
  }
  function pickClinician(key: string) {
    setClinicianKey(key);
    setSlot(null);
  }
  function pickDate(date: string) {
    setDateLocal(date);
    setSlot(null);
  }

  const canAdvance =
    step === 0 ? !!reason : step === 1 ? !!clinicianKey : step === 2 ? !!slot : true;

  const headerTitle = (
    ["Why are you booking?", "Pick a clinician", "Pick a time", "Review and confirm"] as const
  )[step];
  const headerDescription = (
    [
      `${hospitalName}. Be honest — it helps the clinician prepare.`,
      "Clinicians grouped by department. Tap one to continue.",
      chosenClinician
        ? `${chosenClinician.fullName}'s open times in ${chosenClinician.departmentName}.`
        : "",
      "One last look before we send the request.",
    ] as const
  )[step];

  return (
    <StepWizardShell
      steps={[...STEPS]}
      currentStepIndex={step}
      onBack={step > 0 ? () => setStep((step - 1) as Step) : undefined}
      title={headerTitle}
      description={headerDescription}
    >
      {step === 0 ? (
        <ReasonStep
          value={reason}
          onChange={setReason}
          note={reasonNote}
          onNoteChange={setReasonNote}
        />
      ) : null}

      {step === 1 ? (
        <ClinicianStep
          cliniciansByDept={cliniciansByDept}
          chosenKey={clinicianKey}
          onPick={pickClinician}
        />
      ) : null}

      {step === 2 ? (
        <SlotStep
          clinician={chosenClinician}
          dateLocal={dateLocal}
          onDateChange={pickDate}
          slots={slotsForDay}
          chosenSlot={slot}
          onPick={setSlot}
          appointmentType={appointmentType}
          onTypeChange={setAppointmentType}
        />
      ) : null}

      {step === 3 ? (
        <ConfirmStep
          hospitalName={hospitalName}
          clinician={chosenClinician}
          reason={reason}
          reasonNote={reasonNote}
          slot={slot}
          appointmentType={appointmentType}
        />
      ) : null}

      <BottomActionBarSpacer />

      <BottomActionBar>
        {step < 3 ? (
          <Button
            type="button"
            variant="primary"
            disabled={!canAdvance}
            onClick={() => setStepGoingForward((step + 1) as Step)}
            className="w-full md:ml-auto md:w-auto"
          >
            Continue
          </Button>
        ) : (
          <ConfirmSubmit
            clinician={chosenClinician}
            reason={reason}
            reasonNote={reasonNote}
            slot={slot}
            appointmentType={appointmentType}
          />
        )}
      </BottomActionBar>
    </StepWizardShell>
  );
}

/* ─── Steps ───────────────────────────────────────────────────────── */

function ReasonStep({
  value,
  onChange,
  note,
  onNoteChange,
}: {
  value: ReasonValue | null;
  onChange: (v: ReasonValue) => void;
  note: string;
  onNoteChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {REASONS.map((r) => {
          const selected = value === r.value;
          return (
            <li key={r.value}>
              <button
                type="button"
                onClick={() => onChange(r.value)}
                aria-pressed={selected}
                className={cn(
                  "border-border flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors outline-none",
                  "focus-visible:ring-brand-500/40 focus-visible:ring-2",
                  selected
                    ? "border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-950/30"
                    : "hover:bg-muted/40",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    selected
                      ? "border-brand-600 bg-brand-600 dark:border-brand-400 dark:bg-brand-400"
                      : "border-muted-foreground/40",
                  )}
                >
                  {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-foreground text-[14px] font-medium">{r.title}</span>
                  <span className="text-muted-foreground text-[12.5px] leading-snug">{r.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1.5 pt-2">
        <label htmlFor="reason-note" className="text-foreground text-[12.5px] font-medium">
          Add a note for the clinician{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="reason-note"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. The chest pain comes on after climbing stairs."
          className="border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-brand-500/40 min-h-[80px] resize-y rounded-md border bg-transparent px-3 py-2 text-[14px] leading-relaxed outline-none focus-visible:ring-2"
        />
        <p className="text-muted-foreground text-caption">{note.length} / 500</p>
      </div>
    </div>
  );
}

function ClinicianStep({
  cliniciansByDept,
  chosenKey,
  onPick,
}: {
  cliniciansByDept: Map<string, ClinicianOption[]>;
  chosenKey: string | null;
  onPick: (key: string) => void;
}) {
  const groups = Array.from(cliniciansByDept.entries());
  return (
    <div className="flex flex-col gap-5">
      {groups.map(([deptName, list]) => (
        <section key={deptName} className="flex flex-col gap-2">
          <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
            {deptName}
          </h2>
          <ul className="flex flex-col gap-2">
            {list.map((c) => {
              const key = `${c.userId}:${c.departmentId}`;
              const selected = chosenKey === key;
              const hasOpenSlots = c.bookableBlocks.length > 0;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onPick(key)}
                    aria-pressed={selected}
                    disabled={!hasOpenSlots}
                    className={cn(
                      "border-border flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors outline-none",
                      "focus-visible:ring-brand-500/40 focus-visible:ring-2 disabled:opacity-60",
                      selected
                        ? "border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-950/30"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <span
                      aria-hidden
                      className="bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1"
                    >
                      <StethoscopeIcon className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-foreground text-[14px] font-medium">{c.fullName}</span>
                      <span className="text-muted-foreground text-[12px]">
                        {hasOpenSlots
                          ? c.autoConfirm
                            ? "Auto-confirms requests"
                            : "Confirms manually"
                          : "No bookable hours in the next 2 weeks"}
                      </span>
                    </span>
                    {selected ? (
                      <CheckIcon
                        aria-hidden
                        className="text-brand-600 dark:text-brand-400 size-4"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SlotStep({
  clinician,
  dateLocal,
  onDateChange,
  slots,
  chosenSlot,
  onPick,
  appointmentType,
  onTypeChange,
}: {
  clinician: ClinicianOption | null;
  dateLocal: string;
  onDateChange: (v: string) => void;
  slots: ReadonlyArray<Slot>;
  chosenSlot: Slot | null;
  onPick: (s: Slot) => void;
  appointmentType: "in_person" | "virtual";
  onTypeChange: (v: "in_person" | "virtual") => void;
}) {
  if (!clinician) return null;
  const minDate = todayLocalIso();
  const maxDate = addDaysLocal(13);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slot-date" className="text-foreground text-[12.5px] font-medium">
          Date
        </label>
        <input
          id="slot-date"
          type="date"
          value={dateLocal}
          min={minDate}
          max={maxDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="border-border text-foreground focus-visible:ring-brand-500/40 rounded-md border bg-transparent px-3 py-2 text-[14px] outline-none focus-visible:ring-2"
        />
      </div>

      {clinician.allowVirtual ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-foreground text-[12.5px] font-medium">Type</span>
          <div className="grid grid-cols-2 gap-2">
            <TypeButton
              active={appointmentType === "in_person"}
              onClick={() => onTypeChange("in_person")}
              label="In-person"
              hint="Visit the clinic."
            />
            <TypeButton
              active={appointmentType === "virtual"}
              onClick={() => onTypeChange("virtual")}
              label="Virtual"
              hint="Video / phone — link sent after confirm."
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-foreground text-[12.5px] font-medium">
          <ClockIcon aria-hidden className="-mt-0.5 mr-1 inline size-3.5" />
          Open times
        </span>
        {slots.length === 0 ? (
          <p className="text-muted-foreground border-border bg-card rounded-md border p-3 text-[12.5px]">
            No open times on this day. Try another date — the clinician&apos;s next bookable window
            is shown above.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => {
              const selected = chosenSlot?.startsAtIso === s.startsAtIso;
              return (
                <li key={s.startsAtIso}>
                  <button
                    type="button"
                    onClick={() => onPick(s)}
                    aria-pressed={selected}
                    className={cn(
                      "border-border w-full rounded-md border px-2 py-2 font-mono text-[12.5px] tabular-nums transition-colors outline-none",
                      "focus-visible:ring-brand-500/40 focus-visible:ring-2",
                      selected
                        ? "border-brand-500 bg-brand-500 dark:border-brand-400 dark:bg-brand-400 dark:text-brand-950 text-white"
                        : "hover:bg-muted/40 text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "border-border flex flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors outline-none",
        "focus-visible:ring-brand-500/40 focus-visible:ring-2",
        active
          ? "border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-950/30"
          : "hover:bg-muted/40",
      )}
    >
      <span className="text-foreground text-body-s font-medium">{label}</span>
      <span className="text-muted-foreground text-[11.5px]">{hint}</span>
    </button>
  );
}

function ConfirmStep({
  hospitalName,
  clinician,
  reason,
  reasonNote,
  slot,
  appointmentType,
}: {
  hospitalName: string;
  clinician: ClinicianOption | null;
  reason: ReasonValue | null;
  reasonNote: string;
  slot: Slot | null;
  appointmentType: "in_person" | "virtual";
}) {
  if (!clinician || !slot || !reason) {
    return (
      <p className="text-muted-foreground text-body-s">Go back and fill in any missing pieces.</p>
    );
  }
  const r = REASONS.find((x) => x.value === reason);

  return (
    <div className="flex flex-col gap-4">
      <SummaryRow icon={<StethoscopeIcon className="size-4" aria-hidden />} label="Clinician">
        <span className="text-foreground font-medium">{clinician.fullName}</span>
        <span className="text-muted-foreground text-[12px]">
          {clinician.departmentName} · {hospitalName}
        </span>
      </SummaryRow>

      <SummaryRow icon={<ClockIcon className="size-4" aria-hidden />} label="When">
        <span className="text-foreground font-mono tabular-nums">
          {new Date(slot.startsAtIso).toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        <span className="text-muted-foreground text-[12px]">
          {appointmentType === "virtual" ? "Virtual" : "In-person"} · {clinician.slotMinutes} min
        </span>
      </SummaryRow>

      <SummaryRow icon={<UserIcon className="size-4" aria-hidden />} label="Reason">
        <span className="text-foreground font-medium">{r?.title}</span>
        {reasonNote ? (
          <span className="text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5 text-[12.5px] italic">
            &ldquo;{reasonNote}&rdquo;
          </span>
        ) : null}
      </SummaryRow>

      <p className="text-muted-foreground border-border bg-muted/30 rounded-md border p-3 text-[12px] leading-relaxed">
        {clinician.autoConfirm
          ? "This clinician auto-confirms requests — you'll see your appointment in your list right away."
          : "Your request will be sent for the clinician's approval. You'll get a notification when they confirm or change it."}
      </p>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card flex items-start gap-3 rounded-xl border p-3.5">
      <span
        aria-hidden
        className="text-muted-foreground mt-0.5 inline-flex size-7 shrink-0 items-center justify-center"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}

function ConfirmSubmit({
  clinician,
  reason,
  reasonNote,
  slot,
  appointmentType,
}: {
  clinician: ClinicianOption | null;
  reason: ReasonValue | null;
  reasonNote: string;
  slot: Slot | null;
  appointmentType: "in_person" | "virtual";
}) {
  const [state, formAction, pending] = useActionState<BookActionState, FormData>(
    bookAppointmentAction,
    {},
  );

  const disabled = !clinician || !slot || !reason || pending;

  return (
    <form action={formAction} className="flex w-full flex-col items-end gap-2">
      {clinician && slot && reason ? (
        <>
          <input type="hidden" name="clinician_user_id" value={clinician.userId} />
          <input type="hidden" name="department_id" value={clinician.departmentId} />
          <input type="hidden" name="reason" value={reason} />
          <input type="hidden" name="reason_note" value={reasonNote} />
          <input type="hidden" name="starts_at" value={slot.startsAtIso} />
          <input type="hidden" name="ends_at" value={slot.endsAtIso} />
          <input type="hidden" name="type" value={appointmentType} />
        </>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={disabled} className="w-full md:w-auto">
        {pending ? "Sending…" : clinician?.autoConfirm ? "Confirm booking" : "Send request"}
      </Button>
    </form>
  );
}

/* ─── Slot derivation ─────────────────────────────────────────────── */

function computeSlotsForDay(clinician: ClinicianOption, dateLocal: string): Slot[] {
  const dayStart = new Date(`${dateLocal}T00:00:00`);
  const dayEnd = new Date(`${dateLocal}T23:59:59`);
  const slotMs = clinician.slotMinutes * 60_000;
  const bufferMs = clinician.bufferMinutes * 60_000;
  const now = Date.now();

  const slots: Slot[] = [];
  for (const block of clinician.bookableBlocks) {
    const blockStart = Math.max(new Date(block.startsAtIso).getTime(), dayStart.getTime());
    const blockEnd = Math.min(new Date(block.endsAtIso).getTime(), dayEnd.getTime());
    if (blockEnd <= blockStart) continue;

    for (let s = blockStart; s + slotMs <= blockEnd; s += slotMs + bufferMs) {
      const e = s + slotMs;
      if (e <= now) continue; // skip past slots
      const startIso = new Date(s).toISOString();
      // Exclude if any live appointment overlaps.
      const taken = clinician.liveAppointments.some((a) => {
        const aS = new Date(a.startsAtIso).getTime();
        const aE = new Date(a.endsAtIso).getTime();
        return s < aE && e > aS;
      });
      if (taken) continue;
      slots.push({
        startsAtIso: startIso,
        endsAtIso: new Date(e).toISOString(),
        label: new Date(s).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }),
      });
    }
  }
  return slots;
}

function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysLocal(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
