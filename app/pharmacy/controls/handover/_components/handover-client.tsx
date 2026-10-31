"use client";

import type { HoLine } from "@/lib/pharmacy/handover/derive";
import type { HandoverDraft } from "@/lib/pharmacy/handover/read";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LabButton } from "@/components/tide/work/button";
import { CTL } from "@/content/pharmacy-rework-controls";
import { fill } from "@/content/pharmacy-workspace-v2";
import { shiftsIn } from "@/lib/pharmacy/handover/derive";
import {
  acceptHandoverAction,
  doseContextAction,
  explainMissedAction,
  handOverAction,
  handoverDraftAction,
  resolveDiffAction,
} from "../../actions";
import { Chips, Choice, Dlg, Field, newKey, Stepper, useAct } from "../../_components/kit";

const D = CTL.hoDialog;
const K = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hourCycle: "h23", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const T = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", weekday: "short", day: "numeric" });

export function AcceptButton({ handoverId }: { handoverId: string }) {
  const { pending, error, run } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <LabButton variant="primary" busy={pending} onClick={() => run(() => acceptHandoverAction({ handoverId }))}>
        {CTL.handover.accept}
      </LabButton>
      {error ? <p role="alert" className="text-body-s text-ink-800">{error}</p> : null}
    </div>
  );
}

/** Start the handover of one's own station: who, count together, keys and seal, open items, notes. */
export function StartHandover({ locationId, placeName, slotAt, label }: { locationId: string; placeName: string; slotAt: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LabButton variant="primary" onClick={() => setOpen(true)}>
        {label}
      </LabButton>
      {open ? <HandoverDialog locationId={locationId} placeName={placeName} slotAt={slotAt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function HandoverDialog({ locationId, placeName, slotAt, onClose }: { locationId: string; placeName: string; slotAt: string | null; onClose: () => void }) {
  const [draft, setDraft] = useState<HandoverDraft | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [shown, setShown] = useState(false);
  const [keys, setKeys] = useState(false);
  const [seal, setSeal] = useState<"intact" | "new" | null>(null);
  const [newSeal, setNewSeal] = useState("");
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");
  const [key] = useState(newKey);
  const { pending, error, setError, run } = useAct();
  useEffect(() => {
    void handoverDraftAction({ locationId, at: slotAt ?? new Date().toISOString() }).then(setDraft, () => setError(CTL.common.failed));
  }, [locationId, slotAt, setError]);
  const items = draft?.items ?? [];
  const people = draft?.people ?? [];
  const all = items.every((i) => counts[i.medicineId] != null);
  const diffs = items.filter((i) => counts[i.medicineId] !== i.expected).length;
  const sealNo = seal === "intact" ? draft?.seal ?? null : newSeal.trim() || null;
  const missing = !to
    ? D.missing.who
    : !all
      ? D.missing.count
      : items.length && !shown
        ? D.missing.compare
        : !keys
          ? D.missing.keys
          : draft?.seal && !seal
            ? D.missing.seal
            : seal === "new" && newSeal.trim().length < 2
              ? D.newSeal
              : seen.size < (draft?.open.length ?? 0)
                ? D.missing.items
                : null;
  const toName = people.find((p) => p.userId === to)?.name;
  const at = slotAt ? T.format(new Date(slotAt)) : null;
  return (
    <Dlg
      open
      onOpenChange={(o) => !o && onClose()}
      width="wide"
      title={fill(D.title, { place: placeName })}
      sub={slotAt ? fill(D.subSlot, { out: CTL.handover.shiftShort[Number(at?.slice(0, 2)) === 8 ? "night" : "day"], in: CTL.handover.shiftShort[Number(at?.slice(0, 2)) === 8 ? "day" : "night"], time: at ?? "" }) : D.subMid}
      error={error}
      primary={
        <LabButton
          variant="primary"
          busy={pending}
          disabledReason={draft ? missing : null}
          onClick={() =>
            run(
              () =>
                handOverAction({
                  clientKey: key,
                  locationId,
                  toUserId: to,
                  slotAt,
                  counts: items.map((i) => ({ medicineId: i.medicineId, counted: counts[i.medicineId] ?? 0, highRisk: i.highRisk })),
                  keys: true,
                  sealNo,
                  sealNew: seal === "new",
                  items: draft?.open ?? [],
                  notes: notes.trim() || null,
                }),
              onClose,
            )
          }
        >
          {toName ? fill(D.send, { name: toName }) : D.sendNone}
        </LabButton>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={D.s1}>
          <span className="text-caption text-ink-600">{D.handingHint}</span>
          <span className="text-caption text-ink-600">{fill(D.taking, { when: at ? fill(D.takingFrom, { time: at }) : D.takingNow })}</span>
          {draft && !people.length ? <p className="text-body-s">{D.nobody}</p> : null}
          <Chips>
            {people.map((p) => (
              <Choice key={p.userId} on={to === p.userId} onClick={() => setTo(p.userId)}>
                {p.name}
              </Choice>
            ))}
          </Chips>
          <span className="text-caption text-ink-600">{D.takingHint}</span>
        </Field>
        <Field label={D.s2}>
          <span className="text-caption text-ink-600">{D.s2Hint}</span>
          <ul className="flex flex-col gap-2">
            {items.map((i) => (
              <li key={i.medicineId} className="bg-card shadow-tide-card rounded-tide-row flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-[14px] font-semibold">{i.name}</span>
                  <span className="text-caption text-ink-600">
                    {i.controlled ? D.controlled : D.highRisk} ·{" "}
                    {shown ? (counts[i.medicineId] === i.expected ? CTL.checkDialog.matches : fill(D.ledger, { n: i.expected })) : D.hidden}
                  </span>
                </div>
                <Stepper label={i.name} value={counts[i.medicineId] ?? null} onChange={(n) => !shown && setCounts((c) => ({ ...c, [i.medicineId]: n }))} />
              </li>
            ))}
          </ul>
          {items.length && !shown ? (
            <LabButton size="sm" disabledReason={all ? null : D.missing.count} onClick={() => setShown(true)}>
              {D.compare}
            </LabButton>
          ) : null}
          {shown ? <p className="text-body-s">{diffs ? fill(D.diffs, { n: diffs }) : D.allMatch}</p> : null}
        </Field>
        <Field label={D.s3}>
          <Choice on={keys} onClick={() => setKeys(!keys)}>
            {items.some((i) => i.controlled) ? D.keysCd : D.keysStore}
          </Choice>
          <span className="text-caption text-ink-600">{D.tray}</span>
          <Chips>
            {draft?.seal ? (
              <Choice on={seal === "intact"} onClick={() => setSeal("intact")}>
                {fill(D.sealIntact, { no: draft.seal })}
              </Choice>
            ) : null}
            <Choice on={seal === "new"} onClick={() => setSeal(seal === "new" ? null : "new")}>
              {D.resealed}
            </Choice>
          </Chips>
          {seal === "new" ? (
            <input
              aria-label={D.newSeal}
              placeholder={D.newSeal}
              value={newSeal}
              onChange={(e) => setNewSeal(e.target.value)}
              className="bg-card shadow-tide-card rounded-tide-row h-11 px-3 text-[14px]"
            />
          ) : null}
        </Field>
        <Field label={fill(D.s4, { n: draft?.open.length ?? 0 })}>
          {draft && !draft.open.length ? <p className="text-caption text-ink-600">{fill(D.nothingOpen, { place: placeName })}</p> : null}
          <div className="flex flex-col gap-1.5">
            {(draft?.open ?? []).map((t, n) => (
              <Choice key={n} on={seen.has(n)} onClick={() => setSeen((s) => new Set(s).add(n))}>
                <span className="block">{t}</span>
                <span className="text-caption text-ink-600">{seen.has(n) ? D.seen : D.tapSeen}</span>
              </Choice>
            ))}
          </div>
          {(draft?.open.length ?? 0) > 1 ? (
            <LabButton size="sm" variant="text" onClick={() => setSeen(new Set(draft!.open.map((_, i) => i)))}>
              {D.allSeen}
            </LabButton>
          ) : null}
        </Field>
        <Field label={D.s5}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={D.notesPh}
            rows={3}
            className="bg-card shadow-tide-card rounded-tide-row px-3 py-2 text-[14px]"
          />
        </Field>
      </div>
    </Dlg>
  );
}

type Diff = { kind: "diff"; handoverId: string; placeId: string; placeName: string; line: HoLine; at: string; from: string };
type Miss = { kind: "miss"; placeId: string; slot: number };

/** The one signed action that closes a handover flag: explain a missed slot, or resolve a count. */
export function FlagAction(p: Diff | Miss) {
  const [open, setOpen] = useState(false);
  if (p.kind === "diff" && p.line.controlled)
    return (
      <Link href="/pharmacy/controls/cd?tab=flags" className="inline-flex min-h-11 items-center text-[13.5px] font-medium underline underline-offset-2">
        {CTL.handover.actCd}
      </Link>
    );
  return (
    <>
      <LabButton size="sm" onClick={() => setOpen(true)}>
        {p.kind === "miss" ? CTL.handover.actExplain : CTL.handover.actResolve}
      </LabButton>
      {open && p.kind === "miss" ? <MissDialog placeId={p.placeId} slot={p.slot} onClose={() => setOpen(false)} /> : null}
      {open && p.kind === "diff" ? <DiffDialog d={p} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MissDialog({ placeId, slot, onClose }: { placeId: string; slot: number; onClose: () => void }) {
  const M = CTL.miss;
  const [why, setWhy] = useState<keyof typeof M.reasons | null>(null);
  const [note, setNote] = useState("");
  const { pending, error, run } = useAct();
  const need = why === "not_done" && note.trim().length < 3;
  return (
    <Dlg
      open
      onOpenChange={(o) => !o && onClose()}
      title={M.title}
      sub={K.format(slot)}
      error={error}
      primary={
        <LabButton
          variant="primary"
          busy={pending}
          disabledReason={!why ? M.what : need ? M.noteRequired : null}
          onClick={() =>
            run(() => explainMissedAction({ locationId: placeId, slotAt: new Date(slot).toISOString(), why, note: note.trim() || null }), onClose)
          }
        >
          {M.save}
        </LabButton>
      }
    >
      <Field label={M.what}>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(M.reasons) as (keyof typeof M.reasons)[]).map((k) => (
            <Choice key={k} on={why === k} onClick={() => setWhy(k)}>
              {M.reasons[k]}
            </Choice>
          ))}
        </div>
      </Field>
      <Field label={why === "not_done" ? M.noteRequired : M.note}>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="bg-card shadow-tide-card rounded-tide-row px-3 py-2 text-[14px]" />
      </Field>
      <p className="text-caption text-ink-600">{M.hint}</p>
    </Dlg>
  );
}

type Ctx = Awaited<ReturnType<typeof doseContextAction>>;

function DiffDialog({ d, onClose }: { d: Diff; onClose: () => void }) {
  const X = CTL.diff;
  const diff = d.line.counted - d.line.expected;
  const [how, setHow] = useState<"recount" | "late_entry" | "loss" | "excess" | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [incident, setIncident] = useState("");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [patient, setPatient] = useState<string | null>(null);
  const [by, setBy] = useState<string | null>(null);
  const [shift, setShift] = useState<{ at: number; shift: "day" | "night"; day: number } | null>(null);
  const { pending, error, setError, run } = useAct();
  const shifts = shiftsIn(new Date(d.from).getTime(), new Date(d.at).getTime());
  const pick = (h: typeof how) => {
    setHow(h);
    setWhy(h === "late_entry" ? X.given : null);
    if (h === "late_entry" && !ctx)
      void doseContextAction({ locationId: d.placeId, medicineId: d.line.medicineId, at: d.at }).then(setCtx, () => setError(CTL.common.failed));
  };
  const missing = !how
    ? X.found
    : how === "late_entry"
      ? !patient
        ? X.missing.patient
        : !shift
          ? X.missing.when
          : null
      : !why
        ? X.where
        : (how === "loss" || how === "excess") && incident.trim().length < 3
          ? X.incident
          : null;
  const shiftWord = (s: { shift: "day" | "night"; day: number }) =>
    fill(X.shiftChip, { shift: CTL.handover.shiftShort[s.shift], day: DAY.format(s.day) });
  return (
    <Dlg
      open
      onOpenChange={(o) => !o && onClose()}
      width="wide"
      title={fill(X.title, { med: d.line.medicineName, place: d.placeName })}
      sub={fill(X.sub, { counted: d.line.counted, expected: d.line.expected, when: K.format(new Date(d.at)) })}
      error={error}
      primary={
        <LabButton
          variant="primary"
          busy={pending}
          disabledReason={missing}
          onClick={() =>
            run(
              () =>
                resolveDiffAction({
                  handoverId: d.handoverId,
                  medicineId: d.line.medicineId,
                  how,
                  why,
                  incidentRef: how === "loss" || how === "excess" ? incident.trim() : null,
                  given:
                    how === "late_entry" && patient && shift
                      ? {
                          patient,
                          givenByUserId: by,
                          at: new Date(shift.at).toISOString(),
                          approx: fill(X.approxNote, { shift: shiftWord(shift) }).replace(/^ · /, ""),
                        }
                      : null,
                }),
              onClose,
            )
          }
        >
          {X.save}
        </LabButton>
      }
    >
      <Field label={X.found}>
        <Chips>
          <Choice on={how === "recount"} onClick={() => pick("recount")}>
            {X.recount}
          </Choice>
          {diff < 0 ? (
            <>
              <Choice on={how === "late_entry"} onClick={() => pick("late_entry")}>
                {X.given}
              </Choice>
              <Choice on={how === "loss"} onClick={() => pick("loss")}>
                {X.loss}
              </Choice>
            </>
          ) : (
            <Choice on={how === "excess"} onClick={() => pick("excess")}>
              {X.excess}
            </Choice>
          )}
        </Chips>
      </Field>
      {how === "late_entry" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <p className="text-body-s sm:col-span-3">
            {fill(X.window, { n: -diff, from: K.format(new Date(d.from)), to: K.format(new Date(d.at)) })}
          </p>
          <Field label={X.patient}>
            <div className="flex flex-col gap-1.5">
              {(ctx?.patients ?? []).map((p) => (
                <Choice key={p.userId} on={patient === p.name} onClick={() => setPatient(p.name)}>
                  {p.name}
                </Choice>
              ))}
            </div>
          </Field>
          <Field label={X.givenBy}>
            <div className="flex flex-col gap-1.5">
              {(ctx?.people ?? []).map((p) => (
                <Choice key={p.userId} on={by === p.userId} onClick={() => setBy(by === p.userId ? null : p.userId)}>
                  {p.name}
                </Choice>
              ))}
            </div>
          </Field>
          <Field label={X.when}>
            <div className="flex flex-col gap-1.5">
              {shifts.map((s) => (
                <Choice key={s.at} on={shift?.at === s.at} onClick={() => setShift(s)}>
                  {shiftWord(s)}
                </Choice>
              ))}
            </div>
            <span className="text-caption text-ink-600">{X.approx}</span>
          </Field>
        </div>
      ) : null}
      {how && how !== "late_entry" ? (
        <Field label={X.where}>
          <Chips>
            {(how === "recount" ? X.recountWhy : how === "loss" ? X.lossWhy : X.excessWhy).map((w) => (
              <Choice key={w} on={why === w} onClick={() => setWhy(w)}>
                {w}
              </Choice>
            ))}
          </Chips>
        </Field>
      ) : null}
      {how === "loss" || how === "excess" ? (
        <Field label={X.incident}>
          <input value={incident} onChange={(e) => setIncident(e.target.value)} className="bg-card shadow-tide-card rounded-tide-row h-11 px-3 text-[14px]" />
          <span className="text-caption text-ink-600">{X.inChargeOnly}</span>
        </Field>
      ) : null}
    </Dlg>
  );
}
