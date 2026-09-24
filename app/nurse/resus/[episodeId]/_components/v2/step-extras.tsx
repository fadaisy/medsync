"use client";

import type { StepDraft } from "./step-panel-draft";
import type { AbcdeLetter } from "@/lib/resus/types";
import { useState } from "react";
import { ChevronDownIcon, ClipboardListIcon } from "lucide-react";

import { AIRWAY_DIFFICULTY } from "@/lib/resus/reference/airway-catalog";
import { STEP_LOCAL_CONTROLS } from "@/lib/resus/reference/presentation";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";
import { Chip } from "./step-panel-chips";
import { parseNum } from "./step-panel-draft";

/**
 * Resus Desk v2 — the per-step extras: A's difficult-airway screen (collapsed;
 * opens by itself when an advanced airway is indicated), D's GCS + glucose (and
 * AVPU under More signs), E's core temperature + the AMPLE drawer.
 */

interface ExtrasProps {
  step: AbcdeLetter;
  /** "step" = in the step body; "more" = inside More signs. */
  placement: "step" | "more";
  draft: StepDraft;
  update: (patch: Partial<StepDraft>) => void;
}

export function StepExtras({ step, placement, draft, update }: ExtrasProps) {
  if (step === "A" && placement === "step")
    return <DifficultAirway draft={draft} update={update} />;
  if (step === "D")
    return placement === "step" ? (
      <GcsGlucose draft={draft} update={update} />
    ) : (
      <Avpu draft={draft} update={update} />
    );
  if (step === "E" && placement === "step") return <TempAmple draft={draft} update={update} />;
  return null;
}
type Part = Omit<ExtrasProps, "step" | "placement">;
const OUTSTANDING = new Set([undefined, "indicated", "in_progress", "failed"]);
const SCREEN = STEP_LOCAL_CONTROLS.find((c) => c.id === "a_difficulty_screen");
const FIELD =
  "border-border bg-card text-body-l sm:text-body-m text-foreground min-h-11 rounded-md border px-3 font-mono tabular-nums outline-none focus-visible:border-teal-500 focus-visible:shadow-focus disabled:opacity-60";

/** A — LEMON / MOANS / RODS …: collapsed; opens by itself when an advanced airway is indicated. */
function DifficultAirway({ draft, update }: Part) {
  const { store, survey } = useDeskCtx();
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const auto = survey.actions.A.some(
    (a) => SCREEN?.autoOpenOn?.includes(a.code) && OUTSTANDING.has(a.state),
  );
  const open = userOpen ?? auto;
  const flip = (code: string) =>
    update({
      difficulty: draft.difficulty.includes(code)
        ? draft.difficulty.filter((c) => c !== code)
        : [...draft.difficulty, code],
    });
  return (
    <div className="border-border rounded-md border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className="tap text-body-s text-foreground hover:bg-muted flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left"
      >
        <span>
          <span className="font-medium">{SCREEN?.label ?? "Difficult-airway screen"}</span>
          {draft.difficulty.length > 0 ? (
            <span className="text-muted-foreground"> · {draft.difficulty.length} flagged</span>
          ) : null}
          {auto ? (
            <span className="text-amber-700 dark:text-amber-300"> · advanced airway indicated</span>
          ) : null}
        </span>
        <ChevronDownIcon
          className={cn(
            "ease-expo-out size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-border flex flex-col gap-3 border-t p-3">
          <p className="text-body-s text-muted-foreground">
            Anticipation prompts only — not pass/fail gates.
          </p>
          {AIRWAY_DIFFICULTY.map((d) => (
            <div key={d.code} className="flex flex-col gap-1">
              <div>
                <Chip
                  measure={false}
                  label={d.label}
                  on={draft.difficulty.includes(d.code)}
                  disabled={store.readOnly}
                  onToggle={() => flip(d.code)}
                />
              </div>
              <p className="text-caption text-muted-foreground">{d.expansion}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const GCS_PARTS = [
  { k: "eye", label: "Eye (E)", max: 4 },
  { k: "verbal", label: "Verbal (V)", max: 5 },
  { k: "motor", label: "Motor (M)", max: 6 },
] as const;

/** D — GCS components + capillary glucose (fresh vitals glucose prefills the draft only). */
function GcsGlucose({ draft, update }: Part) {
  const { store, survey } = useDeskCtx();
  const g = draft.gcs;
  const total =
    g.eye != null && g.verbal != null && g.motor != null ? g.eye + g.verbal + g.motor : null;
  const fresh = survey.measure.values.glucose;
  const fromVitals = fresh != null && parseNum(draft.glucose) === fresh;
  return (
    <div className="flex flex-wrap items-end gap-3">
      {GCS_PARTS.map(({ k, label, max }) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="text-caption text-muted-foreground">{label}</span>
          <select
            value={k === "verbal" && g.intubated ? "T" : (g[k] ?? "")}
            disabled={store.readOnly || (k === "verbal" && g.intubated)}
            onChange={(e) =>
              update({ gcs: { ...g, [k]: e.target.value === "" ? null : Number(e.target.value) } })
            }
            className={FIELD}
          >
            <option value="">–</option>
            {k === "verbal" && g.intubated ? <option value="T">T</option> : null}
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="text-body-s flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={g.intubated}
          disabled={store.readOnly}
          onChange={(e) =>
            // Verbal is not testable: stored and scored as verbal 1 + intubated ("T"), as v1.
            update({
              gcs: { ...g, intubated: e.target.checked, verbal: e.target.checked ? 1 : null },
            })
          }
          className="size-4"
        />
        Intubated (VT)
      </label>
      <p className="text-body-m text-foreground min-h-11 content-center font-mono tabular-nums">
        GCS {total ?? "–"}
        {g.intubated && total !== null ? " (VT)" : ""}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Glucose (mmol/L)</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          max={60}
          value={draft.glucose}
          disabled={store.readOnly}
          onChange={(e) => update({ glucose: e.target.value })}
          className={cn(FIELD, "w-28")}
        />
      </label>
      {fromVitals ? (
        <p className="text-caption text-muted-foreground w-full">
          Glucose from vitals ({survey.measure.ageMin ?? 0} min ago) — record to save it here.
        </p>
      ) : null}
    </div>
  );
}

const AVPU = [
  { v: "A", label: "A — alert" },
  { v: "V", label: "V — voice" },
  { v: "P", label: "P — pain" },
  { v: "U", label: "U — unresponsive" },
] as const;

/** D — AVPU (under More signs). */
function Avpu({ draft, update }: Part) {
  const { store } = useDeskCtx();
  return (
    <div role="group" aria-label="AVPU" className="flex flex-wrap gap-2">
      {AVPU.map((o) => (
        <Chip
          key={o.v}
          measure={false}
          label={o.label}
          on={draft.avpu === o.v}
          disabled={store.readOnly}
          onToggle={() => update({ avpu: draft.avpu === o.v ? null : o.v })}
        />
      ))}
    </div>
  );
}

/** E — core temperature + the AMPLE editor (the same drawer as the context bar's Allergies chip). */
function TempAmple({ draft, update }: Part) {
  const { store, ui, allergiesRecorded } = useDeskCtx();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Core temperature (°C)</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={10}
          max={45}
          value={draft.coreTemp}
          disabled={store.readOnly}
          onChange={(e) => update({ coreTemp: e.target.value })}
          className={cn(FIELD, "w-28")}
        />
      </label>
      <button
        type="button"
        onClick={ui.openAmple}
        className="tap border-border text-body-s text-foreground hover:bg-muted inline-flex min-h-11 items-center gap-2 rounded-md border px-3"
      >
        <ClipboardListIcon className="size-4" aria-hidden />
        <span className="font-medium">AMPLE history</span>
        {allergiesRecorded || store.readOnly ? null : (
          <span className="text-amber-700 dark:text-amber-300">· allergies not recorded</span>
        )}
      </button>
    </div>
  );
}
