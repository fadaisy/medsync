"use client";

import type { Payload } from "@/lib/lab/signed-config";
import { useState } from "react";

import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  grandfatherOperatorsAction,
  recordCompetencyAction,
  saveCompetencyValidityAction,
  saveDeviceQcRuleAction,
  setStripLotRangesAction,
  signBedsideConfigAction,
} from "@/lib/lab/bedside-quality-actions";
import { QUALITY } from "../_lib/copy";
import { inputClass, num, Pop } from "../../_components/pop";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";

const B = QUALITY.bedside;
const TRIGGERS = [
  "each_day_of_use",
  "new_strip_lot",
  "new_control_vial",
  "after_incident",
] as const;
const METHODS = ["training", "observed_test", "known_value_sample"] as const;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function Ticks<T extends string>({
  legend,
  options,
  words,
  value,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  words: Record<T, string>;
  value: Set<T>;
  onChange: (v: Set<T>) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-body-s text-muted-foreground mb-1">{legend}</legend>
      {options.map((o) => (
        <label key={o} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8">
          <input
            type="checkbox"
            checked={value.has(o)}
            onChange={(e) => {
              const n = new Set(value);
              if (e.target.checked) n.add(o);
              else n.delete(o);
              onChange(n);
            }}
          />
          {words[o]}
        </label>
      ))}
    </fieldset>
  );
}

/* ─── BQ-1: the device rule (the lead; signed alone) ───────────────────── */

export function DeviceRuleDialog({
  testCode,
  test,
  initial,
}: {
  testCode: string;
  test: string;
  initial: Payload<"device_qc_rule"> | null;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [triggers, setTriggers] = useState(new Set(initial?.triggers ?? []));
  const [f, setF] = useState({
    levels: initial?.levels.join("\n") ?? "",
    required: initial?.requiredBeforeUse ?? false,
    source: initial?.source ?? "",
  });
  const save = () =>
    act(async () => {
      const r = await saveDeviceQcRuleAction({
        testCode,
        payload: {
          triggers: [...triggers],
          levels: lines(f.levels),
          requiredBeforeUse: f.required,
          source: f.source,
        },
      });
      if (r.ok) setOpen(false);
      return r;
    }, B.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={B.editRule}
        sr={test}
        title={`${B.rule}: ${test}`}
        lede={B.ruleLede}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {B.saveDraft}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Ticks
            legend={B.triggers}
            options={TRIGGERS}
            words={B.triggerWords}
            value={triggers}
            onChange={setTriggers}
          />
          <Field label={B.levels}>
            <textarea
              value={f.levels}
              onChange={(e) => setF({ ...f, levels: e.target.value })}
              className="border-input bg-card text-body-s min-h-24 w-full rounded-sm border p-2"
            />
          </Field>
        </div>
        <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8">
          <input
            type="checkbox"
            checked={f.required}
            onChange={(e) => setF({ ...f, required: e.target.checked })}
          />
          {B.required}
        </label>
        <Field label={B.source}>
          <Input
            value={f.source}
            onChange={(e) => setF({ ...f, source: e.target.value })}
            className={inputClass}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}

/* ─── BQ-4: competency validity and the grace period (the lead; signed alone) ─── */

export function ValidityDialog({
  testCode,
  test,
  initial,
}: {
  testCode: string;
  test: string;
  initial: Payload<"competency_validity"> | null;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState(new Set(initial?.methods ?? []));
  const [f, setF] = useState({
    valid: initial ? String(initial.validDays) : "",
    grace: initial ? String(initial.graceDays) : "",
    source: initial?.source ?? "",
  });
  const save = () =>
    act(async () => {
      const r = await saveCompetencyValidityAction({
        testCode,
        payload: {
          methods: [...methods],
          validDays: num(f.valid),
          graceDays: num(f.grace),
          source: f.source,
        },
      });
      if (r.ok) setOpen(false);
      return r;
    }, B.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={B.editValidity}
        sr={test}
        title={`${B.validity}: ${test}`}
        lede={B.validityLede}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {B.saveDraft}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Ticks
            legend={B.methods}
            options={METHODS}
            words={B.methodWords}
            value={methods}
            onChange={setMethods}
          />
          <Field label={B.validDays}>
            <Input
              inputMode="numeric"
              value={f.valid}
              onChange={(e) => setF({ ...f, valid: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={B.graceDays}>
            <Input
              inputMode="numeric"
              value={f.grace}
              onChange={(e) => setF({ ...f, grace: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label={B.source}>
          <Input
            value={f.source}
            onChange={(e) => setF({ ...f, source: e.target.value })}
            className={inputClass}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}

export function SignBedside({ configId, author }: { configId: string; author: boolean }) {
  const { pending, message, act, setMessage } = useAct();
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const sign = () =>
    act(async () => {
      const r = await signBedsideConfigAction({ configId, exceptionNote: note.trim() || null });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false as const, error: "Enter your authenticator code to sign." };
      }
      return r;
    }, B.signed);
  return (
    <div className="flex flex-col gap-2">
      {author ? (
        <Field label={QUALITY.qc.exception}>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </Field>
      ) : null}
      {fresh ? (
        <FreshFactor
          onCancel={() => setFresh(false)}
          onConfirmed={() => {
            setFresh(false);
            setMessage(null);
            sign();
          }}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 w-fit sm:min-h-8"
          disabled={pending}
          onClick={sign}
        >
          {QUALITY.qc.sign}
        </Button>
      )}
      <Said message={message} />
    </div>
  );
}

export function SwitchOn({ testCode, test }: { testCode: string; test: string }) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 w-fit sm:min-h-8"
        disabled={pending}
        onClick={() => act(() => grandfatherOperatorsAction({ testCode }), B.switchedOn)}
      >
        {B.switchOn}
        <span className="sr-only"> {test}</span>
      </Button>
      <Said message={message} />
    </div>
  );
}

/* ─── BQ-1: a strip lot's accepted ranges, from the vial (once) ─────────── */

export function RangesDialog({
  lot,
  levels,
}: {
  lot: { id: string; lot: string };
  levels: string[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<Record<string, { low: string; high: string }>>(
    Object.fromEntries(levels.map((l) => [l, { low: "", high: "" }])),
  );
  const save = () =>
    act(async () => {
      const res = await setStripLotRangesAction({
        lotId: lot.id,
        ranges: Object.fromEntries(
          levels.map((l) => [l, { low: num(r[l]!.low), high: num(r[l]!.high) }]),
        ),
      });
      if (res.ok) setOpen(false);
      return res;
    }, B.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={B.enterRanges}
        sr={lot.lot}
        title={`${B.ranges}: ${lot.lot}`}
        lede={B.rangesLede}
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {B.save}
          </Button>
        }
      >
        {levels.map((l) => (
          <div key={l} className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr] sm:items-end">
            <span className="text-body-s font-medium">{l}</span>
            <Field label={B.low}>
              <Input
                inputMode="decimal"
                value={r[l]!.low}
                onChange={(e) => setR({ ...r, [l]: { ...r[l]!, low: e.target.value } })}
                className={inputClass}
              />
            </Field>
            <Field label={B.high}>
              <Input
                inputMode="decimal"
                value={r[l]!.high}
                onChange={(e) => setR({ ...r, [l]: { ...r[l]!, high: e.target.value } })}
                className={inputClass}
              />
            </Field>
          </div>
        ))}
      </Pop>
      <Said message={message} />
    </div>
  );
}

/* ─── BQ-4: an assessment (poct.assess or the lead) ─────────────────────── */

export function AssessDialog({
  userId,
  name,
  testCode,
  test,
}: {
  userId: string;
  name: string;
  testCode: string;
  test: string;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState(new Set<(typeof METHODS)[number]>());
  const [assessedOn, setAssessedOn] = useState(today());
  const save = () =>
    act(async () => {
      const r = await recordCompetencyAction({
        userId,
        testCode,
        assessedOn,
        method: [...methods],
      });
      if (r.ok) setOpen(false);
      return r;
    }, B.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={B.assess}
        sr={`${name}, ${test}`}
        title={`${B.assess}: ${name} · ${test}`}
        lede={B.assessLede}
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {B.save}
          </Button>
        }
      >
        <Ticks
          legend={B.methods}
          options={METHODS}
          words={B.methodWords}
          value={methods}
          onChange={setMethods}
        />
        <Field label={B.assessedOn}>
          <Input
            type="date"
            value={assessedOn}
            onChange={(e) => setAssessedOn(e.target.value)}
            className={`${inputClass} max-w-48`}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}
