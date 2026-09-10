/**
 * The Probe Lab.
 *
 * The bench shows a device working. This shows why it works, by running the
 * same probe models under conditions the reader sets and drawing what comes
 * out. Nothing here is an illustration: every curve is a solved profile and
 * every figure is a number the solver produced.
 *
 * It is deliberately not connected to the running simulation. The questions it
 * exists to answer are of the form "what happens if the oxygen falls", which
 * needs conditions to be set rather than observed.
 */
import type { Experiment } from "./experiments.ts";
import type { LabConditions } from "./labModel.ts";
import { useMemo, useState } from "react";

import { EnzymaticPanel } from "./EnzymaticPanel.tsx";
import { EXPERIMENTS } from "./experiments.ts";
import { DEFAULT_CONDITIONS, solve } from "./labModel.ts";
import { OpticalPanel } from "./OpticalPanel.tsx";

type Panel = "optical" | "enzymatic";

export function ProbeLab() {
  const [panel, setPanel] = useState<Panel>("enzymatic");
  const [conditions, setConditions] = useState<LabConditions>(DEFAULT_CONDITIONS);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [side, setSide] = useState<"left" | "right">("left");

  const active = experiment ? experiment[side].conditions : conditions;
  const solution = useMemo(() => solve(active), [active]);

  const set = <K extends keyof LabConditions>(key: K, value: LabConditions[K]): void => {
    setExperiment(null);
    setConditions((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-edge flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div role="group" aria-label="Probe" className="flex gap-1">
          {(["enzymatic", "optical"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setPanel(id)}
              aria-pressed={panel === id}
              className={`text-micro rounded-[var(--radius-control)] border px-2 py-1 transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
                panel === id
                  ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
                  : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
              }`}
            >
              {id === "enzymatic" ? "Tip B, enzymatic" : "Tip A, optical"}
            </button>
          ))}
        </div>
        <p className="text-micro text-muted">
          Simulation from first principles with literature-derived constants. Not calibrated against
          this device, which does not yet exist.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-2 pr-1">
        <Experiments
          experiment={experiment}
          side={side}
          onPick={(next) => {
            setExperiment(next);
            setSide("left");
            if (next) setPanel(next.panel);
          }}
          onSide={setSide}
        />

        <Controls conditions={active} onChange={set} locked={experiment !== null} />

        <div className="mt-3">
          {panel === "optical" ? (
            <OpticalPanel result={solution.optical} conditions={active} />
          ) : (
            <EnzymaticPanel
              result={solution.enzymatic}
              conditions={active}
              profiles={solution.profiles}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Experiments({
  experiment,
  side,
  onPick,
  onSide,
}: {
  experiment: Experiment | null;
  side: "left" | "right";
  onPick: (next: Experiment | null) => void;
  onSide: (side: "left" | "right") => void;
}) {
  return (
    <section aria-label="Preset experiments">
      <div className="flex flex-wrap gap-1">
        {EXPERIMENTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(experiment?.id === item.id ? null : item)}
            aria-pressed={experiment?.id === item.id}
            className={`text-micro rounded-[var(--radius-control)] border px-2 py-1 transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
              experiment?.id === item.id
                ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
                : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>

      {experiment ? (
        <div className="border-edge bg-panel-raised mt-2 rounded-[var(--radius-card)] border p-2">
          <p className="text-body-s">{experiment.question}</p>
          <p className="text-micro text-muted mt-1">{experiment.claim}</p>
          <div role="group" aria-label="Comparison" className="mt-2 flex gap-1">
            {(["left", "right"] as const).map((which) => (
              <button
                key={which}
                type="button"
                onClick={() => onSide(which)}
                aria-pressed={side === which}
                className={`text-micro rounded-[var(--radius-control)] border px-2 py-1 font-mono transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
                  side === which
                    ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
                    : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
                }`}
              >
                {experiment[which].label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

type Slider = {
  key: keyof LabConditions;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (value: number) => string;
};

const SLIDERS: Slider[] = [
  { key: "glucoseMmol", label: "Glucose", min: 1, max: 30, step: 0.5, unit: "mmol/L" },
  { key: "oxygenMmHg", label: "Oxygen", min: 1, max: 100, step: 1, unit: "mmHg" },
  { key: "temperatureC", label: "Temperature", min: 32, max: 42, step: 0.1, unit: "C" },
  { key: "capsuleMicron", label: "Capsule", min: 0, max: 200, step: 5, unit: "um" },
  {
    key: "foulingFraction",
    label: "Fouling",
    min: 0,
    max: 1,
    step: 0.05,
    unit: "",
    format: (v) => `${(v * 100).toFixed(0)} %`,
  },
  { key: "paracetamolMmol", label: "Paracetamol", min: 0, max: 0.6, step: 0.02, unit: "mmol/L" },
  { key: "polyolMmol", label: "Infused polyol", min: 0, max: 6, step: 0.25, unit: "mmol/L" },
  {
    key: "flashes",
    label: "Flashes fired",
    min: 0,
    max: 3_000_000,
    step: 50_000,
    unit: "",
    format: (v) => v.toLocaleString("en-GB"),
  },
];

function Controls({
  conditions,
  onChange,
  locked,
}: {
  conditions: LabConditions;
  onChange: <K extends keyof LabConditions>(key: K, value: LabConditions[K]) => void;
  locked: boolean;
}) {
  return (
    <section
      aria-label="Conditions"
      className="mt-3 grid gap-x-5 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-4"
    >
      {SLIDERS.map((slider) => {
        const value = conditions[slider.key] as number;
        return (
          <label key={slider.key} className="text-micro flex items-center gap-2">
            <span className="text-muted w-24 shrink-0">{slider.label}</span>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={value}
              onChange={(event) => onChange(slider.key, Number(event.target.value) as never)}
              className="min-w-0 flex-1 accent-[var(--color-teal-bright)]"
              aria-valuetext={`${value} ${slider.unit}`}
            />
            <span className="w-20 shrink-0 text-right font-mono">
              {slider.format ? slider.format(value) : `${value} ${slider.unit}`}
            </span>
          </label>
        );
      })}
      <label className="text-micro flex items-center gap-2">
        <span className="text-muted w-24 shrink-0">Oxygen recycling</span>
        <input
          type="checkbox"
          checked={conditions.recycleOxygen}
          onChange={(event) => onChange("recycleOxygen", event.target.checked)}
          className="accent-[var(--color-teal-bright)]"
        />
        <span className="text-muted min-w-0 flex-1">
          A model switch, not a state of the device. Off is how you see what it is worth.
        </span>
      </label>
      {locked ? (
        <p className="text-micro text-muted sm:col-span-2 xl:col-span-4">
          An experiment is set. Move any control to take it back.
        </p>
      ) : null}
    </section>
  );
}
