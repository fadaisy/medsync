"use client";

import type { Journey } from "@/lib/pharmacy/wards/derive";
import { useState } from "react";

import { ActionDialog, Chip, Chips, Field, inputCls, Stepper, useClientKey } from "@/app/pharmacy/patients/_components/kit";
import { wardNoteAction, wardPickAction } from "@/app/pharmacy/patients/actions";
import { LabButton } from "@/components/tide/work/button";
import { Pill } from "@/components/tide/work/kit";
import { fill, PRW } from "@/content/pharmacy-rework-patients";

const I = PRW.inpatients;
const R = PRW.round;

export interface Source {
  id: string;
  name: string;
  n: number;
}

/** Track one medicine: prescribed → picked → received → given, and what should still be on the ward. */
export function TrackButton({ drug, j, wardHas, picks }: { drug: string; j: Journey; wardHas: number; picks: string[] }) {
  const [open, setOpen] = useState(false);
  const gap = j.left - wardHas;
  const row = (label: string, v: number | string) => (
    <div className="flex justify-between gap-3 py-1.5">
      <dt>{label}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
  return (
    <>
      <LabButton variant="text" size="sm" onClick={() => setOpen(true)}>
        {I.track}
      </LabButton>
      <ActionDialog open={open} onOpenChange={setOpen} title={fill(I.trackTitle, { med: drug })}>
        <ol className="text-body-s flex flex-col gap-1.5">
          <li>✓ {I.steps.prescribed}</li>
          <li>
            {j.picked ? "✓" : "○"} {I.steps.picked}
            {j.imprest ? ` · ${I.imprest}` : !j.picked ? ` · ${I.notPicked}` : ""}
            {picks.map((p) => (
              <span key={p} className="text-muted-foreground block pl-4">
                {p}
              </span>
            ))}
          </li>
          <li>
            {j.recv ? "✓" : "○"} {I.steps.received}
            {j.onway > 0 ? ` · ${j.onway} ${I.onTheWay}` : ""}
          </li>
          <li>
            {j.given ? "✓" : "○"} {I.steps.given} ·{" "}
            {j.total ? fill(I.givenOf, { n: j.given, total: j.total }) : fill(I.givenCount, { n: j.given })}
          </li>
        </ol>
        <dl className="divide-border text-body-s divide-y">
          {row(I.bal.picked, j.picked)}
          {row(I.bal.received, j.recv)}
          {row(I.bal.given, j.given)}
          {row(I.bal.left, j.left)}
          {row(I.bal.wardHas, wardHas)}
        </dl>
        {gap > 0 ? <Pill tone="caution">{fill(I.unaccounted, { has: wardHas, gap })}</Pill> : null}
        <p className="text-caption text-muted-foreground">{I.dosesNote}</p>
      </ActionDialog>
    </>
  );
}

/** Pick one patient's medicine and send it to the ward: the next 24 h, the rest of the course, or a stepped number. */
export function PickButton({
  wardId,
  rxId,
  drug,
  next24,
  rest,
  sources,
}: {
  wardId: string;
  rxId: string;
  drug: string;
  next24: number;
  rest: number | null;
  sources: Source[];
}) {
  const [open, setOpen] = useState(false);
  const key = useClientKey(open);
  const [qty, setQty] = useState<number | null>(next24 || null);
  const [from, setFrom] = useState<string | null>(sources[0]?.id ?? null);
  const max = sources.find((s) => s.id === from)?.n;
  return (
    <>
      <LabButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {I.pickTitle}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={fill(I.pickFor, { med: drug, who: "" }).trim()}
        submit={I.pickSend}
        blocked={!sources.length ? I.noSource : !from ? I.from : !qty ? I.quantity : null}
        foot={I.dosesNote}
        run={() => wardPickAction({ clientKey: key, wardId, fromId: from, windowH: null, lines: [{ rxId, quantity: qty }] })}
      >
        {sources.length ? (
          <Field label={I.from}>
            <Chips label={I.from}>
              {sources.map((s) => (
                <Chip key={s.id} on={from === s.id} onClick={() => setFrom(s.id)}>
                  {s.name} · {s.n}
                </Chip>
              ))}
            </Chips>
          </Field>
        ) : (
          <p className="text-body-s">{I.noSource}</p>
        )}
        <Chips label={I.quantity}>
          {next24 ? (
            <Chip on={qty === next24} onClick={() => setQty(next24)}>
              {fill(I.next24, { n: next24 })}
            </Chip>
          ) : null}
          {rest ? (
            <Chip on={qty === rest} onClick={() => setQty(rest)}>
              {fill(I.restOfCourse, { n: rest })}
            </Chip>
          ) : null}
        </Chips>
        <Stepper label={I.quantity} value={qty} onChange={setQty} max={max} />
      </ActionDialog>
    </>
  );
}

export function NoteButton({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  return (
    <>
      <LabButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {I.noteAdd}
      </LabButton>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={I.notes}
        submit={I.noteAdd}
        blocked={body.trim().length < 2 ? I.notePlaceholder : null}
        run={() => wardNoteAction({ patientId, body })}
      >
        <textarea
          aria-label={I.notes}
          placeholder={I.notePlaceholder}
          maxLength={500}
          rows={4}
          className={`${inputCls} h-auto py-2`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </ActionDialog>
    </>
  );
}

export interface RoundLine {
  medicineId: string;
  drug: string;
  need: number;
  have: number;
  pick: number;
  placeHas: number;
  pts: { rxId: string; who: string; n: number; pick: number }[];
}

/** The round's pick list: tick each line as it is picked, then send one issue to the ward. */
export function RoundList({
  wardId,
  ward,
  fromId,
  fromName,
  windowH,
  lines,
}: {
  wardId: string;
  ward: string;
  fromId: string | null;
  fromName: string;
  windowH: 12 | 24 | 48;
  lines: RoundLine[];
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const key = useClientKey(open);
  const toPick = lines.filter((l) => l.pick > 0);
  // What can be sent: each patient's share, while the pick place still holds it.
  const send = toPick.flatMap((l) => {
    let left = l.placeHas;
    return l.pts.flatMap((p) => {
      const q = Math.min(p.pick, left);
      left -= q;
      return q > 0 ? [{ rxId: p.rxId, quantity: q }] : [];
    });
  });
  const short = toPick.filter((l) => l.placeHas < l.pick).map((l) => l.drug);
  if (!lines.length) return <p className="text-body-s text-muted-foreground">{R.noDoses}</p>;
  if (!toPick.length) return <p className="text-body-s text-muted-foreground">{R.nothing}</p>;
  const all = toPick.every((l) => ticked.has(l.medicineId));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-s tabular-nums">{fill(R.progress, { n: ticked.size, total: toPick.length })}</span>
        <LabButton variant="text" size="sm" onClick={() => setTicked(new Set(toPick.map((l) => l.medicineId)))}>
          {R.tickAll}
        </LabButton>
        <LabButton variant="secondary" size="sm" className="print:hidden" onClick={() => window.print()}>
          {R.print}
        </LabButton>
      </div>
      {short.length ? <Pill tone="caution">{fill(R.short, { place: fromName, meds: short.join(", ") })}</Pill> : null}
      <table className="hidden w-full text-[13.5px] sm:table">
        <thead className="text-muted-foreground text-left text-[12.5px]">
          <tr>
            <th className="py-2 font-medium" />
            <th className="py-2 font-medium">{R.medicine}</th>
            <th className="py-2 font-medium">{R.patientsCol}</th>
            <th className="py-2 text-right font-medium">{R.needed}</th>
            <th className="py-2 text-right font-medium">{R.onWard}</th>
            <th className="py-2 text-right font-medium">{R.toPick}</th>
            <th className="py-2 text-right font-medium">{R.place}</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {toPick.map((l) => (
            <tr key={l.medicineId}>
              <td className="py-1">
                <Tick on={ticked.has(l.medicineId)} label={fill(R.tick, { med: l.drug })} onClick={() => setTicked(flip(ticked, l.medicineId))} />
              </td>
              <td className="py-2 font-medium">{l.drug}</td>
              <td className="text-body-s py-2">{l.pts.map((p) => `${p.who} × ${p.n}`).join(" · ")}</td>
              <td className="py-2 text-right tabular-nums">{l.need}</td>
              <td className="py-2 text-right tabular-nums">{l.have}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{l.pick}</td>
              <td className="py-2 text-right tabular-nums">{l.placeHas}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-border flex flex-col divide-y sm:hidden">
        {toPick.map((l) => (
          <li key={l.medicineId} className="flex items-start gap-2 py-2">
            <Tick on={ticked.has(l.medicineId)} label={fill(R.tick, { med: l.drug })} onClick={() => setTicked(flip(ticked, l.medicineId))} />
            <div className="flex flex-col">
              <span className="font-medium">
                {l.drug} · {R.toPick} {l.pick}
              </span>
              <span className="text-body-s text-muted-foreground">{l.pts.map((p) => `${p.who} × ${p.n}`).join(" · ")}</span>
              <span className="text-caption text-muted-foreground tabular-nums">
                {R.needed} {l.need} · {R.onWard} {l.have} · {R.place} {l.placeHas}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {all ? <p className="text-body-s">{R.allPicked}</p> : null}
      <div>
        <LabButton
          variant="primary"
          disabledReason={!fromId ? R.choosePlace : !send.length ? R.nothing : null}
          onClick={() => setOpen(true)}
        >
          {fill(R.send, { ward })}
        </LabButton>
      </div>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={fill(R.send, { ward })}
        sub={fill(R.windowLabel, { h: windowH })}
        submit={fill(R.send, { ward })}
        run={() => wardPickAction({ clientKey: key, wardId, fromId, windowH, lines: send })}
      >
        <p className="text-body-s">{R.hint}</p>
      </ActionDialog>
    </div>
  );
}

const flip = (s: Set<string>, k: string) => {
  const n = new Set(s);
  if (!n.delete(k)) n.add(k);
  return n;
};

function Tick({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="focus-visible:shadow-focus grid size-11 place-items-center rounded-full outline-none"
    >
      <span
        className={`grid size-5 place-items-center rounded-[5px] text-[12px] ${on ? "bg-tide-navy-900 text-tide-on-band" : "shadow-[inset_0_0_0_1.5px_var(--color-ink-400)]"}`}
      >
        {on ? "✓" : ""}
      </span>
    </button>
  );
}
