"use client";

import type { ReleaseRow } from "@/lib/lab/patient-release-read";
import type { PatientSees } from "@/lib/lab/patient-release-store";
import { useState } from "react";

import { Tag } from "@/components/medsync/tag";
import { Button } from "@/components/ui/button";
import { fill, LAB5 } from "@/content/lab-phase-5";
import {
  holdFromPatientAction,
  recordPatientToldAction,
  releaseHoldAction,
  writeNoteToPatientAction,
} from "@/lib/lab/patient-release-actions";
import { inputClass, newKey, Pop, selectClass } from "../../lab/_components/pop";
import { Field, Said, useAct } from "../../lab/setup/criticals/_components/setup-forms";

const day = (d: Date | string) =>
  new Date(d)
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Kampala" })
    .toUpperCase();

export const seesWords = (s: PatientSees) =>
  s.kind === "held"
    ? fill(LAB5.sees.held, { date: s.until ? day(s.until) : "reviewed" })
    : s.kind === "seen"
      ? fill(LAB5.sees.seen, { date: day(s.at) })
      : LAB5.sees[s.kind];

type Row = ReleaseRow & { name: string; mrn: string };

/**
 * "The patient sees it" (Lab Phase 5 §5.4): what the patient sees for each of my released results and why, with the
 * three clinician acts: "I have spoken to them" for a critical (PR-4), hold with a reason and an until-date (PR-7),
 * and a note to the patient. Centred pop-ups only.
 */
export function PatientRelease({
  rows,
  aged,
  holdMaxDays,
  agedWindowDays,
}: {
  rows: Row[];
  aged: { reportId: string }[];
  holdMaxDays: number | null;
  agedWindowDays: number | null;
}) {
  if (!rows.length && !aged.length) return null;
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-heading-s">The patient sees it</h2>
      {aged.length && agedWindowDays ? (
        <p className="text-body-s">
          {aged.length} {aged.length === 1 ? "result" : "results"}:{" "}
          {fill(LAB5.agedResults, { days: agedWindowDays })}
        </p>
      ) : null}
      <div className="overflow-auto" tabIndex={0} role="region" aria-label="The patient sees it">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">What each patient sees of my released results</caption>
          <thead>
            <tr className="bg-muted">
              {["Patient", "Test", "Released", "The patient sees it", ""].map((h) => (
                <th
                  key={h || "act"}
                  scope="col"
                  className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium"
                >
                  {h || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reportId} className="border-ink-150 border-b last:border-b-0">
                <td className="text-body-s px-3 py-2">
                  {r.name} <span className="text-muted-foreground font-mono">{r.mrn}</span>
                </td>
                <td className="text-body-s px-3 py-2">{r.test}</td>
                <td className="text-body-s px-3 py-2 font-mono">{day(r.issuedAt)}</td>
                <td className="px-3 py-2">
                  <Tag>{seesWords(r.sees)}</Tag>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {r.sees.kind === "after_told" ? <Told r={r} /> : null}
                    {r.sees.kind === "held" ? (
                      <ReleaseHold r={r} />
                    ) : ["when_reviewed", "after_told", "visible"].includes(r.sees.kind) ? (
                      <Hold r={r} max={holdMaxDays} />
                    ) : null}
                    {["visible", "seen", "when_reviewed", "after_told"].includes(r.sees.kind) ? (
                      <Note r={r} />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const base = (r: Row, clientKey: string) => ({
  patientUserId: r.patientUserId,
  reportId: r.reportId,
  surface: "doctor" as const,
  clientKey,
});

function Told({ r }: { r: Row }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState("");
  const [key] = useState(newKey);
  return (
    <Pop
      label="I have spoken to them"
      sr={`${r.test}, ${r.mrn}`}
      title="I have spoken to them"
      lede={LAB5.criticalToPatient}
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending || !how}
          onClick={() =>
            act(async () => {
              const x = await recordPatientToldAction({ ...base(r, key), how, toldAt: new Date() });
              if (x.ok) setOpen(false);
              return x;
            }, "Recorded.")
          }
        >
          Record
        </Button>
      }
    >
      <Field label="How">
        <select className={selectClass} value={how} onChange={(e) => setHow(e.target.value)}>
          <option value="">Choose</option>
          <option value="in_person">In person</option>
          <option value="phone">By phone</option>
          <option value="guardian">With the guardian</option>
        </select>
      </Field>
      <Said message={message} />
    </Pop>
  );
}

function Hold({ r, max }: { r: Row; max: number | null }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [key] = useState(newKey);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const last = max
    ? new Date(Date.parse(today) + max * 86_400_000).toISOString().slice(0, 10)
    : today;
  return (
    <Pop
      label="Hold from the patient"
      sr={`${r.test}, ${r.mrn}`}
      title="Hold from the patient"
      lede={LAB5.holdClinician}
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending || !reason || !until || max === null}
          onClick={() =>
            act(async () => {
              const x = await holdFromPatientAction({ ...base(r, key), reason, untilOn: until });
              if (x.ok) setOpen(false);
              return x;
            }, "Held.")
          }
        >
          Hold
        </Button>
      }
    >
      {max === null ? (
        <p className="text-body-s">The hold limit is not signed, so holds cannot be set yet.</p>
      ) : null}
      <Field label="Reason">
        <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose</option>
          <option value="explain_in_person">I will explain it in person</option>
          <option value="harm_to_patient">Seeing it now could harm the patient</option>
        </select>
      </Field>
      <Field label={max ? `Until (at most ${max} days)` : "Until"}>
        <input
          type="date"
          className={inputClass}
          min={today}
          max={last}
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

function ReleaseHold({ r }: { r: Row }) {
  const { pending, message, act } = useAct();
  const [key] = useState(newKey);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => act(() => releaseHoldAction(base(r, key)), "Released to the patient.")}
      >
        Release hold
      </Button>
      <Said message={message} />
    </div>
  );
}

function Note({ r }: { r: Row }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [key] = useState(newKey);
  return (
    <Pop
      label="Note to patient"
      variant="ghost"
      sr={`${r.test}, ${r.mrn}`}
      title="A note to the patient"
      lede="The patient reads this with the result, in the app."
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending || text.trim().length < 3}
          onClick={() =>
            act(async () => {
              const x = await writeNoteToPatientAction({ ...base(r, key), text });
              if (x.ok) setOpen(false);
              return x;
            }, "Saved.")
          }
        >
          Save
        </Button>
      }
    >
      <Field label="Note">
        <textarea
          className="border-input min-h-24 rounded-md border px-3 py-2"
          maxLength={600}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}
