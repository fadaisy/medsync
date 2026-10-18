"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signConfigAsLeadAction } from "@/lib/lab/catalogue-v2-actions";
import { rcv, rcvLogNormal } from "@/lib/lab/delta";
import { saveDeltaRuleAction, trialDeltaRuleAction } from "@/lib/lab/delta-actions";
import { inputClass, Pop, selectClass } from "../../../_components/pop";
import { Field, Said, useAct } from "../../criticals/_components/setup-forms";
import { SignButton } from "../../drafts/_components/sign-button";

/* Delta check rules (Lab Phase 5 §5.7, artboard 7; DL-1, DL-8, DL-10, DL-11). Every number is the laboratory lead's,
   with its basis; the RCV calculator proposes, the lead signs, the CSO countersigns. */

type Concept = { id: string; name: string };
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function DeltaRuleDialog({ concepts }: { concepts: Concept[] }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    key: "",
    concept: "",
    type: "absolute",
    both: "",
    rise: "",
    fall: "",
    split: false,
    windowHours: "",
    basis: "clinical",
    approver: "",
    rationale: "",
    cva: "",
    cvaSource: "",
    cvi: "",
    cviSource: "",
    z: "1.96",
    logNormal: false,
    percentile: "",
    dataPeriod: "",
    ageFrom: "",
    ageTo: "",
    acrossMethods: false,
    meaning: "",
    source: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const cva = Number(f.cva);
  const cvi = Number(f.cvi);
  const z = Number(f.z);
  const calc =
    f.basis === "rcv" && cva > 0 && cvi > 0
      ? f.logNormal
        ? (() => {
            const l = rcvLogNormal(cva, cvi, z);
            return `Rise ${l.up.toFixed(1)} %, fall ${(-l.down).toFixed(1)} %`;
          })()
        : `${rcv(cva, cvi, z).toFixed(1)} % either way`
      : null;
  const payload = () => ({
    concept: f.concept,
    type: f.basis === "rcv" ? "rcv" : f.type,
    limit:
      f.basis === "rcv"
        ? null
        : f.split
          ? { rise: num(f.rise), fall: num(f.fall) }
          : { both: num(f.both) },
    windowHours: num(f.windowHours),
    basis:
      f.basis === "rcv"
        ? {
            kind: "rcv",
            cvaPercent: cva,
            cvaSource: f.cvaSource,
            cviPercent: cvi,
            cviSource: f.cviSource,
            z: f.z,
            logNormal: f.logNormal,
          }
        : f.basis === "local_patient_percentile"
          ? {
              kind: "local_patient_percentile",
              percentile: num(f.percentile),
              dataPeriod: f.dataPeriod,
            }
          : { kind: "clinical", approver: f.approver, rationale: f.rationale },
    applicability: { ageFromYears: num(f.ageFrom), ageToYears: num(f.ageTo), specimen: null },
    acrossMethods: f.acrossMethods,
    meaning: f.meaning,
    source: f.source,
  });
  return (
    <Pop
      label="Add a delta rule"
      title="Delta rule"
      lede="A rule runs only after you sign it and the CSO countersigns it. Write down where the limit comes from."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await saveDeltaRuleAction({
                kind: "delta_rule",
                key: f.key.trim().toUpperCase(),
                payload: payload(),
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Saved as a draft. Sign it to send it to the CSO.")
          }
        >
          Save draft
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rule id (for example DC-MCV-1)">
          <Input className={inputClass} value={f.key} onChange={set("key")} maxLength={40} />
        </Field>
        <Field label="Component">
          <select className={selectClass} value={f.concept} onChange={set("concept")}>
            <option value="">Choose</option>
            {concepts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Basis of the limit">
          <select className={selectClass} value={f.basis} onChange={set("basis")}>
            <option value="clinical">Clinical judgement</option>
            <option value="rcv">Reference change value</option>
            <option value="local_patient_percentile">This lab&apos;s own patient data</option>
          </select>
        </Field>
        {f.basis !== "rcv" ? (
          <Field label="Compared as">
            <select className={selectClass} value={f.type} onChange={set("type")}>
              <option value="absolute">Absolute change</option>
              <option value="percent">Per cent change</option>
              <option value="rate_absolute">Change per day</option>
              <option value="rate_percent">Per cent change per day</option>
            </select>
          </Field>
        ) : null}
        {f.basis !== "rcv" ? (
          f.split ? (
            <>
              <Field label="Rise limit">
                <Input
                  className={inputClass}
                  inputMode="decimal"
                  value={f.rise}
                  onChange={set("rise")}
                />
              </Field>
              <Field label="Fall limit">
                <Input
                  className={inputClass}
                  inputMode="decimal"
                  value={f.fall}
                  onChange={set("fall")}
                />
              </Field>
            </>
          ) : (
            <Field label="Limit (either way)">
              <Input
                className={inputClass}
                inputMode="decimal"
                value={f.both}
                onChange={set("both")}
              />
            </Field>
          )
        ) : null}
        <Field label="Previous result within (hours)">
          <Input
            className={inputClass}
            inputMode="numeric"
            value={f.windowHours}
            onChange={set("windowHours")}
          />
        </Field>
      </div>
      {f.basis !== "rcv" ? (
        <label className="text-body-s flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.split}
            onChange={(e) => setF({ ...f, split: e.target.checked })}
          />
          Separate limits for a rise and a fall
        </label>
      ) : null}
      {f.basis === "rcv" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="This lab's CVA (%)">
            <Input className={inputClass} inputMode="decimal" value={f.cva} onChange={set("cva")} />
          </Field>
          <Field label="CVA source (QC data, analyser, level)">
            <Input
              className={inputClass}
              value={f.cvaSource}
              onChange={set("cvaSource")}
              maxLength={300}
            />
          </Field>
          <Field label="Z">
            <select className={selectClass} value={f.z} onChange={set("z")}>
              <option value="1.96">1.96 (two-sided, 95 %)</option>
              <option value="2.58">2.58 (two-sided, 99 %)</option>
              <option value="1.65">1.65 (one-sided, 95 %)</option>
              <option value="2.33">2.33 (one-sided, 99 %)</option>
            </select>
          </Field>
          <Field label="CVI (%)">
            <Input className={inputClass} inputMode="decimal" value={f.cvi} onChange={set("cvi")} />
          </Field>
          <Field label="CVI source (EFLM database entry)">
            <Input
              className={inputClass}
              value={f.cviSource}
              onChange={set("cviSource")}
              maxLength={300}
            />
          </Field>
          <label className="text-body-s flex items-center gap-2 self-end">
            <input
              type="checkbox"
              checked={f.logNormal}
              onChange={(e) => setF({ ...f, logNormal: e.target.checked })}
            />
            Log-normal (skewed analyte)
          </label>
          <p className="text-body-s sm:col-span-3" aria-live="polite">
            {calc ? `Reference change value: ${calc}.` : "Enter the CVA and the CVI to calculate."}
          </p>
        </div>
      ) : f.basis === "local_patient_percentile" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Percentile of this lab's pairs">
            <Input
              className={inputClass}
              inputMode="decimal"
              value={f.percentile}
              onChange={set("percentile")}
            />
          </Field>
          <Field label="Data period">
            <Input
              className={inputClass}
              value={f.dataPeriod}
              onChange={set("dataPeriod")}
              maxLength={300}
            />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Approved by">
            <Input
              className={inputClass}
              value={f.approver}
              onChange={set("approver")}
              maxLength={120}
            />
          </Field>
          <Field label="Rationale">
            <Input
              className={inputClass}
              value={f.rationale}
              onChange={set("rationale")}
              maxLength={300}
            />
          </Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="From age (years, optional)">
          <Input
            className={inputClass}
            inputMode="numeric"
            value={f.ageFrom}
            onChange={set("ageFrom")}
          />
        </Field>
        <Field label="To age (years, optional)">
          <Input
            className={inputClass}
            inputMode="numeric"
            value={f.ageTo}
            onChange={set("ageTo")}
          />
        </Field>
        <label className="text-body-s flex items-center gap-2 self-end">
          <input
            type="checkbox"
            checked={f.acrossMethods}
            onChange={(e) => setF({ ...f, acrossMethods: e.target.checked })}
          />
          Compare across methods
        </label>
      </div>
      <Field label="What a flag means (shown to the technologist)">
        <Input className={inputClass} value={f.meaning} onChange={set("meaning")} maxLength={200} />
      </Field>
      <Field label="Where the limit comes from">
        <Input className={inputClass} value={f.source} onChange={set("source")} maxLength={300} />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

export function PanelRuleDialog({
  tests,
}: {
  tests: { code: string; name: string; components: Concept[] }[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    key: "",
    test: "",
    picked: [] as string[],
    k: "",
    meaning: "",
    source: "",
  });
  const test = tests.find((t) => t.code === f.test);
  return (
    <Pop
      label="Add a panel rule"
      title="Panel rule"
      lede="Send to a person once when at least k of these components fail their delta, instead of once per component."
      open={open}
      setOpen={setOpen}
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await saveDeltaRuleAction({
                kind: "panel_rule",
                key: f.key.trim().toUpperCase(),
                payload: {
                  testCode: f.test,
                  components: f.picked,
                  k: num(f.k),
                  meaning: f.meaning,
                  source: f.source,
                },
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Saved as a draft.")
          }
        >
          Save draft
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rule id">
          <Input
            className={inputClass}
            value={f.key}
            onChange={(e) => setF({ ...f, key: e.target.value })}
            maxLength={40}
          />
        </Field>
        <Field label="Test">
          <select
            className={selectClass}
            value={f.test}
            onChange={(e) => setF({ ...f, test: e.target.value, picked: [] })}
          >
            <option value="">Choose</option>
            {tests.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="At least (k)">
          <Input
            className={inputClass}
            inputMode="numeric"
            value={f.k}
            onChange={(e) => setF({ ...f, k: e.target.value })}
          />
        </Field>
      </div>
      {test ? (
        <fieldset className="text-body-s flex flex-wrap gap-3">
          <legend className="text-muted-foreground mb-1">Components</legend>
          {test.components.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.picked.includes(c.id)}
                onChange={(e) =>
                  setF({
                    ...f,
                    picked: e.target.checked
                      ? [...f.picked, c.id]
                      : f.picked.filter((x) => x !== c.id),
                  })
                }
              />
              {c.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <Field label="What a flag means">
        <Input
          className={inputClass}
          value={f.meaning}
          onChange={(e) => setF({ ...f, meaning: e.target.value })}
          maxLength={200}
        />
      </Field>
      <Field label="Source">
        <Input
          className={inputClass}
          value={f.source}
          onChange={(e) => setF({ ...f, source: e.target.value })}
          maxLength={300}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

export function PatternRuleDialog({ concepts }: { concepts: Concept[] }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const blank = { concept: "", op: "above", value: "" };
  const [f, setF] = useState({
    key: "",
    name: "",
    description: "",
    rows: [blank, blank],
    meaning: "",
    source: "",
  });
  const setRow = (i: number, k: keyof typeof blank, v: string) =>
    setF({ ...f, rows: f.rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)) });
  return (
    <Pop
      label="Add a pattern rule"
      title="Pattern rule"
      lede="Describe the pattern in words and give this lab's own thresholds. Every condition must hold for it to fire."
      open={open}
      setOpen={setOpen}
      width="wide"
      action={
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const r = await saveDeltaRuleAction({
                kind: "pattern_rule",
                key: f.key.trim().toUpperCase(),
                payload: {
                  name: f.name,
                  description: f.description,
                  conditions: f.rows
                    .filter((r) => r.concept)
                    .map((r) => ({ concept: r.concept, op: r.op, value: num(r.value) })),
                  meaning: f.meaning,
                  source: f.source,
                },
              });
              if (r.ok) setOpen(false);
              return r;
            }, "Saved as a draft.")
          }
        >
          Save draft
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rule id">
          <Input
            className={inputClass}
            value={f.key}
            onChange={(e) => setF({ ...f, key: e.target.value })}
            maxLength={40}
          />
        </Field>
        <Field label="Name">
          <Input
            className={inputClass}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            maxLength={80}
          />
        </Field>
      </div>
      <Field label="The pattern in words">
        <Input
          className={inputClass}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          maxLength={400}
        />
      </Field>
      {f.rows.map((r, i) => (
        <div key={i} className="grid gap-4 sm:grid-cols-3">
          <Field label={`Condition ${i + 1}: component`}>
            <select
              className={selectClass}
              value={r.concept}
              onChange={(e) => setRow(i, "concept", e.target.value)}
            >
              <option value="">Choose</option>
              {concepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Is">
            <select
              className={selectClass}
              value={r.op}
              onChange={(e) => setRow(i, "op", e.target.value)}
            >
              <option value="above">above</option>
              <option value="below">below</option>
              <option value="rose_by">rose by at least</option>
              <option value="fell_by">fell by at least</option>
            </select>
          </Field>
          <Field label="Value (this lab's threshold)">
            <Input
              className={inputClass}
              inputMode="decimal"
              value={r.value}
              onChange={(e) => setRow(i, "value", e.target.value)}
            />
          </Field>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        className="w-fit"
        onClick={() => setF({ ...f, rows: [...f.rows, blank] })}
      >
        Add a condition
      </Button>
      <Field label="What a flag means">
        <Input
          className={inputClass}
          value={f.meaning}
          onChange={(e) => setF({ ...f, meaning: e.target.value })}
          maxLength={200}
        />
      </Field>
      <Field label="Source">
        <Input
          className={inputClass}
          value={f.source}
          onChange={(e) => setF({ ...f, source: e.target.value })}
          maxLength={300}
        />
      </Field>
      <Said message={message} />
    </Pop>
  );
}

/** DL-8: what the rule would have done on the last 90 days of released results. */
export function TrialButton({ payload, name }: { payload: unknown; name: string }) {
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 w-fit sm:min-h-8"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await trialDeltaRuleAction(payload);
          setBusy(false);
          setOut(
            r.ok && r.data
              ? `${r.data.pairs} pairs in 90 days; ${r.data.flags} would have flagged; ${r.data.mislabelsFlagged} of ${r.data.mislabels} known mislabels caught.`
              : r.ok
                ? null
                : r.error,
          );
        }}
      >
        Try it on past results<span className="sr-only"> for {name}</span>
      </Button>
      <p role="status" className="text-caption text-muted-foreground">
        {out}
      </p>
    </div>
  );
}

export function SignRule({ configId, authoredByMe }: { configId: string; authoredByMe: boolean }) {
  return (
    <SignButton
      label="Sign"
      okText="Signed. The CSO countersigns it in the admin console."
      authoredByMe={authoredByMe}
      noteLabel="You wrote this draft: say why no other laboratory lead can sign"
      onSign={(exceptionNote) => signConfigAsLeadAction({ configId, exceptionNote })}
    />
  );
}
