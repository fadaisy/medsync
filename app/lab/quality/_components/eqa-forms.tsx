"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill, LAB3 } from "@/content/lab-phase-3";
import {
  recordAltAssessmentAction,
  recordEqaResultsAction,
  recordEqaScoresAction,
  recordRoundAction,
  saveEqaSettingsAction,
  saveSchemeAction,
} from "@/lib/lab/eqa-actions";
import { QUALITY } from "../_lib/copy";
import { inputClass, num, Pop, selectClass } from "../../_components/pop";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";
import { QcChip } from "./qc-chip";

const E = QUALITY.eqa;
type Test = { code: string; display: string };
type Sample = {
  sampleId: string;
  conceptId: string;
  analyte: string;
  kit?: string | null;
  ours?: string | null;
  target?: string | null;
  score?: "acceptable" | "unacceptable";
  scoreKind?: "percent" | "sdi" | "z" | null;
  scoreValue?: number | null;
  limit?: string | null;
  bias?: number | null;
};
export interface RoundView {
  id: string;
  scheme: string;
  label: string;
  receivedOn: string;
  submittedOn: string | null;
  scoredOn: string | null;
  reportPath: string | null;
  outcome: "acceptable" | "unacceptable" | "mixed" | null;
  ncId: string | null;
  ncNumber: string | null;
  samples: Sample[];
  testedBy: { userId: string; name: string }[];
  testerWarnings: string[];
}
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
const textarea =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-20 w-full rounded-sm border p-2 outline-none";

export const outcomeChip = (o: RoundView["outcome"]) =>
  o === null ? null : o === "acceptable" ? (
    <QcChip tone="passed">{E.outcome.acceptable}</QcChip>
  ) : (
    <QcChip tone={o === "unacceptable" ? "dark" : "amber"}>{E.outcome[o]}</QcChip>
  );

/* ─── EA-1: a scheme and its enrolment ─────────────────────────────────── */

export function SchemeDialog({
  tests,
  initial,
}: {
  tests: Test[];
  initial?: {
    id: string;
    name: string;
    provider: string;
    covers: string[];
    roundsPerYear: number | null;
    active: boolean;
  };
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: initial?.name ?? "",
    provider: initial?.provider ?? "",
    covers: new Set(initial?.covers ?? []),
    rounds: initial?.roundsPerYear ? String(initial.roundsPerYear) : "",
    active: initial?.active ?? true,
  });
  const save = () =>
    act(async () => {
      const r = await saveSchemeAction({
        id: initial?.id ?? null,
        name: f.name,
        provider: f.provider,
        covers: [...f.covers],
        roundsPerYear: num(f.rounds),
        active: f.active,
      });
      if (r.ok) setOpen(false);
      return r;
    }, E.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={initial ? E.editScheme : E.newScheme}
        sr={initial?.name}
        title={initial ? initial.name : E.newScheme}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {E.save}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={E.name}>
            <Input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={E.provider}>
            <Input
              value={f.provider}
              onChange={(e) => setF({ ...f, provider: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={E.roundsPerYear}>
            <Input
              inputMode="numeric"
              value={f.rounds}
              onChange={(e) => setF({ ...f, rounds: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-s text-muted-foreground mb-1">{E.covers}</legend>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
            {tests.map((t) => (
              <label
                key={t.code}
                className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8"
              >
                <input
                  type="checkbox"
                  checked={f.covers.has(t.code)}
                  onChange={(e) => {
                    const c = new Set(f.covers);
                    if (e.target.checked) c.add(t.code);
                    else c.delete(t.code);
                    setF({ ...f, covers: c });
                  }}
                />
                {t.display}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8">
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => setF({ ...f, active: e.target.checked })}
          />
          {E.active}
        </label>
      </Pop>
      <Said message={message} />
    </div>
  );
}

/* ─── EA-2: a panel received ───────────────────────────────────────────── */

export function RoundDialog({ schemes }: { schemes: { id: string; name: string }[] }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    schemeId: schemes[0]?.id ?? "",
    label: "",
    receivedOn: today(),
    dueOn: "",
  });
  const [rows, setRows] = useState([{ sampleId: "", conceptId: "", kit: "" }]);
  const save = () =>
    act(async () => {
      const r = await recordRoundAction({
        ...f,
        dueOn: f.dueOn || null,
        samples: rows.map((x) => ({ ...x, kit: x.kit.trim() || null })),
      });
      if (r.ok) setOpen(false);
      return r;
    }, E.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={E.newRound}
        title={E.newRound}
        width="wide"
        variant="primary"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {E.save}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={E.scheme}>
            <select
              value={f.schemeId}
              onChange={(e) => setF({ ...f, schemeId: e.target.value })}
              className={selectClass}
            >
              {schemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={E.label}>
            <Input
              value={f.label}
              onChange={(e) => setF({ ...f, label: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={E.receivedOn}>
            <Input
              type="date"
              value={f.receivedOn}
              onChange={(e) => setF({ ...f, receivedOn: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={E.dueOn}>
            <Input
              type="date"
              value={f.dueOn}
              onChange={(e) => setF({ ...f, dueOn: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-s text-muted-foreground mb-1">{E.samples}</legend>
          {rows.map((x, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-3">
              {(["sampleId", "conceptId", "kit"] as const).map((k) => (
                <Field
                  key={k}
                  label={k === "sampleId" ? E.sampleId : k === "conceptId" ? E.analyte : E.kit}
                >
                  <Input
                    value={x[k]}
                    placeholder={k === "conceptId" ? "obs.potassium" : undefined}
                    onChange={(e) =>
                      setRows(rows.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)))
                    }
                    className={k === "conceptId" ? `${inputClass} font-mono` : inputClass}
                  />
                </Field>
              ))}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-fit sm:min-h-8"
            onClick={() => setRows([...rows, { sampleId: "", conceptId: "", kit: "" }])}
          >
            {E.addSample}
          </Button>
        </fieldset>
      </Pop>
      <Said message={message} />
    </div>
  );
}

/* ─── EA-2: our results, testers, submission (the tester check warns) ───── */

export function ResultsDialog({
  round,
  staff,
}: {
  round: RoundView;
  staff: { userId: string; name: string }[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [ours, setOurs] = useState<Record<string, string>>({});
  const [by, setBy] = useState<Set<string>>(new Set());
  const [submittedOn, setSubmittedOn] = useState(today());
  const [warned, setWarned] = useState<string[]>([]);
  const save = () =>
    act(async () => {
      const r = await recordEqaResultsAction({
        roundId: round.id,
        results: round.samples.map((x) => ({ sampleId: x.sampleId, ours: ours[x.sampleId] ?? "" })),
        testedBy: [...by],
        submittedOn,
      });
      if (r.ok) {
        setOpen(false);
        setWarned(
          (r.warnings ?? []).map((u) => staff.find((s) => s.userId === u)?.name ?? "Staff"),
        );
      }
      return r;
    }, E.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={E.results}
        sr={`${round.scheme} ${round.label}`}
        title={`${E.results}: ${round.scheme} ${round.label}`}
        lede={LAB3.eqaTester}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {E.save}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {round.samples.map((x) => (
            <Field key={x.sampleId} label={`${x.sampleId} · ${x.analyte}`}>
              <Input
                value={ours[x.sampleId] ?? ""}
                onChange={(e) => setOurs({ ...ours, [x.sampleId]: e.target.value })}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-body-s text-muted-foreground mb-1">{E.testedBy}</legend>
          {staff.map((s) => (
            <label
              key={s.userId}
              className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-8"
            >
              <input
                type="checkbox"
                checked={by.has(s.userId)}
                onChange={(e) => {
                  const n = new Set(by);
                  if (e.target.checked) n.add(s.userId);
                  else n.delete(s.userId);
                  setBy(n);
                }}
              />
              {s.name}
            </label>
          ))}
        </fieldset>
        <Field label={E.submittedOn}>
          <Input
            type="date"
            value={submittedOn}
            onChange={(e) => setSubmittedOn(e.target.value)}
            className={`${inputClass} max-w-48`}
          />
        </Field>
      </Pop>
      <Said message={message} />
      {warned.length ? <QcChip tone="amber">{E.testerWarning(warned.join(", "))}</QcChip> : null}
    </div>
  );
}

/* ─── EA-3: the provider's scores, as reported ─────────────────────────── */

export function ScoresDialog({ round }: { round: RoundView }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const blank = { target: "", score: "", scoreKind: "", scoreValue: "", limit: "", bias: "" };
  const [rows, setRows] = useState<Record<string, typeof blank>>(
    Object.fromEntries(round.samples.map((x) => [x.sampleId, blank])),
  );
  const [f, setF] = useState({ scoredOn: today(), reportPath: "" });
  const set = (id: string, k: keyof typeof blank, v: string) =>
    setRows({ ...rows, [id]: { ...rows[id]!, [k]: v } });
  const save = () =>
    act(async () => {
      const r = await recordEqaScoresAction({
        roundId: round.id,
        scoredOn: f.scoredOn,
        reportPath: f.reportPath.trim() || null,
        scores: round.samples.map((x) => {
          const v = rows[x.sampleId]!;
          return {
            sampleId: x.sampleId,
            target: v.target.trim() || null,
            score: v.score || null,
            scoreKind: v.scoreKind || null,
            scoreValue: num(v.scoreValue),
            limit: v.limit.trim() || null,
            bias: num(v.bias),
          };
        }),
      });
      if (r.ok) setOpen(false);
      return r;
    }, E.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={E.scores}
        sr={`${round.scheme} ${round.label}`}
        title={`${E.scores}: ${round.scheme} ${round.label}`}
        lede={E.scoresLede}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {E.save}
          </Button>
        }
      >
        {round.samples.map((x) => (
          <fieldset key={x.sampleId} className="grid gap-3 sm:grid-cols-6">
            <legend className="text-body-s mb-1 font-medium">{`${x.sampleId} · ${x.analyte} · ${E.ours.toLowerCase()} ${x.ours ?? "—"}`}</legend>
            <Field label={E.target}>
              <Input
                value={rows[x.sampleId]!.target}
                onChange={(e) => set(x.sampleId, "target", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={E.score}>
              <select
                value={rows[x.sampleId]!.score}
                onChange={(e) => set(x.sampleId, "score", e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                <option value="acceptable">{E.outcome.acceptable}</option>
                <option value="unacceptable">{E.outcome.unacceptable}</option>
              </select>
            </Field>
            <Field label={E.scoreKind}>
              <select
                value={rows[x.sampleId]!.scoreKind}
                onChange={(e) => set(x.sampleId, "scoreKind", e.target.value)}
                className={selectClass}
              >
                <option value="">—</option>
                {(["percent", "sdi", "z"] as const).map((k) => (
                  <option key={k} value={k}>
                    {E.scoreKinds[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={E.scoreValue}>
              <Input
                inputMode="decimal"
                value={rows[x.sampleId]!.scoreValue}
                onChange={(e) => set(x.sampleId, "scoreValue", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={E.limit}>
              <Input
                value={rows[x.sampleId]!.limit}
                onChange={(e) => set(x.sampleId, "limit", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={E.bias}>
              <Input
                inputMode="decimal"
                value={rows[x.sampleId]!.bias}
                onChange={(e) => set(x.sampleId, "bias", e.target.value)}
                className={inputClass}
              />
            </Field>
          </fieldset>
        ))}
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Field label={E.scoredOn}>
            <Input
              type="date"
              value={f.scoredOn}
              onChange={(e) => setF({ ...f, scoredOn: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={E.reportPath}>
            <Input
              value={f.reportPath}
              placeholder={E.reportHint}
              onChange={(e) => setF({ ...f, reportPath: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      </Pop>
      <Said message={message} />
    </div>
  );
}

/* ─── The round panel (artboard 8's side card) ─────────────────────────── */

export function RoundPanel({ round }: { round: RoundView }) {
  const [open, setOpen] = useState(false);
  const scored = round.samples.filter((x) => x.score);
  return (
    <Pop
      label={E.open}
      sr={`${round.scheme} ${round.label}`}
      title={`${round.scheme} · ${round.label}`}
      width="wide"
      variant="ghost"
      open={open}
      setOpen={setOpen}
    >
      <table className="text-body-s w-full border-collapse text-left">
        <caption className="sr-only">{E.samples}</caption>
        <thead>
          <tr className="border-border border-b">
            {E.roundColumns.map((h) => (
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
          {round.samples.map((x) => (
            <tr key={x.sampleId} className="border-ink-150 border-b last:border-b-0">
              <td className="py-1 pr-3 font-mono">{x.sampleId}</td>
              <td className="py-1 pr-3">{x.kit ? `${x.analyte} · ${x.kit}` : x.analyte}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{x.ours ?? "—"}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{x.target ?? "—"}</td>
              <td className="py-1 pr-3">
                {x.score ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <QcChip tone={x.score === "acceptable" ? "passed" : "dark"}>
                      {E.outcome[x.score]}
                    </QcChip>
                    {x.scoreValue != null
                      ? `${x.scoreValue}${x.scoreKind ? ` ${E.scoreKinds[x.scoreKind]}` : ""}`
                      : null}
                    {x.limit ? `(${x.limit})` : null}
                  </span>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {scored.length ? (
        <p className="text-body-s">
          {E.ofAcceptable(scored.filter((x) => x.score === "acceptable").length, scored.length)}
        </p>
      ) : null}
      {round.testedBy.length ? (
        <p className="text-body-s">{`${E.testedBy}: ${round.testedBy.map((t) => t.name).join(", ")}. ${LAB3.eqaTester}`}</p>
      ) : null}
      {round.testerWarnings.length ? (
        <QcChip tone="amber">{E.testerWarning(round.testerWarnings.join(", "))}</QcChip>
      ) : null}
      {round.ncId && round.ncNumber ? (
        <a
          href={`/lab/quality/nonconformities/${round.ncId}`}
          className="text-body-s font-medium text-teal-700 underline-offset-4 hover:underline"
        >
          {E.ncOpened(round.ncNumber)}
        </a>
      ) : null}
      <p className="text-body-s text-muted-foreground">
        {round.reportPath ? E.report(round.reportPath) : E.noReport}
      </p>
    </Pop>
  );
}

/* ─── EA-5: coverage and alternative assessments ───────────────────────── */

export function CoverageDialog({
  missing,
  total,
}: {
  missing: { testCode: string; display: string }[];
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const words = fill(LAB3.noEqa, { n: missing.length, m: total });
  return (
    <Pop label={words} title={E.coverageTitle} lede={E.coverageNote} open={open} setOpen={setOpen}>
      <ul className="text-body-s flex list-disc flex-col gap-1 pl-5">
        {missing.map((t) => (
          <li key={t.testCode}>{t.display}</li>
        ))}
      </ul>
    </Pop>
  );
}

export function AltDialog({ tests }: { tests: Test[] }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    testCode: tests[0]?.code ?? "",
    method: "split_sample" as "split_sample" | "interlab" | "retained_samples",
    partner: "",
    doneOn: today(),
    results: "",
    conclusion: "",
  });
  const save = () =>
    act(async () => {
      const r = await recordAltAssessmentAction({ ...f, partner: f.partner.trim() || null });
      if (r.ok) setOpen(false);
      return r;
    }, E.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={E.alt}
        title={E.altTitle}
        lede={E.coverageNote}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {E.save}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={E.test}>
            <select
              value={f.testCode}
              onChange={(e) => setF({ ...f, testCode: e.target.value })}
              className={selectClass}
            >
              {tests.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.display}
                </option>
              ))}
            </select>
          </Field>
          <Field label={E.method}>
            <select
              value={f.method}
              onChange={(e) => setF({ ...f, method: e.target.value as typeof f.method })}
              className={selectClass}
            >
              {(["split_sample", "interlab", "retained_samples"] as const).map((m) => (
                <option key={m} value={m}>
                  {E.methods[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={E.partner}>
            <Input
              value={f.partner}
              disabled={f.method === "retained_samples"}
              onChange={(e) => setF({ ...f, partner: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={E.doneOn}>
            <Input
              type="date"
              value={f.doneOn}
              onChange={(e) => setF({ ...f, doneOn: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label={E.altResults}>
          <textarea
            value={f.results}
            onChange={(e) => setF({ ...f, results: e.target.value })}
            className={textarea}
          />
        </Field>
        <Field label={E.conclusion}>
          <textarea
            value={f.conclusion}
            onChange={(e) => setF({ ...f, conclusion: e.target.value })}
            className={textarea}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}

export function EqaSettingsDialog({
  initial,
}: {
  initial: { testerWindowDays: number; testerWindowSet: boolean; altPeriodDays: number | null };
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    window: initial.testerWindowSet ? String(initial.testerWindowDays) : "",
    period: initial.altPeriodDays ? String(initial.altPeriodDays) : "",
  });
  const save = () =>
    act(async () => {
      const r = await saveEqaSettingsAction({
        eqaTesterWindowDays: num(f.window),
        altPeriodDays: num(f.period),
      });
      if (r.ok) setOpen(false);
      return r;
    }, E.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={E.editScheme}
        sr={E.settings}
        title={E.settings}
        lede={E.settingsLede}
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            {E.save}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={E.testerWindow}>
            <Input
              inputMode="numeric"
              value={f.window}
              onChange={(e) => setF({ ...f, window: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={E.altPeriod}>
            <Input
              inputMode="numeric"
              value={f.period}
              onChange={(e) => setF({ ...f, period: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      </Pop>
      <Said message={message} />
    </div>
  );
}
