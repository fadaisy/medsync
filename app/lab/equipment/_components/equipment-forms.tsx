"use client";

import type { PickOption } from "../../_components/v2/fields";
import type { EquipmentRow } from "@/lib/lab/equipment-read";
import { useState } from "react";
import { CheckIcon, CircleIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { LabButton } from "@/components/tide/work/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill, LAB3 } from "@/content/lab-phase-3";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import {
  markBackInServiceAction,
  markDownAction,
  recordEquipmentLogAction,
  recordTemperatureAction,
  saveEquipmentAction,
  saveScheduleAction,
} from "@/lib/lab/equipment-actions";
import { quarantineLotAction } from "@/lib/lab/stock-actions";
import { cn } from "@/lib/utils";
import { EQUIPMENT as C } from "../_lib/copy";
import { inputClass, newKey, num, Pop, selectClass } from "../../_components/pop";
import { DateField, DateTimeField } from "../../_components/v2/fields";
import { dateWords, timeWords } from "../../_lib/days";
import { ActButton } from "../../quality/_components/act-button";
import { ConceptMultiPick } from "../../quality/_components/concept-pick";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

type Section = { id: string; name: string };
type Can = { lead: boolean; staff: boolean; stock: boolean };
const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
/** A datetime-local value for now, in the browser's own time. */
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/* ─── The register (EQ-1, lead) ────────────────────────────────────── */

export function EquipmentDialog({
  sections,
  concepts,
  initial,
}: {
  sections: Section[];
  concepts: readonly PickOption[];
  initial?: EquipmentRow;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const d = initial?.details ?? {};
  const [f, setF] = useState({
    kind: initial?.kind ?? "",
    model: initial?.model ?? "",
    serial: initial?.serial ?? "",
    sectionId: initial?.sectionId ?? "",
    location: d.location ?? "",
    provider: d.provider ?? "",
    contact: d.contact ?? "",
    installedOn: d.installedOn ?? "",
    tests: initial?.linkedTests.join(", ") ?? "",
  });
  const [linked, setLinked] = useState<string[]>(initial?.linkedConcepts ?? []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const F = C.form;
  const save = () =>
    act(async () => {
      const r = await saveEquipmentAction({
        ...(initial ? { id: initial.id } : {}),
        kind: f.kind,
        model: f.model,
        serial: f.serial.trim() || null,
        sectionId: f.sectionId || null,
        details: {
          location: f.location.trim() || null,
          provider: f.provider.trim() || null,
          contact: f.contact.trim() || null,
          installedOn: f.installedOn || null,
        },
        linkedConcepts: linked,
        linkedTests: list(f.tests),
      });
      if (r.ok) setOpen(false);
      return r;
    }, F.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={initial ? C.edit : C.register}
        sr={initial?.model}
        variant={initial ? "ghost" : "secondary"}
        title={initial ? initial.model : C.register}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <ActButton variant="primary" type="button" onClick={save} busy={pending}>
            {F.save}
          </ActButton>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={F.kind}>
            <select value={f.kind} onChange={set("kind")} className={selectClass}>
              <option value="">{C.choose}</option>
              {Object.entries(C.kinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={F.model}>
            <Input value={f.model} onChange={set("model")} maxLength={80} className={inputClass} />
          </Field>
          <Field label={F.serial}>
            <Input
              value={f.serial}
              onChange={set("serial")}
              maxLength={60}
              className={cn(inputClass, "font-mono")}
            />
          </Field>
          <Field label={F.section}>
            <select value={f.sectionId} onChange={set("sectionId")} className={selectClass}>
              <option value="">{C.choose}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={F.location}>
            <Input
              value={f.location}
              onChange={set("location")}
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <DateField
            label={F.installedOn}
            value={f.installedOn}
            onChange={(v) => setF((x) => ({ ...x, installedOn: v }))}
          />
          <Field label={F.provider}>
            <Input
              value={f.provider}
              onChange={set("provider")}
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <Field label={F.contact}>
            <Input
              value={f.contact}
              onChange={set("contact")}
              maxLength={120}
              className={inputClass}
            />
          </Field>
          <span />
          <div className="sm:col-span-2">
            <ConceptMultiPick
              label={LABWS2_QUALITY.sweep.concepts}
              options={concepts}
              value={linked}
              onChange={setLinked}
            />
          </div>
          <Field label={F.tests}>
            <Input
              value={f.tests}
              onChange={set("tests")}
              className={cn(inputClass, "font-mono")}
            />
          </Field>
        </div>
        <Said message={message} />
      </Pop>
      {!open ? <Said message={message} /> : null}
    </div>
  );
}

/* ─── Schedule and range (EQ-4..EQ-6, lead; operational) ───────────── */

function ScheduleDialog({ row }: { row: EquipmentRow }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const S = C.scheduleForm;
  const [tasks, setTasks] = useState(
    row.schedules.tasks.map((t) => ({
      key: t.key,
      kind: t.kind,
      unit: "days" in t.every ? "days" : "count",
      n: String("days" in t.every ? t.every.days : t.every.count),
      required: t.requiredBeforeUse,
    })),
  );
  const t0 = row.schedules.temperature;
  const [temp, setTemp] = useState({
    on: !!t0,
    min: t0?.min.toString() ?? "",
    max: t0?.max.toString() ?? "",
    perDay: t0?.readingsPerDay.toString() ?? "",
  });
  const patch = (i: number, v: Partial<(typeof tasks)[number]>) =>
    setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, ...v } : t)));
  const save = () =>
    act(async () => {
      const r = await saveScheduleAction({
        deviceId: row.id,
        schedules: {
          tasks: tasks.map((t) => ({
            key: t.key.trim(),
            kind: t.kind,
            every: t.unit === "days" ? { days: Number(t.n) } : { count: Number(t.n) },
            requiredBeforeUse: t.required,
          })),
          temperature: temp.on
            ? { min: num(temp.min), max: num(temp.max), readingsPerDay: num(temp.perDay) }
            : null,
        },
      });
      if (r.ok) setOpen(false);
      return r;
    }, S.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={C.schedule}
        sr={row.model}
        variant="ghost"
        title={`${C.schedule} · ${row.model}`}
        lede={S.lede}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <ActButton variant="primary" type="button" onClick={save} busy={pending}>
            {S.save}
          </ActButton>
        }
      >
        {tasks.map((t, i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-5">
            <Field label={S.task}>
              <Input
                value={t.key}
                onChange={(e) => patch(i, { key: e.target.value })}
                maxLength={60}
                className={cn(inputClass, "font-mono")}
              />
            </Field>
            <Field label={S.kind}>
              <select
                value={t.kind}
                onChange={(e) =>
                  patch(i, { kind: e.target.value as "maintenance" | "calibration" })
                }
                className={selectClass}
              >
                <option value="maintenance">{S.maintenance}</option>
                <option value="calibration">{S.calibration}</option>
              </select>
            </Field>
            <Field label={S.every}>
              <Input
                type="number"
                min={1}
                value={t.n}
                onChange={(e) => patch(i, { n: e.target.value })}
                className={cn(inputClass, "tabular-nums")}
              />
            </Field>
            <Field label=" ">
              <select
                value={t.unit}
                onChange={(e) => patch(i, { unit: e.target.value })}
                className={selectClass}
              >
                <option value="days">{S.days}</option>
                <option value="count">{S.count}</option>
              </select>
            </Field>
            <label className="text-body-s flex min-h-11 items-center gap-2 self-end sm:min-h-9">
              <input
                type="checkbox"
                checked={t.required}
                onChange={(e) => patch(i, { required: e.target.checked })}
              />
              {S.required}
            </label>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="w-fit"
          onClick={() =>
            setTasks((ts) => [
              ...ts,
              { key: "", kind: "maintenance", unit: "days", n: "", required: false },
            ])
          }
        >
          {S.addTask}
        </Button>
        <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
          <input
            type="checkbox"
            checked={temp.on}
            onChange={(e) => setTemp((x) => ({ ...x, on: e.target.checked }))}
          />
          {S.temperature}
        </label>
        {temp.on ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["min", S.min],
                ["max", S.max],
                ["perDay", S.perDay],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <Input
                  type="number"
                  step="any"
                  value={temp[k]}
                  onChange={(e) => setTemp((x) => ({ ...x, [k]: e.target.value }))}
                  className={cn(inputClass, "tabular-nums")}
                />
              </Field>
            ))}
          </div>
        ) : null}
        <Said message={message} />
      </Pop>
      {!open ? <Said message={message} /> : null}
    </div>
  );
}

/* ─── The panel (§5.7) ─────────────────────────────────────────────── */

function Check({ done, children }: { done: boolean; children: string }) {
  return (
    <li className="text-body-s flex items-center gap-2">
      {done ? (
        <CheckIcon aria-hidden className="size-4" />
      ) : (
        <CircleIcon aria-hidden className="size-4" />
      )}
      <span>{children}</span>
      <span className="sr-only">{done ? "done" : "not yet"}</span>
    </li>
  );
}

export function EquipmentPanel({
  row: e,
  can,
  sections,
  concepts,
  now,
}: {
  row: EquipmentRow;
  can: Can;
  sections: Section[];
  concepts: readonly PickOption[];
  now: Date;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [down, setDown] = useState({ since: localNow(), cause: "", reportedTo: "", ticket: "" });
  const [repair, setRepair] = useState({ at: localNow(), note: "" });
  const [reading, setReading] = useState({ value: "", unit: "°C", at: localNow() });
  const [suggested, setSuggested] = useState<{ id: string; lot: string }[]>([]);
  const P = C.panel;
  const b = e.breakdown;
  const ready = !!b?.repairAt && b.qc.every((q) => q.passed);
  const temperature = (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    act(async () => {
      const r = await recordTemperatureAction({
        deviceId: e.id,
        value: Number(reading.value),
        unit: reading.unit,
        doneAt: new Date(reading.at).toISOString(),
        clientKey: newKey(),
      });
      if (r.ok) setSuggested(r.data?.suggestQuarantine ?? []);
      return r;
    }, P.readingSaved);
  };
  const lots = suggested.length
    ? suggested
    : e.temperature?.latest?.inRange === false
      ? e.stored
      : [];
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Pop
        label={C.open}
        sr={e.model}
        variant="ghost"
        width="wide"
        title={e.model}
        open={open}
        setOpen={setOpen}
      >
        <dl className="grid gap-3 sm:grid-cols-4">
          {(
            [
              [C.form.location, e.details.location],
              [C.form.provider, e.details.provider],
              [C.form.contact, e.details.contact],
              [C.form.installedOn, e.details.installedOn],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">{label}</dt>
              <dd className="text-body-s">{v || LAB3.noData}</dd>
            </div>
          ))}
        </dl>

        {b ? (
          <section
            aria-labelledby={`down-${e.id}`}
            className="border-border flex flex-col gap-3 border-t pt-3"
          >
            <h3 id={`down-${e.id}`} className="text-heading-s">
              {C.downSince(at(b.since))}
            </h3>
            <dl className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  [P.cause, b.cause],
                  [P.reportedTo, b.reportedTo],
                  [P.ticket, b.ticket],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-caption text-muted-foreground">{label}</dt>
                  <dd className="text-body-s">{v || LAB3.noData}</dd>
                </div>
              ))}
            </dl>
            <h4 className="text-body-s font-medium">{P.doctors}</h4>
            {e.doctorsSee.length ? (
              <ul className="flex flex-col gap-1">
                {e.doctorsSee.map((d) => (
                  <li key={d.test} className="text-body-s flex flex-wrap items-center gap-2">
                    <span>{d.test}</span>
                    <StatusWord tone={d.state === "down_referred" ? "caution" : "neutral"}>
                      {d.words ?? d.state}
                    </StatusWord>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-s text-muted-foreground">{P.noTests}</p>
            )}
            <p className="text-body-s">{P.toRefer(b.specimensToRefer)}</p>
            <h4 className="text-body-s font-medium">{P.backWhen}</h4>
            <ul className="flex flex-col gap-1" aria-label={LAB3.backInServiceConditions}>
              <Check done={!!b.repairAt}>{P.repairRecorded}</Check>
              {b.qc.map((q) => (
                <Check key={q.concept} done={q.passed}>
                  {P.qcPassed(q.name)}
                </Check>
              ))}
            </ul>
            {can.staff && !b.repairAt ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={P.repairNote}>
                  <Input
                    value={repair.note}
                    onChange={(ev) => setRepair((x) => ({ ...x, note: ev.target.value }))}
                    maxLength={1000}
                    className={inputClass}
                  />
                </Field>
                <DateTimeField
                  label={P.repairAt}
                  value={repair.at}
                  onChange={(v) => setRepair((x) => ({ ...x, at: v }))}
                  now={now.toISOString()}
                />
                <ActButton
                  type="button"
                  variant="secondary"
                  className="self-end"
                  busy={pending}
                  onClick={() =>
                    act(
                      () =>
                        recordEquipmentLogAction({
                          deviceId: e.id,
                          kind: "repair",
                          taskKey: null,
                          doneAt: new Date(repair.at).toISOString(),
                          note: repair.note.trim() || null,
                          filePath: null,
                          clientKey: newKey(),
                        }),
                      P.repaired,
                    )
                  }
                >
                  {P.repair}
                </ActButton>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-body-s text-muted-foreground tabular-nums">
                {P.downFor(Math.max(0, Math.floor((now.getTime() - b.since.getTime()) / 60_000)))}
              </span>
              {can.lead ? (
                <LabButton
                  type="button"
                  busy={pending}
                  disabledReason={ready ? null : LABWS2_QUALITY.sweep.backUnready}
                  onClick={() => act(() => markBackInServiceAction({ deviceId: e.id }), P.backDone)}
                >
                  {P.back}
                </LabButton>
              ) : null}
            </div>
          </section>
        ) : can.lead && e.state === "in_use" ? (
          <section
            aria-labelledby={`mark-${e.id}`}
            className="border-border flex flex-col gap-3 border-t pt-3"
          >
            <h3 id={`mark-${e.id}`} className="text-heading-s">
              {P.markDown}
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <DateTimeField
                label={P.sinceField}
                value={down.since}
                onChange={(v) => setDown((x) => ({ ...x, since: v }))}
                now={now.toISOString()}
                className="sm:col-span-4"
              />
              <Field label={P.causeField}>
                <Input
                  value={down.cause}
                  onChange={(ev) => setDown((x) => ({ ...x, cause: ev.target.value }))}
                  maxLength={500}
                  className={inputClass}
                />
              </Field>
              <Field label={P.reportedTo}>
                <Input
                  value={down.reportedTo}
                  onChange={(ev) => setDown((x) => ({ ...x, reportedTo: ev.target.value }))}
                  maxLength={160}
                  className={inputClass}
                />
              </Field>
              <Field label={P.ticket}>
                <Input
                  value={down.ticket}
                  onChange={(ev) => setDown((x) => ({ ...x, ticket: ev.target.value }))}
                  maxLength={60}
                  className={cn(inputClass, "font-mono")}
                />
              </Field>
            </div>
            <ActButton
              type="button"
              variant="secondary"
              className="w-fit"
              busy={pending}
              onClick={() =>
                act(
                  () =>
                    markDownAction({
                      deviceId: e.id,
                      since: new Date(down.since).toISOString(),
                      cause: down.cause,
                      reportedTo: down.reportedTo.trim() || null,
                      ticket: down.ticket.trim() || null,
                    }),
                  P.markedDown,
                )
              }
            >
              {P.markDown}
            </ActButton>
          </section>
        ) : null}

        {e.tasks.length ? (
          <section
            aria-labelledby={`tasks-${e.id}`}
            className="border-border flex flex-col gap-2 border-t pt-3"
          >
            <h3 id={`tasks-${e.id}`} className="text-heading-s">
              {P.tasks}
            </h3>
            <ul className="flex flex-col gap-2">
              {e.tasks.map((t) => (
                <li key={t.key} className="text-body-s flex flex-wrap items-center gap-2">
                  <span className="font-mono">{t.key}</span>
                  {t.overdue ? (
                    <StatusWord tone="caution">
                      {t.blocks ? `${C.overdue(1)} · ${C.scheduleForm.required}` : C.overdue(1)}
                    </StatusWord>
                  ) : (
                    <StatusWord icon glyph={CheckIcon}>
                      {C.allDone}
                    </StatusWord>
                  )}
                  {t.lastDone ? (
                    <span className="text-muted-foreground">{C.lastDone(at(t.lastDone))}</span>
                  ) : null}
                  {can.staff ? (
                    <ActButton
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="min-h-11 sm:min-h-7"
                      busy={pending}
                      onClick={() =>
                        act(
                          () =>
                            recordEquipmentLogAction({
                              deviceId: e.id,
                              kind: t.kind,
                              taskKey: t.key,
                              doneAt: new Date().toISOString(),
                              note: null,
                              filePath: null,
                              clientKey: newKey(),
                            }),
                          P.recorded,
                        )
                      }
                    >
                      {P.record}
                      <span className="sr-only"> {t.key}</span>
                    </ActButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {e.temperature && can.staff ? (
          <section
            aria-labelledby={`temp-${e.id}`}
            className="border-border flex flex-col gap-3 border-t pt-3"
          >
            <h3 id={`temp-${e.id}`} className="text-heading-s">
              {P.temperature}
            </h3>
            <form onSubmit={temperature} className="grid gap-3 sm:grid-cols-4">
              <Field label={P.reading}>
                <Input
                  inputMode="decimal"
                  value={reading.value}
                  onChange={(ev) => setReading((x) => ({ ...x, value: ev.target.value }))}
                  className={cn(inputClass, "tabular-nums")}
                />
              </Field>
              <Field label={P.unit}>
                <Input
                  value={reading.unit}
                  onChange={(ev) => setReading((x) => ({ ...x, unit: ev.target.value }))}
                  maxLength={40}
                  className={inputClass}
                />
              </Field>
              <DateTimeField
                label={P.readAt}
                value={reading.at}
                onChange={(v) => setReading((x) => ({ ...x, at: v }))}
                now={now.toISOString()}
                className="sm:col-span-2"
              />
              <ActButton type="submit" variant="secondary" className="self-end" busy={pending}>
                {P.saveReading}
              </ActButton>
            </form>
            {lots.length ? (
              <div className="flex flex-col gap-2">
                <StatusWord tone="caution" className="w-fit">
                  {e.temperature.latest
                    ? fill(LAB3.temperatureOut, {
                        Point: e.model,
                        value: `${e.temperature.latest.value} ${e.temperature.latest.unit}`,
                        time: timeWords(e.temperature.latest.at),
                        range: `${e.temperature.range.min} to ${e.temperature.range.max}`,
                      })
                    : P.suggest}
                </StatusWord>
                <p className="text-caption text-muted-foreground">{P.suggest}</p>
                <ul className="flex flex-col gap-1">
                  {lots.map((l) => (
                    <li key={l.id} className="text-body-s flex items-center gap-2">
                      <span className="font-mono">{l.lot}</span>
                      {can.stock ? (
                        <ActButton
                          type="button"
                          variant="quiet"
                          size="sm"
                          className="min-h-11 sm:min-h-7"
                          busy={pending}
                          onClick={() =>
                            act(
                              () =>
                                quarantineLotAction({
                                  lotId: l.id,
                                  reason:
                                    `Stored in ${e.model} when its temperature was out of range`.slice(
                                      0,
                                      300,
                                    ),
                                }),
                              P.quarantined,
                            )
                          }
                        >
                          {P.quarantine}
                          <span className="sr-only"> {l.lot}</span>
                        </ActButton>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
        <Said message={message} />
      </Pop>
      {can.lead ? (
        <>
          <EquipmentDialog sections={sections} concepts={concepts} initial={e} />
          <ScheduleDialog row={e} />
        </>
      ) : null}
    </div>
  );
}
