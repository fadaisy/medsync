"use client";

import type { DeviceTrigger } from "@/lib/lab/bedside-quality";
import { useState } from "react";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAB3_BEDSIDE as B } from "@/content/lab-phase-3";
import {
  recordDeviceCheckAction,
  recordDeviceErrorAction,
} from "@/lib/lab/bedside-quality-actions";
import { inputClass, newKey, Pop, selectClass } from "../../../../lab/_components/pop";
import { Field, Said, useAct } from "../../../../lab/setup/criticals/_components/setup-forms";

type Ranges = Record<string, { low: number; high: number }>;

/**
 * The control check (§5.10, artboard 10): one row per control level with the reading, the accepted range for this
 * strip lot (read-only, entered by the laboratory from the vial) and the result; Save check. The server scores it
 * again and decides; a fail blocks the meter (BQ-2).
 */
export function DeviceCheckForm({
  device,
}: {
  device: {
    id: string;
    label: string;
    levels: string[];
    due: DeviceTrigger[];
    controlLot: string | null;
    lots: { id: string; lot: string; ranges: Ranges | null }[];
  };
}) {
  const { pending, message, act } = useAct();
  const [lotId, setLotId] = useState(device.lots[0]?.id ?? "");
  const [readings, setReadings] = useState<Record<string, string>>({});
  const lot = device.lots.find((l) => l.id === lotId) ?? null;
  const save = () =>
    act(
      () =>
        recordDeviceCheckAction({
          deviceId: device.id,
          stripLotId: lotId,
          trigger: device.due[0] ?? "each_day_of_use",
          observed: Object.fromEntries(
            device.levels
              .filter((l) => (readings[l] ?? "").trim() !== "")
              .map((l) => [l, Number(readings[l])]),
          ),
          clientKey: newKey(),
        }),
      B.saved,
    );
  return (
    <div className="flex flex-col gap-3">
      <Field label={B.stripLot}>
        <select
          value={lotId}
          onChange={(e) => setLotId(e.target.value)}
          className={`${selectClass} max-w-xs`}
        >
          {device.lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lot}
            </option>
          ))}
        </select>
      </Field>
      {lot && !lot.ranges ? <StatusWord tone="caution">{B.noRanges}</StatusWord> : null}
      <table className="text-body-s w-full border-collapse text-left">
        <caption className="sr-only">{`${B.title}: ${device.label}`}</caption>
        <thead>
          <tr className="border-border border-b">
            {B.columns.map((h) => (
              <th
                key={h}
                scope="col"
                className="text-caption text-muted-foreground py-1 pr-3 font-medium"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {device.levels.map((level) => {
            const r = lot?.ranges?.[level];
            const raw = readings[level] ?? "";
            const v = raw.trim() === "" ? null : Number(raw);
            const inRange =
              r && v !== null && Number.isFinite(v) ? v >= r.low && v <= r.high : null;
            return (
              <tr key={level} className="border-ink-150 border-b last:border-b-0">
                <td className="py-2 pr-3">{level}</td>
                <td className="py-2 pr-3">
                  <Input
                    inputMode="decimal"
                    aria-label={`${B.columns[1]} ${level}`}
                    value={raw}
                    onChange={(e) => setReadings({ ...readings, [level]: e.target.value })}
                    className={`${inputClass} max-w-28 text-right tabular-nums`}
                  />
                </td>
                <td className="py-2 pr-3 tabular-nums">{r ? `${r.low}–${r.high}` : "—"}</td>
                <td className="py-2 pr-3">
                  {inRange === null ? (
                    "—"
                  ) : inRange ? (
                    <StatusWord icon glyph={CheckIcon}>
                      {B.inRange}
                    </StatusWord>
                  ) : (
                    <StatusWord tone="caution">{B.outOfRange}</StatusWord>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-caption text-muted-foreground">
        {`${B.stripLot}: ${lot?.lot ?? "—"} · ${B.controlLot}: ${device.controlLot ?? "—"}`}
      </p>
      <Button
        type="button"
        className="min-h-11 w-fit sm:min-h-9"
        disabled={pending || !lotId}
        onClick={save}
      >
        {B.save}
      </Button>
      <Said message={message} />
    </div>
  );
}

/** BQ-1: a drop or an error message on the meter; a check is due before the next patient result. */
export function DeviceIncident({ deviceId, label }: { deviceId: string; label: string }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "error" as "error" | "drop", note: "" });
  const save = () =>
    act(async () => {
      const r = await recordDeviceErrorAction({
        deviceId,
        kind: f.kind,
        note: f.note.trim() || null,
        clientKey: newKey(),
      });
      if (r.ok) setOpen(false);
      return r;
    }, B.incidentSaved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={B.incident}
        sr={label}
        title={`${B.incident}: ${label}`}
        lede={B.incidentLede}
        variant="ghost"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {B.save}
          </Button>
        }
      >
        <Field label={B.incidentKind}>
          <select
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value as "error" | "drop" })}
            className={selectClass}
          >
            <option value="error">{B.kinds.error}</option>
            <option value="drop">{B.kinds.drop}</option>
          </select>
        </Field>
        <Field label={B.note}>
          <Input
            value={f.note}
            onChange={(e) => setF({ ...f, note: e.target.value })}
            className={inputClass}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}
