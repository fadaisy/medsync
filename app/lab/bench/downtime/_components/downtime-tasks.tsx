"use client";

import { useState } from "react";

import { LabButton } from "@/components/tide/work/button";
import { Pill } from "@/components/tide/work/kit";
import { Input } from "@/components/ui/input";
import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_DOWNTIME } from "@/content/lab-workspace-v2-downtime";
import {
  recordDrillAction,
  recordPeriodAction,
  reserveFormsAction,
} from "@/lib/lab/downtime-actions";
import { localValue } from "@/lib/lab/field-kit";
import { DateField, DateTimeField, NumberStepper, PickField } from "../../../_components/v2/fields";
import { Said, useAct } from "../../../setup/criticals/_components/setup-forms";

const D = LABWS2_DOWNTIME;
const FIELD = "min-h-9 rounded-tide-field";

function TextField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label text-foreground">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        className={FIELD}
      />
    </label>
  );
}

/**
 * Record a downtime (DT-1, unchanged): `recordPeriodAction` records a downtime that has ended, so "Still down"
 * holds the button with its reason until the end is given. Starting a downtime defaults to now (5.14).
 */
export function RecordDowntime({ now }: { now: string }) {
  const { pending, message, act } = useAct();
  const [startsAt, setStartsAt] = useState(() => localValue(new Date(now)));
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("network");
  const [note, setNote] = useState("");
  const why = !startsAt
    ? D.record.whyStart
    : !endsAt
      ? D.record.whyStillDown
      : endsAt < startsAt
        ? D.record.whyOrder
        : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <DateTimeField label={D.record.started} value={startsAt} onChange={setStartsAt} now={now} />
        <div className="flex flex-col gap-1.5">
          <DateTimeField
            label={D.record.ended}
            hint={D.record.endedHint}
            value={endsAt}
            onChange={setEndsAt}
            now={now}
            min={startsAt || undefined}
          />
          {endsAt ? null : <Pill tone="caution">{D.record.stillDown}</Pill>}
        </div>
        <PickField
          label={D.record.cause}
          options={(["network", "power", "system", "other"] as const).map((k) => ({
            value: k,
            label: D.causes[k]!,
          }))}
          value={reason}
          onChange={setReason}
        />
        <TextField label={D.record.note} value={note} onChange={setNote} max={500} />
      </div>
      <div>
        <LabButton
          type="button"
          variant="primary"
          busy={pending}
          disabledReason={why}
          onClick={() =>
            act(
              () =>
                recordPeriodAction({
                  startsAt: new Date(startsAt).toISOString(),
                  endsAt: new Date(endsAt).toISOString(),
                  reason,
                  note: note.trim() || null,
                }),
              D.record.done,
            )
          }
        >
          {D.record.record}
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}

/** Print blank forms (DT-2, unchanged): reserves the numbers on the server, then opens the sheets to print. */
export function PrintBlankForms() {
  const { pending, message, act } = useAct();
  const [count, setCount] = useState(10);
  return (
    <div className="flex flex-col gap-4">
      <NumberStepper
        label={D.print.howMany}
        value={count}
        onChange={setCount}
        min={1}
        max={200}
        effect={(n) => (n === 1 ? D.print.effectOne : fill(D.print.effect, { n }))}
      />
      <div>
        <LabButton
          type="button"
          variant="primary"
          busy={pending}
          onClick={() =>
            act(async () => {
              const r = await reserveFormsAction({ count });
              // A full load: the refresh after success would cancel a client-side push.
              if (r.ok)
                window.location.assign(
                  `/lab/bench/downtime/print?from=${r.data!.numbers[0]}&to=${r.data!.numbers.at(-1)}`,
                );
              return r;
            }, D.print.done)
          }
        >
          {D.print.print}
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}

/** A drill (DT-8, unchanged) writes a drill record and nothing else. */
export function RecordDrill({ now }: { now: string }) {
  const { pending, message, act } = useAct();
  const [heldOn, setHeldOn] = useState("");
  const [participants, setParticipants] = useState("");
  const [what, setWhat] = useState("");
  const [problems, setProblems] = useState("");
  const why = !heldOn
    ? D.drills.whyDay
    : participants.trim().length < 2
      ? D.drills.whyWho
      : what.trim().length < 3
        ? D.drills.whatWhy
        : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <DateField label={D.drills.heldOn} value={heldOn} onChange={setHeldOn} now={now} />
        <TextField label={D.drills.who} value={participants} onChange={setParticipants} max={500} />
        <TextField label={D.drills.what} value={what} onChange={setWhat} max={1000} />
        <TextField label={D.drills.problems} value={problems} onChange={setProblems} max={1000} />
      </div>
      <div>
        <LabButton
          type="button"
          variant="primary"
          busy={pending}
          disabledReason={why}
          onClick={() =>
            act(
              () =>
                recordDrillAction({
                  heldOn,
                  participants,
                  whatWasDone: what,
                  problems: problems.trim() || null,
                }),
              D.drills.done,
            )
          }
        >
          {D.drills.record}
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}
