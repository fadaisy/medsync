"use client";

import type { FridgeRow, PlacesView } from "@/lib/pharmacy/setup/types";
import { useState } from "react";

import { PickField } from "@/app/lab/_components/v2/fields";
import {
  addFridgeAction,
  linkSensorAction,
  moveFridgeAction,
  recordReadingAction,
  unlinkSensorAction,
} from "@/app/pharmacy/setup/setup-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { FormDialog, inputCls, labelCls, useAct } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PL } from "@/content/pharmacy-setup-places";
import { hhmm, outOfRange, typedDue } from "@/lib/pharmacy/derive/setup/places";
import { clock, dayOf, FRIDGE_TONE, stateOf, Tag } from "./shared";

const NONE = "none";
const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : NaN);

/** The 0–10 °C gauge: red | amber | in range | amber | red, the near band from the signed rule; a word beside it. */
function Gauge({ temp, near, label }: { temp: number; near: number; label: string }) {
  const seg: [number, string][] = [
    [2, "bg-status-critical-bg"],
    [near, "bg-status-caution-bg"],
    [6 - 2 * near, "bg-ink-200"],
    [near, "bg-status-caution-bg"],
    [2, "bg-status-critical-bg"],
  ];
  const pct = Math.max(1, Math.min(99, temp * 10));
  return (
    <div role="img" aria-label={label} className="relative mt-1 h-2 w-full">
      <div className="flex h-2 overflow-hidden rounded-full">
        {seg.map(([w, c], i) => (
          <span key={i} className={c} style={{ width: `${w * 10}%` }} />
        ))}
      </div>
      <span
        aria-hidden
        className="bg-foreground absolute -top-1 h-4 w-1 rounded-sm"
        style={{ left: `calc(${pct}% - 2px)` }}
      />
    </div>
  );
}

/** §B5 Record a reading: time prefilled now, −30 to 40 °C, a note needed outside 2–8 °C (it opens an excursion). */
export function ReadingDialog({
  view: v,
  fridge: f,
  toast,
  onClose,
}: {
  view: PlacesView;
  fridge: FridgeRow | null;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const [pending, run] = useAct(toast);
  const [time, setTime] = useState(() => hhmm(v.nowMin));
  const [temp, setTemp] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const R = PL.reading;
  const t = num(temp);
  const out = !Number.isNaN(t) && outOfRange(t);
  const close = () => (setTemp(""), setNote(""), setErr(""), setTime(hhmm(v.nowMin)), onClose());
  const submit = () => {
    if (!f) return;
    if (!/^\d{2}:\d{2}$/.test(time.trim())) return setErr(R.errTime);
    if (Number.isNaN(t) || t < -30 || t > 40) return setErr(R.errTemp);
    if (out && !note.trim()) return setErr(R.errNote);
    void run(
      () => recordReadingAction({ fridgeId: f.id, time: time.trim(), temp: t, note: note.trim() }),
      () => (out ? R.savedOut(f.code) : R.saved(t, time.trim())),
    ).then((ok) => ok && close());
  };
  return (
    <FormDialog
      open={!!f}
      onClose={close}
      title={f ? R.title(f.code) : ""}
      sub={f ? R.lead(f.name) : undefined}
      error={err}
      submit={R.save}
      onSubmit={submit}
      pending={pending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{R.time}</span>
          <input
            className={inputCls}
            inputMode="numeric"
            value={time}
            onChange={(e) => (setTime(e.target.value), setErr(""))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{R.temp}</span>
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder={R.tempPh}
            value={temp}
            onChange={(e) => (setTemp(e.target.value), setErr(""))}
          />
        </label>
      </div>
      {out ? (
        <p
          role="alert"
          className="bg-status-critical-bg text-status-critical-fg-aa text-body-s rounded-xl px-3 py-2 font-semibold"
        >
          {R.outNote}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>{R.note}</span>
        <input
          className={inputCls}
          placeholder={R.notePh}
          value={note}
          aria-required={out}
          onChange={(e) => (setNote(e.target.value), setErr(""))}
        />
      </label>
    </FormDialog>
  );
}

/** Link a sensor: the sensor ID; the key comes back once and is shown once, to copy into the sensor. */
function SensorDialog({
  fridge: f,
  toast,
  onClose,
}: {
  fridge: FridgeRow | null;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const [pending, run] = useAct(toast);
  const [id, setId] = useState("");
  const [err, setErr] = useState("");
  const [key, setKey] = useState<{ code: string; key: string } | null>(null);
  const S = PL.sensor;
  const close = () => (setId(""), setErr(""), onClose());
  const submit = () => {
    if (!f) return;
    if (!id.trim()) return setErr(S.err);
    void run(
      () => linkSensorAction({ id: f.id, sensorId: id.trim().toUpperCase() }),
      (d: { key?: string | null }) => {
        if (d?.key) setKey({ code: f.code, key: d.key });
        return S.linked;
      },
    ).then((ok) => ok && close());
  };
  return (
    <>
      <FormDialog
        open={!!f}
        onClose={close}
        title={f ? S.title(f.code) : ""}
        sub={S.lead}
        error={err}
        submit={S.save}
        onSubmit={submit}
        pending={pending}
      >
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{S.label}</span>
          <input
            className={inputCls}
            placeholder={S.ph}
            value={id}
            onChange={(e) => (setId(e.target.value), setErr(""))}
          />
        </label>
      </FormDialog>
      <EditorDialog open={!!key} onOpenChange={(o) => !o && setKey(null)} width="medium">
        {key ? (
          <>
            <div className="flex flex-col gap-1 px-6 pt-5">
              <DialogTitle>{S.keyTitle(key.code)}</DialogTitle>
              <DialogDescription>{S.keyLine}</DialogDescription>
            </div>
            <div className="px-6 py-4">
              <code
                aria-label={S.keyAria}
                className="bg-tide-sunken rounded-tide-field block p-3 font-mono text-[13px] break-all select-all"
              >
                {key.key}
              </code>
            </div>
            <div className="border-border flex justify-end border-t px-6 py-3.5">
              <LabButton variant="primary" onClick={() => setKey(null)}>
                {S.done}
              </LabButton>
            </div>
          </>
        ) : null}
      </EditorDialog>
    </>
  );
}

/** Add a fridge: ID (upper-cased, unique) and kind; it starts unplaced. */
function FridgeDialog({
  view: v,
  open,
  toast,
  onClose,
}: {
  view: PlacesView;
  open: boolean;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const [pending, run] = useAct(toast);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("");
  const [err, setErr] = useState("");
  const F = PL.fridge;
  const close = () => (setCode(""), setKind(""), setErr(""), onClose());
  const submit = () => {
    const c = code.trim().toUpperCase();
    if (!c || !kind.trim()) return setErr(F.err);
    if (v.fridges.some((f) => f.code === c)) return setErr(F.used(c));
    void run(
      () => addFridgeAction({ code: c, kind: kind.trim() }),
      () => F.added(c),
    ).then((ok) => ok && close());
  };
  return (
    <FormDialog
      open={open}
      onClose={close}
      title={F.title}
      sub={F.lead}
      error={err}
      submit={F.save}
      onSubmit={submit}
      pending={pending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{F.id}</span>
          <input
            className={inputCls}
            placeholder={F.idPh}
            value={code}
            onChange={(e) => (setCode(e.target.value.toUpperCase()), setErr(""))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{F.kind}</span>
          <input
            className={inputCls}
            placeholder={F.kindPh}
            value={kind}
            onChange={(e) => (setKind(e.target.value), setErr(""))}
          />
        </label>
      </div>
    </FormDialog>
  );
}

/** §B5: every fridge, live from the latest reading; typed checks for fridges without a sensor. */
export function ColdChain({ view: v, toast }: { view: PlacesView; toast: (m: string) => void }) {
  const [pending, run] = useAct(toast);
  const [reading, setReading] = useState<FridgeRow | null>(null);
  const [sensor, setSensor] = useState<FridgeRow | null>(null);
  const [adding, setAdding] = useState(false);
  const keeper = v.can.suppliers;
  const open = v.places.filter((p) => !p.closed);
  const placeName = (id: string | null) => v.places.find((p) => p.id === id)?.name ?? null;
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          {PL.coldTitle} <Tag tone="info">{PL.live}</Tag>
        </span>
      }
      note={PL.coldNote}
      action={keeper ? <LabButton onClick={() => setAdding(true)}>{PL.addFridge}</LabButton> : null}
    >
      {v.fridges.length ? (
        <ul className="grid gap-3 min-[760px]:grid-cols-2 xl:grid-cols-3">
          {v.fridges.map((f) => {
            const st = stateOf(v, f);
            return (
              <li
                key={f.id}
                className="border-border flex min-w-0 flex-col gap-2 rounded-2xl border p-3"
              >
                <div className="flex flex-col">
                  <span className="text-body-s text-foreground font-semibold">
                    {PL.fridgeName(f.code, f.name)}
                  </span>
                  <span className="text-caption text-ink-600">
                    {PL.where(placeName(f.placeId), f.sensorId, clock(f.readAt))}
                  </span>
                </div>
                {f.temp !== null && st ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-[26px] leading-8 font-semibold tabular-nums">
                        {`${f.temp.toFixed(1)} °C`}
                      </span>
                      <Tag tone={FRIDGE_TONE[st]}>{PL.state[st]}</Tag>
                    </div>
                    <Gauge
                      temp={f.temp}
                      near={v.rules.nearC}
                      label={PL.gaugeAria(`${f.temp.toFixed(1)} °C`, PL.state[st])}
                    />
                  </>
                ) : (
                  <Tag tone="grey">{PL.noReading}</Tag>
                )}
                <span className="text-caption text-ink-700">
                  {PL.stats(PL.range(f.todayMin, f.todayMax), f.excursions7d)}
                </span>
                {!f.sensorId ? (
                  <div className="flex flex-wrap gap-1">
                    {typedDue(f.typed, v.nowMin, v.rules.missedMin).map((c) => (
                      <Tag key={c.t} tone={c.st === "ok" ? "ok" : c.st === "late" ? "bad" : "grey"}>
                        {c.st === "ok" ? PL.typed.ok(c.t, c.temp!) : PL.typed[c.st](c.t)}
                      </Tag>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  {!f.sensorId && v.can.readings ? (
                    <LabButton size="sm" onClick={() => setReading(f)}>
                      {PL.record}
                    </LabButton>
                  ) : null}
                  {keeper ? (
                    f.sensorId ? (
                      <LabButton
                        size="sm"
                        variant="text"
                        busy={pending}
                        aria-label={PL.unlinkAria(f.code)}
                        onClick={() =>
                          void run(
                            () => unlinkSensorAction({ id: f.id }),
                            () => PL.sensor.unlinked(f.code),
                          )
                        }
                      >
                        {PL.unlink}
                      </LabButton>
                    ) : (
                      <LabButton
                        size="sm"
                        aria-label={PL.linkAria(f.code)}
                        onClick={() => setSensor(f)}
                      >
                        {PL.link}
                      </LabButton>
                    )
                  ) : null}
                </div>
                {keeper ? (
                  <PickField
                    label={PL.keptAt}
                    hint={PL.keptAria(f.code)}
                    forceList
                    options={[
                      { value: NONE, label: PL.notPlaced },
                      ...open.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                    value={f.placeId ?? NONE}
                    onChange={(to) => {
                      const placeId = to === NONE ? null : to;
                      void run(
                        () => moveFridgeAction({ id: f.id, placeId }),
                        () => PL.moved(f.code, placeName(placeId)),
                      );
                    }}
                  />
                ) : null}
                {f.excursions.length ? (
                  <ul className="flex flex-col gap-1">
                    {f.excursions.map((e) => (
                      <li
                        key={e.startedAt}
                        className="bg-status-caution-bg text-status-caution-fg-aa text-caption rounded-lg px-2 py-1"
                      >
                        {PL.excursion(
                          e.peak,
                          dayOf(e.startedAt),
                          clock(e.startedAt)!,
                          e.note,
                          e.byName,
                        )}
                        {e.endedAt ? "" : ` · ${PL.ongoing}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact title={PL.noFridges} />
      )}
      <ReadingDialog view={v} fridge={reading} toast={toast} onClose={() => setReading(null)} />
      <SensorDialog fridge={sensor} toast={toast} onClose={() => setSensor(null)} />
      <FridgeDialog view={v} open={adding} toast={toast} onClose={() => setAdding(false)} />
    </Panel>
  );
}
