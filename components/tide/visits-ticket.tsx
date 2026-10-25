"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { feeText, payLook } from "@patient-core/fees";
import { BuildingIcon, CheckIcon, ChevronRightIcon } from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { VISITS_COPY } from "@/content/patient/visits";
import { cn } from "@/lib/utils";

const T = VISITS_COPY.ticket;

/**
 * The visit ticket (the phone's components/tide/ticket.tsx, kind "day"; ADR 0409): a boarding pass with the
 * hospital, the day and the time large, the details small, the payment strip, a perforation and the stub with
 * the code the desk reads. The whole ticket is one real <button> (prompt §9) with aria-pressed: a click, Enter
 * or Space turns it over (400 ms, the system ease). Under reduced motion it swaps faces without the turn. The
 * face turned away is hidden from screen readers; the button's name reads the visit and the code.
 *
 * Time is "Not promised" for a place in a clinic day (L8); a doctor's slot shows its clock (ADR 0403). No
 * position, no count of people. `fee` left out means the money is not known: no strip, never a guess.
 */
export interface VisitTicketProps {
  hospitalName: string;
  /** "20" */
  day: string;
  /** "TUE · OCT" */
  dayLine: string;
  /** "10:40" for a slot, "Morning" for a clinic day. */
  sessionLine: string;
  /** A doctor's slot has a clock time; a clinic day does not. */
  slot: boolean;
  status: string;
  details: { label: string; value: string }[];
  fee?: number | null;
  feeLabel?: string | null;
  paid?: boolean;
  /** The booking code, or null when the visit has none: the desk then asks. */
  code: string | null;
}

export function VisitTicket(props: VisitTicketProps) {
  const [back, setBack] = useState(false);
  const code = props.code ?? T.askDesk;
  const spoken = props.code ? props.code.split("").join(" ") : T.askDesk;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={back}
        aria-label={T.label(`${props.dayLine} ${props.day}`, props.sessionLine, spoken, back)}
        onClick={() => setBack((b) => !b)}
        className="rounded-pw-card focus-visible:outline-pw-focus block w-full text-left perspective-[1200px] focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <span
          data-ticket-turn
          className={cn(
            "grid transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] transform-3d motion-reduce:transition-none",
            back && "rotate-y-180 motion-reduce:rotate-y-0",
          )}
        >
          <span
            aria-hidden={back}
            className={cn("[grid-area:1/1] backface-hidden", back && "motion-reduce:invisible")}
          >
            <Front {...props} code={code} />
          </span>
          <span
            aria-hidden={!back}
            className={cn(
              "rotate-y-180 [grid-area:1/1] backface-hidden motion-reduce:rotate-y-0",
              !back && "motion-reduce:invisible",
            )}
          >
            <Back {...props} code={code} />
          </span>
        </span>
      </button>
      <p className="text-pw-ink-3 text-center text-[13px] font-medium" aria-hidden>
        {back ? T.tapBack : T.tapFront}
      </p>
    </div>
  );
}

function Shell({ children, stub }: { children: ReactNode; stub?: ReactNode }) {
  return (
    <span className="rounded-pw-card bg-pw-surface shadow-pw-card flex h-full flex-col">
      <span className="flex flex-1 flex-col gap-3.5 px-[18px] pt-4 pb-4">{children}</span>
      {stub ? (
        <>
          <span className="relative block h-0">
            <span className="bg-pw-bg absolute -top-3.5 -left-3.5 size-7 rounded-full" />
            <span className="bg-pw-bg absolute -top-3.5 -right-3.5 size-7 rounded-full" />
          </span>
          <span className="border-pw-line mx-8 block border-t-2 border-dashed" />
          <span className="flex flex-col items-center gap-1.5 px-[18px] pt-4 pb-[18px]">
            {stub}
          </span>
        </>
      ) : null}
    </span>
  );
}

const Rule = () => <span className="bg-pw-line block h-px" />;

function Field({
  label,
  children,
  right,
}: {
  label: string;
  children: ReactNode;
  right?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", right && "items-end text-right")}>
      <span className="text-pw-ink-3 text-[13px] font-medium">{label}</span>
      {children}
    </span>
  );
}

function Front({
  hospitalName,
  day,
  dayLine,
  sessionLine,
  slot,
  status,
  details,
  fee,
  feeLabel,
  paid = false,
  code,
}: VisitTicketProps & { code: string }) {
  const look = fee === undefined ? null : payLook(fee, paid);
  const money = feeLabel ?? feeText(fee ?? null);
  const strip = look
    ? {
        paid: { mark: "✓", disc: "bg-pw-accent-text", title: T.paidTitle(money), line: T.paidLine },
        owed: { mark: "!", disc: "bg-pw-act", title: T.owedTitle(money), line: T.owedLine },
        free: { mark: "–", disc: "bg-pw-ink-4", title: T.freeTitle, line: T.freeLine },
      }[look]
    : null;
  const fields = details.filter((d) => !(slot && d.label === T.time));
  return (
    <Shell
      stub={
        <>
          <span className="font-pw-mono text-[26px] leading-8 font-bold tracking-[0.12em]">
            {code}
          </span>
          <span className="text-pw-accent-text inline-flex items-center gap-1.5 text-[13px] font-medium">
            <CheckIcon className="size-3.5" {...ICON} />
            {T.showAtDesk}
          </span>
        </>
      }
    >
      <span className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-lg font-extrabold tracking-[-0.02em]">
          <ChevronRightIcon className="size-[18px]" strokeWidth={3} aria-hidden />
          {T.brand}
        </span>
        <span className="text-pw-ink-2 text-sm font-semibold">{T.visitTicket}</span>
      </span>
      <span className="flex items-start gap-2">
        <BuildingIcon className="text-pw-ink-2 size-[18px] shrink-0" {...ICON} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">{hospitalName}</span>
          <span className="text-pw-ink-3 text-[13px] font-medium">{status}</span>
        </span>
        {look === "paid" ? (
          <span className="border-pw-accent-text text-pw-accent-text -rotate-[8deg] rounded-md border-2 px-2 text-sm font-extrabold tracking-[0.12em]">
            {T.paid.toUpperCase()}
          </span>
        ) : null}
      </span>
      <Rule />
      <span className="flex justify-between gap-3">
        <Field label={dayLine || T.day}>
          <span className="font-pw-mono text-[30px] leading-[34px] font-bold">{day}</span>
        </Field>
        <Field label={T.time} right>
          <span
            className={cn(
              "text-pw-ink-3 font-bold",
              slot ? "font-pw-mono text-[30px] leading-[34px]" : "text-xl leading-[26px]",
            )}
          >
            {sessionLine}
          </span>
        </Field>
      </span>
      {fields.length ? (
        <>
          <Rule />
          <span className="grid grid-cols-2 gap-3">
            {fields.map((d) => (
              <Field key={d.label} label={d.label}>
                <span className="truncate text-sm font-semibold">{d.value}</span>
              </Field>
            ))}
          </span>
        </>
      ) : null}
      {strip ? (
        <span className="rounded-pw-row bg-pw-surface-2 flex items-center gap-2.5 p-2.5">
          <span
            aria-hidden
            className={cn(
              "text-pw-surface grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold",
              strip.disc,
            )}
          >
            {strip.mark}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-bold">{strip.title}</span>
            <span className="text-pw-ink-2 text-[13px] font-medium">{strip.line}</span>
          </span>
        </span>
      ) : null}
    </Shell>
  );
}

function Back({
  hospitalName,
  day,
  dayLine,
  sessionLine,
  slot,
  code,
}: VisitTicketProps & { code: string }) {
  return (
    <Shell>
      <span className="flex flex-col gap-0.5">
        <span className="text-pw-ink-3 text-xs font-semibold tracking-[0.08em]">
          {T.atHospital}
        </span>
        <span className="text-[17px] font-semibold">{hospitalName}</span>
        <span className="text-pw-ink-2 text-sm">{`${dayLine} ${day} · ${sessionLine}`}</span>
      </span>
      <span className="rounded-pw-row bg-pw-surface-2 flex flex-col items-center gap-1 py-3.5">
        <span className="text-pw-ink-3 text-xs font-semibold tracking-[0.08em]">{T.yourCode}</span>
        <span className="font-pw-mono text-[34px] leading-10 font-bold tracking-[0.15em]">
          {code}
        </span>
        <span className="text-pw-accent-text text-[13px] font-medium">{T.offline}</span>
      </span>
      <span className="flex flex-col gap-2.5">
        {T.steps(slot).map((line, i) => (
          <span key={line} className="flex items-start gap-2.5">
            <span className="bg-pw-act text-pw-on-act grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
              {i + 1}
            </span>
            <span className="text-[15px] leading-[21px] font-medium">{line}</span>
          </span>
        ))}
      </span>
    </Shell>
  );
}
