"use client";

import { useState } from "react";

import { ActionDialog, Chip, Chips, Field, Stepper, useClientKey } from "@/app/pharmacy/patients/_components/kit";
import { opCheckInAction, opPillCountAction } from "@/app/pharmacy/patients/actions";
import { LabButton } from "@/components/tide/work/button";
import { Pill } from "@/components/tide/work/kit";
import { fill, PRW, RULES } from "@/content/pharmacy-rework-patients";

const O = PRW.outpatients;

/** Refill: the pill count (or "didn't bring them"), then the hand-over in Dispense. */
export function RefillButton({
  rxId,
  med,
  since,
  daily,
  expectLeft,
  should,
  lastQty,
}: {
  rxId: string;
  med: string;
  since: number;
  daily: number;
  expectLeft: number;
  should: number;
  lastQty: number;
}) {
  const [open, setOpen] = useState(false);
  const key = useClientKey(open);
  const [back, setBack] = useState<number | null>(null);
  const [none, setNone] = useState(false);
  const taken = back == null ? null : lastQty - back;
  const pct = taken == null || !should ? null : Math.max(0, Math.min(100, Math.round((taken / should) * 100)));
  return (
    <>
      <LabButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {O.refill}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={fill(O.refillTitle, { med })}
        submit={O.saveCount}
        blocked={back == null && !none ? O.broughtBack : null}
        foot={O.countSaved}
        run={() => opPillCountAction({ clientKey: key, rxId, back: none ? null : back })}
      >
        <p className="text-body-s">
          {fill(O.expectLeft, { days: since, daily: Math.round(daily * 10) / 10, left: Math.round(expectLeft) })}
        </p>
        <Field label={O.broughtBack}>
          <div className="flex flex-wrap items-center gap-3">
            <Stepper
              label={O.broughtBack}
              value={none ? null : back}
              onChange={(v) => {
                setNone(false);
                setBack(v);
              }}
              max={lastQty}
            />
            <Chip
              on={none}
              onClick={() => {
                setNone(!none);
                setBack(null);
              }}
            >
              {O.didNotBring}
            </Chip>
          </div>
        </Field>
        {pct != null ? (
          <div className="flex flex-col gap-1">
            <span className="text-body-s tabular-nums">
              {fill(O.pctLine, { taken: taken!, should })} · {pct}%
            </span>
            {pct < RULES.adherenceLow ? (
              <Pill tone="caution">{O.low}</Pill>
            ) : pct < RULES.adherenceGood ? (
              <Pill>{O.mid}</Pill>
            ) : (
              <Pill tone="passed">{O.good}</Pill>
            )}
          </div>
        ) : null}
      </ActionDialog>
    </>
  );
}

/** Course check-in: how, how it is going, missed doses and side effects. */
export function CheckInButton({ rxId, med }: { rxId: string; med: string }) {
  const [open, setOpen] = useState(false);
  const key = useClientKey(open);
  const [how, setHow] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [missed, setMissed] = useState<number | null>(0);
  const [se, setSe] = useState<string[]>([]);
  return (
    <>
      <LabButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {O.checkIn}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={fill(O.checkInTitle, { med })}
        submit={O.checkIn}
        blocked={!how ? O.howWord : !status ? O.goingWord : null}
        run={() =>
          opCheckInAction({ clientKey: key, rxId, how, status, missed: status === "taking" ? 0 : (missed ?? 0), sideEffects: se })
        }
      >
        <Field label={O.howWord}>
          <Chips label={O.howWord}>
            {Object.entries(O.how).map(([k, l]) => (
              <Chip key={k} on={how === k} onClick={() => setHow(k)}>
                {l}
              </Chip>
            ))}
          </Chips>
        </Field>
        <Field label={O.goingWord}>
          <Chips label={O.goingWord}>
            {Object.entries(O.status_).map(([k, l]) => (
              <Chip key={k} on={status === k} onClick={() => setStatus(k)}>
                {l}
              </Chip>
            ))}
          </Chips>
        </Field>
        {status === "missed_some" ? (
          <>
            <Field label={O.missedDoses}>
              <Stepper label={O.missedDoses} value={missed} onChange={setMissed} max={200} />
            </Field>
            <p className="text-body-s">{O.missedNote}</p>
          </>
        ) : null}
        {status === "stopped" ? <Pill tone="caution">{O.stoppedNote}</Pill> : null}
        <Field label={O.sideEffects}>
          <Chips label={O.sideEffects}>
            {O.se.map((s) => (
              <Chip
                key={s}
                on={se.includes(s)}
                onClick={() => setSe((x) => (s === "None" ? ["None"] : x.includes(s) ? x.filter((y) => y !== s) : [...x.filter((y) => y !== "None"), s]))}
              >
                {s}
              </Chip>
            ))}
          </Chips>
        </Field>
        {se.includes("Rash") ? <Pill tone="caution">{O.rash}</Pill> : null}
      </ActionDialog>
    </>
  );
}
