"use client";

import type { StoreWorld, TopupRun } from "@/lib/pharmacy/derive/store/types";
import { useState } from "react";

import { PickField } from "@/app/lab/_components/v2/fields";
import { saveTopUpRunAction, sendTopUpRunAction } from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { pillBtn } from "@/components/pharmacy/medicines/shared";
import { FormDialog, inputCls, labelCls } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState } from "@/components/tide/work/kit";
import { SO } from "@/content/pharmacy-store-sendout";
import { fill } from "@/content/pharmacy-workspace-v2";
import { isoWeekday, num } from "@/lib/pharmacy/derive/store/format";
import { runLines } from "@/lib/pharmacy/derive/store/places";
import { medOf, placeName } from "@/lib/pharmacy/derive/store/stock";
import { newKey, useStoreAct, useWitness } from "../shared";
import { CARD, nextRunDay, scheduleDays } from "./parts";

const R = SO.runs;

/** STORE.md §C2: each run brings every line back to its top-up level, less what is on the way. */
export function TopUpRuns({ world: w }: { world: StoreWorld }) {
  const { busy, toast, say, run } = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, say);
  const [editing, setEditing] = useState<TopupRun | "new" | null>(null);
  const today = isoWeekday(w.today);
  const free = w.places.filter((p) => !w.runs.some((r) => r.placeId === p.id));
  const firstDue = w.runs.find(
    (r) =>
      r.weekdays.includes(today) &&
      !r.sentVoucher &&
      runLines(w, r.placeId).some((l) => l.give > 0),
  );

  const send = async (r: TopupRun) => {
    const place = placeName(w, r.placeId);
    const sendable = runLines(w, r.placeId).filter((l) => l.give > 0);
    const cd = sendable.filter((l) => medOf(w, l.medId).controlled);
    const witnessAttestationId = cd.length
      ? await ask(
          fill(R.witness, {
            place,
            lines: cd
              .map((l) => fill(R.witnessLine, { med: medOf(w, l.medId).short, n: num(l.give) }))
              .join(R.witnessJoin),
          }),
        )
      : null;
    if (cd.length && !witnessAttestationId) return;
    run(
      () => sendTopUpRunAction({ clientKey: newKey(), runId: r.id, witnessAttestationId }),
      (d) => fill(R.done, { place, voucher: d.voucher, lines: SO.linesWord(sendable.length) }),
    );
  };

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
          <h2 className="text-heading-m text-foreground m-0">{R.title}</h2>
          <p className="text-body-s text-muted-foreground m-0">{R.note}</p>
        </div>
        {free.length ? <LabButton onClick={() => setEditing("new")}>{R.add}</LabButton> : null}
      </div>
      {w.runs.length ? null : <EmptyState compact title={R.none} />}
      {w.runs.map((r) => {
        const lines = runLines(w, r.placeId);
        const done = r.sentVoucher;
        const due = r.weekdays.includes(today);
        const day = nextRunDay(r.weekdays, w.today);
        const when = fill(R.schedule, {
          days: scheduleDays(r.weekdays),
          at: r.at.slice(0, 5),
        });
        return (
          <div key={r.id} className="border-border flex flex-col gap-2 border-t py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body-s text-foreground font-semibold">
                  {placeName(w, r.placeId)}
                </span>
                <span className="text-caption text-muted-foreground">
                  {due ? fill(R.whenDue, { when }) : fill(R.whenNext, { when, day })}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Tag>
                  {done ? fill(R.sentOn, { voucher: done }) : due ? R.due : fill(R.next, { day })}
                </Tag>
                <LabButton variant="quiet" size="sm" onClick={() => setEditing(r)}>
                  {R.change}
                </LabButton>
                {!done && lines.some((l) => l.give > 0) ? (
                  <LabButton
                    size="sm"
                    variant={r === firstDue ? "primary" : "secondary"}
                    busy={busy}
                    onClick={() => void send(r)}
                  >
                    {due ? R.sendDue : R.sendEarly}
                  </LabButton>
                ) : null}
              </span>
            </div>
            {done ? null : (
              <span className="flex flex-wrap gap-1.5">
                {lines.length ? (
                  lines.map((l) => {
                    const med = medOf(w, l.medId).short;
                    return (
                      <Chip
                        key={l.medId}
                        tone={l.give === 0 ? "bad" : l.give < l.need ? "warn" : "teal"}
                        className="h-auto py-0.5 whitespace-normal"
                      >
                        {l.give < l.need
                          ? fill(R.lineShort, { med, n: num(l.give), need: num(l.need) })
                          : fill(R.line, { med, n: num(l.give) })}
                      </Chip>
                    );
                  })
                ) : (
                  <Chip tone="ok">{R.atLevels}</Chip>
                )}
              </span>
            )}
          </div>
        );
      })}
      {editing ? (
        <ScheduleDialog
          world={w}
          run={editing === "new" ? null : editing}
          save={run}
          busy={busy}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {toast}
      {dialog}
    </section>
  );
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function ScheduleDialog({
  world: w,
  run: current,
  save,
  busy,
  onClose,
}: {
  world: StoreWorld;
  run: TopupRun | null;
  save: ReturnType<typeof useStoreAct>["run"];
  busy: boolean;
  onClose: () => void;
}) {
  const D = R.dialog;
  const [placeId, setPlaceId] = useState(current?.placeId ?? "");
  const [days, setDays] = useState<number[]>(current ? [...current.weekdays] : []);
  const [at, setAt] = useState(current?.at.slice(0, 5) ?? "");
  const [error, setError] = useState("");
  const free = w.places.filter((p) => !w.runs.some((r) => r.placeId === p.id));

  const submit = () => {
    const problem = !placeId
      ? D.needPlace
      : !days.length
        ? D.needDay
        : !TIME.test(at)
          ? D.badTime
          : "";
    setError(problem);
    if (problem) return;
    save(
      () =>
        saveTopUpRunAction({
          clientKey: newKey(),
          placeId,
          weekdays: [...days].sort((a, b) => a - b),
          at,
        }),
      () => {
        onClose();
        return fill(D.saved, { place: placeName(w, placeId) });
      },
    );
  };

  return (
    <FormDialog
      open
      onClose={onClose}
      title={D.title}
      sub={D.sub}
      error={error}
      submit={D.save}
      onSubmit={submit}
      pending={busy}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {current ? (
          <p className="text-body-s text-foreground m-0 font-semibold">
            {placeName(w, current.placeId)}
          </p>
        ) : (
          <PickField
            label={D.place}
            forceList
            options={free.map((p) => ({ value: p.id, label: p.name }))}
            value={placeId}
            onChange={setPlaceId}
          />
        )}
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{D.time}</span>
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder={D.timeHolder}
            maxLength={5}
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-col gap-1.5" role="group" aria-label={D.days}>
        <span className={labelCls}>{D.days}</span>
        <div className="flex flex-wrap gap-1.5">
          {R.daysShort.map((label, i) => {
            const d = i + 1;
            const on = days.includes(d);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                aria-label={R.days[i]}
                className={pillBtn(on)}
                onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </FormDialog>
  );
}
