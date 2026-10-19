"use client";

import type { PlanAnalyser, PlanComponent } from "@/lib/lab/qc-plan-form";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { saveQcPlanAction } from "@/lib/lab/qc-actions";
import { planMissing, testOptions } from "@/lib/lab/qc-plan-form";
import { RULE_IDS } from "@/lib/lab/qc-rules";
import { cn } from "@/lib/utils";
import { QUALITY } from "../_lib/copy";
import { LabButton } from "../../_components/v2/button";
import { NumberStepper, PickField } from "../../_components/v2/fields";
import { EmptyState, Panel, Pill } from "../../_components/v2/kit";

const P = LABWS2_QUALITY.newPlan;
const FIELD =
  "bg-card text-foreground h-9 rounded-tide-field border border-input px-3 text-body-s outline-none focus-visible:border-ring focus-visible:shadow-focus";
type Freq = "each_day_before_patients" | "per_run" | "per_n_samples";

export interface ControlLot {
  id: string;
  lot: string;
  itemId: string;
  item: string;
  useBy: string | null;
}

export interface AnalyserPlan {
  deviceId: string;
  analyte: string;
  state: "signed" | "draft";
}

/** Toggle chips for a set of rule ids (identifiers, so code type is right here). */
function RuleChips({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby={id}>
      <span id={id} className="text-label text-foreground">
        {label}
      </span>
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
      <div className="flex flex-wrap gap-1.5">
        {RULE_IDS.map((r) => {
          const on = value.includes(r);
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
              className={cn(
                "focus-visible:shadow-focus h-8 rounded-full px-3 font-mono text-[12.5px] outline-none",
                on
                  ? "bg-tide-navy-900 text-tide-on-band"
                  : "bg-card text-foreground hover:bg-ink-50 shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
              )}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label text-foreground">{label}</span>
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
      {children}
    </label>
  );
}

/**
 * New QC plan (Lab Workspace v2, prompt 5.11; canvas QcPlan.dc.html). Every value is the lead's; nothing is
 * pre-filled with a number. It sends exactly what the plan dialog sends to `saveQcPlanAction` (a draft for the
 * lead and the CSO to sign): the concept id is still what is sent, but it is chosen by name and never shown.
 */
export function PlanForm({
  analysers,
  components,
  lots,
  plans,
  policySigned,
  initialAnalyser,
}: {
  analysers: readonly PlanAnalyser[];
  components: readonly PlanComponent[];
  lots: readonly ControlLot[];
  plans: readonly AnalyserPlan[];
  policySigned: { runs: number; days: number } | null;
  initialAnalyser?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [analyserId, setAnalyserId] = useState(
    analysers.some((a) => a.id === initialAnalyser)
      ? initialAnalyser!
      : analysers.length === 1
        ? analysers[0]!.id
        : "",
  );
  const [conceptId, setConceptId] = useState("");
  const [typedUnit, setTypedUnit] = useState("");
  const [count, setCount] = useState("");
  const [lotId, setLotId] = useState("");
  const [freq, setFreq] = useState<Freq | "">("");
  const [n, setN] = useState<number | null>(null);
  const [levels, setLevels] = useState([{ label: P.levelLabel(1), mean: "", sd: "" }]);
  const [reject, setReject] = useState<string[]>([]);
  const [warn, setWarn] = useState<string[]>([]);
  const [tenX, setTenX] = useState(false);
  const [hold, setHold] = useState(false);
  const [source, setSource] = useState("");

  const analyser = analysers.find((a) => a.id === analyserId) ?? null;
  const tests = useMemo(() => testOptions(components, analyser), [components, analyser]);
  const test = tests.find((t) => t.value === conceptId);
  const component = components.find((c) => c.conceptId === conceptId);
  const unit = component?.unit ?? typedUnit;
  const lot = lots.find((l) => l.id === lotId);
  const shown = levels.slice(0, Number(count) || 0);
  const missing = planMissing(
    {
      analyserId,
      conceptId,
      unit,
      lotId,
      levels: shown,
      frequency: freq,
      n,
      rejectRules: reject,
      source,
    },
    !!test && !test.unavailable,
  );

  const setCountTo = (v: string) => {
    setCount(v);
    const k = Number(v);
    setLevels((ls) =>
      Array.from(
        { length: k },
        (_, i) => ls[i] ?? { label: P.levelLabel(i + 1), mean: "", sd: "" },
      ),
    );
  };
  const setLevel = (i: number, patch: Partial<(typeof levels)[number]>) =>
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveQcPlanAction({
        deviceId: analyserId,
        conceptId,
        payload: {
          unit: unit.trim(),
          levels: shown.map((l, i) => ({
            level: i + 1,
            label: l.label.trim(),
            controlItemId: lot!.itemId,
          })),
          frequency: { kind: freq, ...(freq === "per_n_samples" ? { n } : {}) },
          rejectRules: reject,
          warnRules: warn,
          tenXAcrossLevels: tenX,
          holdWhenNotRun: hold,
          // QQ-3: a typed target is the maker's range; only "Set this lab's target" makes it the lab's own.
          targets: shown.map((l, i) => ({
            level: i + 1,
            controlLotId: lotId,
            mean: Number(l.mean),
            sd: Number(l.sd),
            source: "maker_provisional" as const,
          })),
          source: source.trim(),
        },
      });
      if (!r.ok) return setError(r.error);
      router.push("/lab/quality?tab=plans");
      router.refresh();
    });

  const onAnalyser = plans.filter((p) => p.deviceId === analyserId);

  if (!analysers.length) return <EmptyState title={P.noAnalyser} why={P.noAnalyserWhy} />;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel>
        <div className="grid gap-5 lg:grid-cols-2">
          <PickField
            label={P.analyser}
            hint={P.analyserHint}
            options={analysers.map((a) => ({
              value: a.id,
              label: a.model,
              detail: a.section ?? undefined,
            }))}
            value={analyserId}
            onChange={(v) => {
              setAnalyserId(v);
              setConceptId("");
            }}
          />
          <PickField
            label={P.test}
            hint={analyser ? P.testHint : P.testFirst}
            options={tests}
            value={conceptId}
            forceList
            onChange={setConceptId}
          />
          {test && !component?.unit ? (
            <Labelled label={P.unit} hint={P.unitHint}>
              <input
                value={typedUnit}
                maxLength={40}
                onChange={(e) => setTypedUnit(e.target.value)}
                className={FIELD}
              />
            </Labelled>
          ) : null}
          <PickField
            label={P.levels}
            hint={P.levelsHint}
            options={["1", "2", "3"].map((v) => ({ value: v, label: P.levelWord(Number(v)) }))}
            value={count}
            onChange={setCountTo}
            className="lg:col-span-2"
          />
          {lots.length ? (
            <PickField
              label={P.lot}
              hint={P.lotHint}
              options={lots.map((l) => ({
                value: l.id,
                label: l.item,
                detail: P.lotDetail(l.lot, l.useBy),
              }))}
              value={lotId}
              onChange={setLotId}
              forceList={lots.length > 4}
              className="lg:col-span-2"
            />
          ) : (
            <EmptyState compact title={P.noLots} why={P.noLotsWhy} className="lg:col-span-2" />
          )}
          <PickField
            label={P.targetSource}
            hint={P.targetHint}
            options={[
              { value: "maker", label: P.targetMaker },
              { value: "lab", label: P.targetLab, detail: P.targetLabDetail, unavailable: true },
            ]}
            value="maker"
            className="lg:col-span-2"
          />
          <PickField
            label={P.when}
            options={(["each_day_before_patients", "per_run", "per_n_samples"] as const).map(
              (k) => ({
                value: k,
                label: QUALITY.plan.frequencies[k]!,
              }),
            )}
            value={freq}
            onChange={(v) => setFreq(v as Freq)}
            className="lg:col-span-2"
          />
          {freq === "per_n_samples" ? (
            <NumberStepper
              label={P.everyN}
              value={n ?? 0}
              min={0}
              onChange={setN}
              effect={(x) => (x > 0 ? P.everyNEffect(x) : null)}
            />
          ) : null}
        </div>

        {shown.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label text-foreground mb-1">{P.perLevel}</legend>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-border border-b">
                    {P.levelColumns.map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className="text-caption text-muted-foreground h-9 px-2 text-left font-medium"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l, i) => (
                    <tr key={i} className="border-border/70 border-b last:border-b-0">
                      <th
                        scope="row"
                        className="text-body-s px-2 py-2 text-left font-medium whitespace-nowrap"
                      >
                        {P.levelLabel(i + 1)}
                      </th>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`${P.levelColumns[1]}, ${P.levelLabel(i + 1)}`}
                          value={l.label}
                          maxLength={60}
                          onChange={(e) => setLevel(i, { label: e.target.value })}
                          className={cn(FIELD, "w-36")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`${P.levelColumns[2]}, ${P.levelLabel(i + 1)}${unit ? `, ${unit}` : ""}`}
                          inputMode="decimal"
                          value={l.mean}
                          onChange={(e) => setLevel(i, { mean: e.target.value })}
                          className={cn(FIELD, "w-28 text-right tabular-nums")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          aria-label={`${P.levelColumns[3]}, ${P.levelLabel(i + 1)}${unit ? `, ${unit}` : ""}`}
                          inputMode="decimal"
                          value={l.sd}
                          onChange={(e) => setLevel(i, { sd: e.target.value })}
                          className={cn(FIELD, "w-28 text-right tabular-nums")}
                        />
                      </td>
                      <td className="text-body-s text-muted-foreground px-2 py-2 whitespace-nowrap">
                        {unit || "—"}
                      </td>
                      <td className="text-body-s text-muted-foreground px-2 py-2">{P.from}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <RuleChips label={P.rejectOn} hint={P.rulesHint} value={reject} onChange={setReject} />
          <RuleChips label={P.warnOn} value={warn} onChange={setWarn} />
          <label className="text-body-s flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={tenX} onChange={(e) => setTenX(e.target.checked)} />
            {P.tenX}
          </label>
          <label className="text-body-s flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
            {P.hold}
          </label>
          <Labelled label={P.source} hint={P.sourceHint}>
            <input
              value={source}
              maxLength={500}
              onChange={(e) => setSource(e.target.value)}
              className={FIELD}
            />
          </Labelled>
        </div>

        <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          <Link
            href="/lab/quality?tab=plans"
            className="text-body-s text-primary px-2 font-medium underline-offset-4 hover:underline"
          >
            {P.cancel}
          </Link>
          <LabButton
            variant="primary"
            busy={pending}
            disabledReason={missing.length ? P.missing(missing) : null}
            onClick={save}
          >
            {P.save}
          </LabButton>
        </div>
        <p role="status" aria-live="polite" className="text-body-s min-h-5">
          {error ? <StatusWord tone="caution">{error}</StatusWord> : null}
        </p>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel
          title={P.policy}
          action={policySigned ? null : <Pill tone="neutral">{P.policyNotSigned}</Pill>}
        >
          {policySigned ? (
            <p className="text-body-s">{P.policySigned(policySigned.runs, policySigned.days)}</p>
          ) : (
            <EmptyState
              compact
              title={P.policyEmpty}
              why={LABWS2.qc.policyNotSigned}
              action={
                <Link
                  href="/lab/quality?tab=plans#policy"
                  className="text-body-s text-primary font-medium underline-offset-4 hover:underline"
                >
                  {P.policyDraft}
                </Link>
              }
            />
          )}
        </Panel>
        <Panel title={P.onAnalyser}>
          {!analyser ? (
            <p className="text-body-s text-muted-foreground">{P.chooseAnalyser}</p>
          ) : onAnalyser.length === 0 ? (
            <p className="text-body-s text-muted-foreground">{P.onAnalyserNone}</p>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {onAnalyser.map((p) => (
                <li
                  key={`${p.analyte}-${p.state}`}
                  className="text-body-s flex items-center justify-between gap-2 py-2"
                >
                  <span>{p.analyte}</span>
                  <Pill tone={p.state === "signed" ? "passed" : "neutral"}>
                    {p.state === "signed" ? P.stateSigned : P.stateDraft}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
