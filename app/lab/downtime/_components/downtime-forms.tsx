"use client";

import { useState } from "react";

import { LabButton } from "@/components/tide/work/button";
import { Input } from "@/components/ui/input";
import { LABWS2_DOWNTIME } from "@/content/lab-workspace-v2-downtime";
import {
  recordDrillAction,
  recordPeriodAction,
  reserveFormsAction,
} from "@/lib/lab/downtime-actions";
import { DateField, DateTimeField } from "../../_components/v2/fields";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

const selectClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 rounded-sm border px-2 outline-none sm:min-h-9";

/** Print blank forms (DT-2): reserves the numbers on the server, then opens the sheets to print. */
export function PrintForms() {
  const { pending, message, act } = useAct();
  const [count, setCount] = useState("10");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="How many forms">
          <Input
            name="count"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            inputMode="numeric"
            className="min-h-11 w-24 tabular-nums sm:min-h-9"
          />
        </Field>
        <LabButton
          type="button"
          busy={pending}
          onClick={() =>
            act(async () => {
              const r = await reserveFormsAction({ count: Number(count) });
              // A full load: the form's refresh after success would cancel a client-side push.
              if (r.ok)
                window.location.assign(
                  `/lab/downtime/print?from=${r.data!.numbers[0]}&to=${r.data!.numbers.at(-1)}`,
                );
              return r;
            }, "Numbers reserved. Opening the forms to print.")
          }
        >
          Print blank forms
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}

/** DT-1: a record of when the system was down, entered afterwards. */
export function RecordDowntime() {
  const { pending, message, act } = useAct();
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("network");
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-4">
        <DateTimeField label="Started" name="startsAt" value={startsAt} onChange={setStartsAt} />
        <DateTimeField
          label="Ended"
          name="endsAt"
          value={endsAt}
          onChange={setEndsAt}
          min={startsAt || undefined}
        />
        <Field label="Reason">
          <select
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={selectClass}
          >
            <option value="network">Network</option>
            <option value="power">Power</option>
            <option value="system">System</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Note (optional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="min-h-11 sm:min-h-9"
          />
        </Field>
      </div>
      <div>
        <LabButton
          type="button"
          busy={pending}
          disabledReason={
            !startsAt
              ? LABWS2_DOWNTIME.record.whyStart
              : !endsAt
                ? LABWS2_DOWNTIME.record.whyStillDown
                : null
          }
          onClick={() =>
            act(
              () =>
                recordPeriodAction({
                  startsAt: new Date(startsAt).toISOString(),
                  endsAt: new Date(endsAt).toISOString(),
                  reason,
                  note: note.trim() || null,
                }),
              "Downtime recorded.",
            )
          }
        >
          Record the downtime
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}

/** DT-8: a drill writes a drill record and nothing else. */
export function RecordDrill() {
  const { pending, message, act } = useAct();
  const [heldOn, setHeldOn] = useState("");
  const [participants, setParticipants] = useState("");
  const [what, setWhat] = useState("");
  const [problems, setProblems] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField label="Held on" value={heldOn} onChange={setHeldOn} />
        <Field label="Who took part">
          <Input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            maxLength={500}
            className="min-h-11 sm:min-h-9"
          />
        </Field>
        <Field label="What was done">
          <Input
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            maxLength={1000}
            className="min-h-11 sm:min-h-9"
          />
        </Field>
        <Field label="Problems found (optional)">
          <Input
            value={problems}
            onChange={(e) => setProblems(e.target.value)}
            maxLength={1000}
            className="min-h-11 sm:min-h-9"
          />
        </Field>
      </div>
      <div>
        <LabButton
          type="button"
          busy={pending}
          disabledReason={!heldOn ? LABWS2_DOWNTIME.drills.whyDay : null}
          onClick={() =>
            act(
              () =>
                recordDrillAction({
                  heldOn,
                  participants,
                  whatWasDone: what,
                  problems: problems.trim() || null,
                }),
              "Drill recorded.",
            )
          }
        >
          Record the drill
        </LabButton>
      </div>
      <Said message={message} />
    </div>
  );
}
