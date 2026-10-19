"use client";

import type { QcPlan } from "@/lib/lab/qc";
import type { QcRunPoints, RuleId } from "@/lib/lab/qc-rules";
import type { Payload } from "@/lib/lab/signed-config";
import { useState } from "react";

import { FreshFactor, needsFreshFactor } from "@/components/medsync/fresh-factor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fill, LAB3 } from "@/content/lab-phase-3";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { targetFor } from "@/lib/lab/qc";
import {
  recordKitQcAction,
  recordQcRunAction,
  saveKitQcRuleAction,
  saveQcPlanAction,
  saveQcPolicyAction,
  setLabTargetAction,
  signQcConfigAction,
} from "@/lib/lab/qc-actions";
import { evaluateRules, RULE_IDS, runDecision, zScore } from "@/lib/lab/qc-rules";
import { cn } from "@/lib/utils";
import { QUALITY } from "../_lib/copy";
import { inputClass, newKey, num, Pop, selectClass } from "../../_components/pop";
import { LabButton } from "../../_components/v2/button";
import { Field, Said, useAct } from "../../setup/criticals/_components/setup-forms";
import { ActButton } from "./act-button";

type Result = { ok: true } | { ok: false; error: string };
const Q = QUALITY;
const sd = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(1)} SD`;
const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** The signed meaning of a rule, from Appendix A "Rule meanings" (draft until the lead checks it). */
export const ruleMeaning = (rule: string) =>
  LAB3.ruleMeanings
    .split(/(?<=\.) /)
    .find((m) => m.startsWith(`${rule}:`))
    ?.slice(rule.length + 1)
    .trim()
    .replace(/\.$/, "") ?? "";

/* ─── Signing (the lead; a fresh second factor) ───────────────────────── */

export function SignDraft({ configId, author }: { configId: string; author: boolean }) {
  const { pending, message, act, setMessage } = useAct();
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState(false);
  const sign = () =>
    act(async (): Promise<Result> => {
      const r = await signQcConfigAction({ configId, exceptionNote: note.trim() || null });
      if (needsFreshFactor(r)) {
        setFresh(true);
        return { ok: false, error: "Enter your authenticator code to sign." };
      }
      return r;
    }, Q.qc.signed);
  return (
    <div className="flex flex-col gap-2">
      {author ? (
        <Field label={Q.qc.exception}>
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
        <ActButton
          type="button"
          variant="secondary"
          className="min-h-11 w-fit sm:min-h-8"
          busy={pending}
          onClick={sign}
        >
          {Q.qc.sign}
        </ActButton>
      )}
      <Said message={message} />
    </div>
  );
}

/* ─── The QC policy (QQ-3; lead + CSO) ──────────────────────────────── */

export function PolicyDialog({ initial }: { initial: Payload<"qc_policy"> | null }) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    runs: initial ? String(initial.minRunsForTarget) : "",
    days: initial ? String(initial.minDaysForTarget) : "",
    sources: initial?.sources.join("\n") ?? "",
  });
  const save = () =>
    act(async () => {
      const r = await saveQcPolicyAction({
        minRunsForTarget: num(f.runs),
        minDaysForTarget: num(f.days),
        sources: lines(f.sources),
      });
      if (r.ok) setOpen(false);
      return r;
    }, Q.qc.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={Q.plan.edit}
        sr={Q.qc.policy}
        title={Q.qc.policy}
        lede={Q.qc.policyLede}
        open={open}
        setOpen={setOpen}
        action={
          <ActButton variant="primary" type="button" onClick={save} busy={pending}>
            {Q.qc.save}
          </ActButton>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={Q.qc.minRuns}>
            <Input
              inputMode="numeric"
              value={f.runs}
              onChange={(e) => setF({ ...f, runs: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={Q.qc.minDays}>
            <Input
              inputMode="numeric"
              value={f.days}
              onChange={(e) => setF({ ...f, days: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label={Q.qc.sources}>
          <textarea
            value={f.sources}
            onChange={(e) => setF({ ...f, sources: e.target.value })}
            rows={3}
            className="border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border px-2.5 py-2 outline-none"
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}

/* ─── The QC plan editor (QQ-2; lead, then the CSO) ─────────────────── */

type Lot = { id: string; lot: string; itemId: string };
type LevelDraft = { label: string; controlItemId: string; lotId: string; mean: string; sd: string };

export function PlanDialog({
  deviceId,
  conceptId,
  initial,
  items,
  lots,
}: {
  deviceId: string;
  conceptId: string;
  initial: Payload<"qc_plan"> | null;
  items: { id: string; name: string }[];
  lots: Lot[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [levels, setLevels] = useState<LevelDraft[]>(
    (initial?.levels ?? [{ level: 1, label: "", controlItemId: "" }]).map((l) => {
      const t = initial?.targets.find((x) => x.level === l.level);
      return {
        label: l.label,
        controlItemId: l.controlItemId,
        lotId: t?.controlLotId ?? "",
        mean: t ? String(t.mean) : "",
        sd: t ? String(t.sd) : "",
      };
    }),
  );
  const [freq, setFreq] = useState(initial?.frequency.kind ?? "each_day_before_patients");
  const [n, setN] = useState(initial?.frequency.n ? String(initial.frequency.n) : "");
  const [reject, setReject] = useState(new Set<string>(initial?.rejectRules ?? []));
  const [warn, setWarn] = useState(new Set<string>(initial?.warnRules ?? []));
  const [tenX, setTenX] = useState(initial?.tenXAcrossLevels ?? false);
  const [hold, setHold] = useState(initial?.holdWhenNotRun ?? false);
  const [source, setSource] = useState(initial?.source ?? "");
  const setLevel = (i: number, patch: Partial<LevelDraft>) =>
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const toggle = (set: Set<string>, put: (s: Set<string>) => void, r: string, on: boolean) => {
    const s = new Set(set);
    if (on) s.add(r);
    else s.delete(r);
    put(s);
  };
  const save = () =>
    act(async () => {
      const r = await saveQcPlanAction({
        deviceId,
        conceptId,
        payload: {
          unit: unit.trim(),
          levels: levels.map((l, i) => ({
            level: i + 1,
            label: l.label.trim(),
            controlItemId: l.controlItemId,
          })),
          frequency: { kind: freq, ...(freq === "per_n_samples" ? { n: num(n) } : {}) },
          rejectRules: [...reject],
          warnRules: [...warn],
          tenXAcrossLevels: tenX,
          holdWhenNotRun: hold,
          targets: levels.map((l, i) => {
            const old = initial?.targets.find(
              (t) => t.level === i + 1 && t.controlLotId === l.lotId,
            );
            return {
              level: i + 1,
              controlLotId: l.lotId,
              mean: num(l.mean),
              sd: num(l.sd),
              // QQ-3: a typed target is the maker's range; only "Set this lab's target" makes it the lab's own.
              source:
                old && old.mean === num(l.mean) && old.sd === num(l.sd)
                  ? old.source
                  : "maker_provisional",
              ...(old?.source === "lab" ? { runs: old.runs, from: old.from, to: old.to } : {}),
            };
          }),
          source: source.trim(),
        },
      });
      if (r.ok) setOpen(false);
      return r;
    }, Q.qc.saved);
  const ruleBoxes = (set: Set<string>, put: (s: Set<string>) => void, legend: string) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-body-s text-muted-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {RULE_IDS.map((r) => (
          <label
            key={r}
            className="text-body-s flex min-h-11 items-center gap-2 font-mono sm:min-h-0"
          >
            <input
              type="checkbox"
              checked={set.has(r)}
              onChange={(e) => toggle(set, put, r, e.target.checked)}
            />
            {r}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={initial ? Q.plan.edit : Q.plan.write}
        title={Q.plan.title}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <ActButton variant="primary" type="button" onClick={save} busy={pending}>
            {Q.qc.save}
          </ActButton>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Unit">
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={40}
              className={inputClass}
            />
          </Field>
          <Field label={Q.plan.frequency}>
            <select
              value={freq}
              onChange={(e) => setFreq(e.target.value as typeof freq)}
              className={selectClass}
            >
              {Object.entries(Q.plan.frequencies).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {freq === "per_n_samples" ? (
            <Field label="n">
              <Input
                inputMode="numeric"
                value={n}
                onChange={(e) => setN(e.target.value)}
                className={inputClass}
              />
            </Field>
          ) : null}
        </div>
        {levels.map((l, i) => (
          <fieldset key={i} className="grid gap-3 border-t pt-3 sm:grid-cols-5">
            <legend className="text-body-s font-medium">{`${Q.run.level} ${i + 1}`}</legend>
            <Field label="Label">
              <Input
                value={l.label}
                onChange={(e) => setLevel(i, { label: e.target.value })}
                maxLength={60}
                className={inputClass}
              />
            </Field>
            <Field label="Control material">
              <select
                value={l.controlItemId}
                onChange={(e) => setLevel(i, { controlItemId: e.target.value, lotId: "" })}
                className={selectClass}
              >
                <option value="">Choose</option>
                {items.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Control lot">
              <select
                value={l.lotId}
                onChange={(e) => setLevel(i, { lotId: e.target.value })}
                className={selectClass}
              >
                <option value="">Choose</option>
                {lots
                  .filter((x) => x.itemId === l.controlItemId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.lot}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Target (mean)">
              <Input
                inputMode="decimal"
                value={l.mean}
                onChange={(e) => setLevel(i, { mean: e.target.value })}
                className={cn(inputClass, "tabular-nums")}
              />
            </Field>
            <Field label="SD">
              <Input
                inputMode="decimal"
                value={l.sd}
                onChange={(e) => setLevel(i, { sd: e.target.value })}
                className={cn(inputClass, "tabular-nums")}
              />
            </Field>
          </fieldset>
        ))}
        <div className="flex gap-2">
          <LabButton
            type="button"
            disabledReason={levels.length >= 3 ? LABWS2_QUALITY.sweep.addLevelMax : null}
            onClick={() =>
              setLevels((ls) => [
                ...ls,
                { label: "", controlItemId: "", lotId: "", mean: "", sd: "" },
              ])
            }
          >
            Add a level
          </LabButton>
          <LabButton
            type="button"
            variant="quiet"
            disabledReason={levels.length <= 1 ? LABWS2_QUALITY.sweep.removeLevelMin : null}
            onClick={() => setLevels((ls) => ls.slice(0, -1))}
          >
            Remove the last level
          </LabButton>
        </div>
        {ruleBoxes(reject, setReject, Q.plan.rejectOn)}
        {ruleBoxes(warn, setWarn, Q.plan.warnOn)}
        <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
          <input type="checkbox" checked={tenX} onChange={(e) => setTenX(e.target.checked)} />
          10-x also across levels
        </label>
        <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
          {Q.plan.holdNotRun}
        </label>
        <Field label="Source">
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}

export function SetTarget({
  deviceId,
  conceptId,
  level,
  controlLotId,
  label,
}: {
  deviceId: string;
  conceptId: string;
  level: number;
  controlLotId: string;
  label: string;
}) {
  const { pending, message, act } = useAct();
  return (
    <div className="flex flex-col gap-1">
      <ActButton
        type="button"
        variant="secondary"
        className="min-h-11 w-fit sm:min-h-8"
        busy={pending}
        onClick={() =>
          act(() => setLabTargetAction({ deviceId, conceptId, level, controlLotId }), Q.qc.saved)
        }
      >
        {Q.plan.setTarget(label)}
      </ActButton>
      <Said message={message} />
    </div>
  );
}

/* ─── This run (§5.2): the engine previews, the server decides again ─── */

export function RunForm({
  deviceId,
  conceptId,
  analyte,
  analyser,
  plan,
  lotsByLevel,
  history,
}: {
  deviceId: string;
  conceptId: string;
  analyte: string;
  analyser: string;
  plan: QcPlan & { unit: string };
  lotsByLevel: Record<number, { id: string; lot: string }[]>;
  history: QcRunPoints[];
}) {
  const { pending, message, act } = useAct();
  const [lines_, setLines] = useState(
    Object.fromEntries(
      plan.levels.map((l) => {
        // The lot the plan has a target for comes first; otherwise the first lot of the material.
        const lots = lotsByLevel[l.level] ?? [];
        const planned = plan.targets.find(
          (t) => t.level === l.level && lots.some((x) => x.id === t.controlLotId),
        );
        return [l.level, { lotId: planned?.controlLotId ?? lots[0]?.id ?? "", value: "" }];
      }),
    ),
  );
  const [step, setStep] = useState("");
  const [other, setOther] = useState("");
  const rows = plan.levels.map((l) => {
    const line = lines_[l.level]!;
    const t = line.lotId ? targetFor(plan, l.level, line.lotId) : null;
    const v = num(line.value);
    return { l, line, t, v, z: t && v !== null && Number.isFinite(v) ? zScore(v, t) : null };
  });
  const ready = rows.every((r) => r.z !== null);
  const breaks = ready
    ? evaluateRules(
        plan,
        {
          id: "this",
          planVersion: plan.version,
          values: rows.map((r) => ({ level: r.l.level, lotId: r.line.lotId, z: r.z! })),
        },
        history,
      )
    : [];
  const decision = ready ? runDecision(breaks) : null;
  const rejectBreaks = breaks.filter((b) => b.kind === "reject");
  const rulesOf = (level: number) => [
    ...new Set(
      breaks
        .filter((b) => b.points.some((p) => p.level === level && p.runId === "this"))
        .map((b) => b.rule),
    ),
  ];
  const first = step === "Other" ? other.trim() : step;
  const submit = () =>
    act(async () => {
      const r = await recordQcRunAction({
        deviceId,
        conceptId,
        values: rows.map((x) => ({ level: x.l.level, lotId: x.line.lotId, value: x.v })),
        expect: decision,
        firstStep: decision === "rejected" ? first || null : null,
        note: null,
        runAt: new Date().toISOString(),
        clientKey: newKey(),
      });
      if (r.ok)
        setLines((ls) =>
          Object.fromEntries(Object.entries(ls).map(([k, x]) => [k, { ...x, value: "" }])),
        );
      return r;
    }, Q.run.recorded);
  const failedLevels = [...new Set(rejectBreaks.flatMap((b) => b.points.map((p) => p.level)))];
  const levelWords = failedLevels
    .map((lv) => plan.levels.find((x) => x.level === lv)?.label ?? `level ${lv}`)
    .join(" and ");
  const rejectRules = [...new Set(rejectBreaks.map((b) => b.rule))] as RuleId[];
  return (
    <section
      aria-labelledby="this-run"
      className="border-border bg-card shadow-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <h2 id="this-run" className="text-heading-s font-medium">
        {Q.run.thisRun}
      </h2>
      <div className="overflow-x-auto">
        <table className="text-body-s w-full border-collapse text-left">
          <thead>
            <tr className="text-caption text-muted-foreground border-b">
              {Q.run.columns.map((c) => (
                <th key={c} scope="col" className="py-2 pr-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ l, line, t, z }) => (
              <tr key={l.level} className="border-b align-top">
                <th scope="row" className="py-2 pr-3 font-medium">
                  {l.label}
                </th>
                <td className="py-2 pr-3">
                  {lotsByLevel[l.level]?.length ? (
                    <select
                      aria-label={`Control lot for ${l.label}`}
                      value={line.lotId}
                      onChange={(e) =>
                        setLines({ ...lines_, [l.level]: { ...line, lotId: e.target.value } })
                      }
                      className={selectClass}
                    >
                      {lotsByLevel[l.level]!.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.lot}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-muted-foreground">{Q.run.noLots}</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <Input
                    aria-label={`Result for ${l.label}, ${plan.unit}`}
                    inputMode="decimal"
                    value={line.value}
                    onChange={(e) =>
                      setLines({ ...lines_, [l.level]: { ...line, value: e.target.value } })
                    }
                    className={cn(inputClass, "w-28 text-right tabular-nums")}
                  />
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  {t ? `${t.mean} ± ${t.sd} ${plan.unit}` : "No target for this lot"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{z === null ? "—" : sd(z)}</td>
                <td className="py-2 pr-3">
                  {z === null ? "—" : rulesOf(l.level).join(" · ") || Q.run.noneBroken}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {decision === "rejected" ? (
        <div className="bg-status-caution-bg border-status-caution-fg text-body-s dark:text-status-caution-fg rounded-lg border px-3.5 py-3 text-amber-800">
          <p>
            {fill(LAB3.rejectedRun.replaceAll("**", ""), {
              rules: rejectRules.join(" and "),
              level: levelWords,
              meaning: rejectRules.map(ruleMeaning).filter(Boolean).join("; "),
              Analyte: analyte,
              analyser,
            })}
          </p>
        </div>
      ) : decision === "warning" ? (
        <p className="text-body-s">
          {fill(LAB3.warningRun, {
            rule: [...new Set(breaks.map((b) => b.rule))].join(", "),
            level: [
              ...new Set(
                breaks.flatMap((b) =>
                  b.points
                    .filter((p) => p.runId === "this")
                    .map((p) => plan.levels.find((x) => x.level === p.level)?.label ?? ""),
                ),
              ),
            ].join(" and "),
          })}
        </p>
      ) : null}
      {decision === "rejected" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={Q.run.firstStep}>
            <select value={step} onChange={(e) => setStep(e.target.value)} className={selectClass}>
              <option value="">Choose</option>
              {Q.run.steps.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          {step === "Other" ? (
            <Field label={Q.run.other}>
              <Input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                maxLength={300}
                className={inputClass}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
      <div>
        <ActButton
          type="button"
          variant="primary"
          onClick={submit}
          busy={pending}
          disabledReason={
            !decision
              ? LABWS2_QUALITY.sweep.runNoDecision
              : decision === "rejected" && first.length < 3
                ? LABWS2_QUALITY.sweep.runNoStep
                : null
          }
        >
          {decision === "rejected" ? Q.run.reject(analyte.toLowerCase()) : Q.run.accept}
        </ActButton>
      </div>
      <Said message={message} />
    </section>
  );
}

/* ─── Kits and stains (KQ-1..KQ-5) ──────────────────────────────────── */

type KitRule = Payload<"kit_qc_rule">;

export function KitCheckDialog({
  lot,
  rule,
  due,
  answers,
}: {
  lot: { id: string; lot: string; name: string };
  rule: KitRule;
  due: string[];
  answers: { code: string; label: string }[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState(due[0] ?? rule.triggers[0]!.kind);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [met, setMet] = useState<Record<string, string[]>>({});
  const pass = rule.controls.every((c) =>
    "code" in c.expected
      ? codes[c.name] === c.expected.code
      : c.expected.passCriteria.every((k) => (met[c.name] ?? []).includes(k)),
  );
  const complete = rule.controls.every((c) => ("code" in c.expected ? !!codes[c.name] : true));
  const save = () =>
    act(async () => {
      const r = await recordKitQcAction({
        lotId: lot.id,
        trigger,
        observed: rule.controls.map((c) =>
          "code" in c.expected
            ? { name: c.name, code: codes[c.name] }
            : { name: c.name, met: met[c.name] ?? [] },
        ),
        clientKey: newKey(),
      });
      if (r.ok) setOpen(false);
      return r;
    }, Q.kits.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={Q.kits.record}
        sr={`${lot.name} ${lot.lot}`}
        title={`${lot.name} · ${lot.lot}`}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <LabButton
            type="button"
            onClick={save}
            busy={pending}
            disabledReason={complete ? null : LABWS2_QUALITY.sweep.kitIncomplete}
          >
            {Q.kits.save}
          </LabButton>
        }
      >
        <Field label="Why it is run">
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as typeof trigger)}
            className={selectClass}
          >
            {rule.triggers.map((t) => (
              <option key={t.kind} value={t.kind}>
                {Q.kits.triggers[t.kind]}
              </option>
            ))}
          </select>
        </Field>
        {rule.controls.map((c) =>
          "code" in c.expected ? (
            <fieldset key={c.name} className="flex flex-col gap-2">
              <legend className="text-body-s font-medium">{c.name}</legend>
              <div className="flex flex-wrap gap-4">
                {answers.map((a) => (
                  <label
                    key={a.code}
                    className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0"
                  >
                    <input
                      type="radio"
                      name={`ctl-${c.name}`}
                      checked={codes[c.name] === a.code}
                      onChange={() => setCodes({ ...codes, [c.name]: a.code })}
                    />
                    {a.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset key={c.name} className="flex flex-col gap-2">
              <legend className="text-body-s font-medium">{c.name}</legend>
              <p className="text-caption text-muted-foreground">{Q.kits.criteriaHelp}</p>
              {c.expected.passCriteria.map((k) => (
                <label key={k} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={(met[c.name] ?? []).includes(k)}
                    onChange={(e) =>
                      setMet({
                        ...met,
                        [c.name]: e.target.checked
                          ? [...(met[c.name] ?? []), k]
                          : (met[c.name] ?? []).filter((x) => x !== k),
                      })
                    }
                  />
                  {k}
                </label>
              ))}
            </fieldset>
          ),
        )}
        {complete ? (
          <p role="status" className="text-body-s font-medium">
            {pass ? Q.kits.passOutcome : Q.kits.failOutcome}
          </p>
        ) : null}
        {rule.hmisIqc ? (
          <p className="text-body-s text-muted-foreground">{Q.kits.hmisIqc}</p>
        ) : null}
        <p className="text-body-s text-muted-foreground">{Q.kits.caution}</p>
      </Pop>
      <Said message={message} />
    </div>
  );
}

type ControlDraft = { name: string; kind: "code" | "criteria"; code: string; criteria: string };

export function KitRuleDialog({
  itemId,
  name,
  initial,
}: {
  itemId: string;
  name: string;
  initial: KitRule | null;
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [triggers, setTriggers] = useState(
    new Set<string>(initial?.triggers.map((t) => t.kind) ?? []),
  );
  const [weekday, setWeekday] = useState(
    String(initial?.triggers.find((t) => t.kind === "schedule")?.weekday ?? 1),
  );
  const [controls, setControls] = useState<ControlDraft[]>(
    initial?.controls.map((c) =>
      "code" in c.expected
        ? { name: c.name, kind: "code", code: c.expected.code, criteria: "" }
        : {
            name: c.name,
            kind: "criteria",
            code: "",
            criteria: c.expected.passCriteria.join("\n"),
          },
    ) ?? [{ name: "", kind: "code", code: "", criteria: "" }],
  );
  const [required, setRequired] = useState(initial?.requiredBeforeUse ?? false);
  const [iqc, setIqc] = useState(initial?.hmisIqc ?? false);
  const [source, setSource] = useState(initial?.source ?? "");
  const setControl = (i: number, patch: Partial<ControlDraft>) =>
    setControls((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const save = () =>
    act(async () => {
      const r = await saveKitQcRuleAction({
        itemId,
        payload: {
          triggers: [...triggers].map((k) =>
            k === "schedule" ? { kind: k, weekday: Number(weekday) } : { kind: k },
          ),
          controls: controls.map((c) => ({
            name: c.name.trim(),
            expected:
              c.kind === "code" ? { code: c.code.trim() } : { passCriteria: lines(c.criteria) },
          })),
          requiredBeforeUse: required,
          hmisIqc: iqc,
          source: source.trim(),
        },
      });
      if (r.ok) setOpen(false);
      return r;
    }, Q.qc.saved);
  return (
    <div className="flex flex-col gap-1">
      <Pop
        label={initial ? Q.plan.edit : Q.kits.rule}
        variant="ghost"
        sr={name}
        title={`${Q.kits.rule} · ${name}`}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <ActButton variant="primary" type="button" onClick={save} busy={pending}>
            {Q.qc.save}
          </ActButton>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-s text-muted-foreground">Due when</legend>
          <div className="flex flex-wrap gap-3">
            {Object.entries(Q.kits.triggers).map(([k, v]) => (
              <label key={k} className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
                <input
                  type="checkbox"
                  checked={triggers.has(k)}
                  onChange={(e) => {
                    const s = new Set(triggers);
                    if (e.target.checked) s.add(k);
                    else s.delete(k);
                    setTriggers(s);
                  }}
                />
                {v}
              </label>
            ))}
          </div>
          {triggers.has("schedule") ? (
            <Field label="Weekly, on">
              <select
                value={weekday}
                onChange={(e) => setWeekday(e.target.value)}
                className={cn(selectClass, "max-w-xs")}
              >
                {Q.kits.weekdays.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </fieldset>
        {controls.map((c, i) => (
          <fieldset key={i} className="grid gap-3 border-t pt-3 sm:grid-cols-3">
            <legend className="text-body-s font-medium">{`Control ${i + 1}`}</legend>
            <Field label="Name">
              <Input
                value={c.name}
                onChange={(e) => setControl(i, { name: e.target.value })}
                maxLength={80}
                className={inputClass}
              />
            </Field>
            <Field label="Expected">
              <select
                value={c.kind}
                onChange={(e) => setControl(i, { kind: e.target.value as ControlDraft["kind"] })}
                className={selectClass}
              >
                <option value="code">A coded answer</option>
                <option value="criteria">Pass criteria (stain)</option>
              </select>
            </Field>
            {c.kind === "code" ? (
              <Field label="Answer code">
                <Input
                  value={c.code}
                  onChange={(e) => setControl(i, { code: e.target.value })}
                  maxLength={60}
                  className={cn(inputClass, "font-mono")}
                />
              </Field>
            ) : (
              <Field label="Criteria (one per line)">
                <textarea
                  value={c.criteria}
                  onChange={(e) => setControl(i, { criteria: e.target.value })}
                  rows={3}
                  className="border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border px-2.5 py-2 outline-none"
                />
              </Field>
            )}
          </fieldset>
        ))}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setControls([...controls, { name: "", kind: "code", code: "", criteria: "" }])
            }
          >
            Add a control
          </Button>
          <LabButton
            type="button"
            variant="quiet"
            disabledReason={controls.length <= 1 ? LABWS2_QUALITY.sweep.removeControlMin : null}
            onClick={() => setControls(controls.slice(0, -1))}
          >
            Remove the last control
          </LabButton>
        </div>
        <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          {Q.kits.requiredBeforeUse}
        </label>
        <label className="text-body-s flex min-h-11 items-center gap-2 sm:min-h-0">
          <input type="checkbox" checked={iqc} onChange={(e) => setIqc(e.target.checked)} />
          {Q.kits.hmisIqc}
        </label>
        <Field label="Source">
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            maxLength={500}
            className={inputClass}
          />
        </Field>
      </Pop>
      <Said message={message} />
    </div>
  );
}
