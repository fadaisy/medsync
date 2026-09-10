import { useEffect, useState } from "react";

import { SCENARIOS } from "../engine/scenarios.ts";
import type { SimEvent } from "../engine/types.ts";
import { num } from "../lib/format.ts";
import { benchData } from "../store/benchData.ts";
import { useBench } from "../store/bench.ts";
import { EnvelopePanel } from "./EnvelopePanel.tsx";

const SPEEDS = [1, 60, 600, 1440] as const;

type Action = {
  label: string;
  tip: string;
  event?: SimEvent;
  run?: () => void;
  /** Rendered as pressed when this returns true. */
  active?: () => boolean;
};

/** Every fault the bench can inject, with what it does to the model. */
function faultActions(): Action[] {
  const state = benchData.state;
  return [
    {
      label: "Paracetamol",
      tip: "Adds up to 8 nA to the electrochemical current, absorbed over about an hour and cleared with a 4 h half-life. The optical tip is unaffected.",
      event: { kind: "paracetamol" },
    },
    {
      label: "Mannitol infusion",
      tip: "Adds 0.25 to the optical fluorescence ratio, about 4.2 mmol/L of apparent glucose. Boronic acid binds the diol. The electrochemical tip is unaffected. Toggles.",
      event: { kind: "mannitol" },
      active: () => state?.mannitolOn ?? false,
    },
    {
      label: "Vitamin C",
      tip: "Adds up to 3 nA to the electrochemical current with a 1 h half-life.",
      event: { kind: "vitamin-c" },
    },
    {
      label: "Exercise",
      tip: "Raises insulin sensitivity by 40 percent and lowers peritoneal oxygen by 15 percent for as long as it runs.",
      event: state?.exercising ? { kind: "exercise-stop" } : { kind: "exercise-start" },
      active: () => state?.exercising ?? false,
    },
    {
      label: "Low oxygen",
      tip: "Drops peritoneal oxygen to 18 mmHg. Only bites on the part of the electrochemical signal above 12 mmol/L, where oxygen demand outruns supply.",
      event: { kind: "low-oxygen", on: !(state?.lowOxygenOn ?? false) },
      active: () => state?.lowOxygenOn ?? false,
    },
    {
      label: "Protein deposition",
      tip: "Adds 35 percentage points of fouling to tip B at once. Lowers its sensitivity by 0.6 times the fouling and raises impedance by 1 plus 3 times the fouling, which is what flags it.",
      event: { kind: "protein-deposition" },
    },
    {
      label: "Omental wrap, tip A",
      tip: "Adds 85 um of capsule to tip A and drops its optical return to 45 percent of baseline. The optical loss is what the supervisor sees.",
      event: { kind: "omental-wrap", tip: "A" },
    },
    {
      label: "Omental wrap, tip B",
      tip: "Adds 85 um of capsule to tip B and raises its impedance by 80 percent. On this tip the impedance step is what the supervisor sees.",
      event: { kind: "omental-wrap", tip: "B" },
    },
    {
      label: "Lead A fracture",
      tip: "Fractures a fibre in lead A. The optical channel stops reporting altogether.",
      event: { kind: "lead-a-fracture" },
      active: () => !(state?.tipA.leadIntact ?? true),
    },
    {
      label: "Lead B fracture",
      tip: "Fractures a conductor in lead B. The electrochemical channel stops and impedance reads open circuit.",
      event: { kind: "lead-b-fracture" },
      active: () => !(state?.tipB.leadIntact ?? true),
    },
    {
      label: "Thermistor failure",
      tip: "Temperature compensation falls back to an assumed 37.0 degC and both channels' bands are widened. Neither channel dies.",
      event: { kind: "thermistor-failure" },
      active: () => !(state?.thermistorOk ?? true),
    },
    {
      label: "Telemetry loss",
      tip: "The radio stops. MedSync sees nothing. Nothing inside the body changes, and the loop keeps running.",
      event: state?.telemetryOk ? { kind: "telemetry-loss" } : { kind: "telemetry-restore" },
      active: () => !(state?.telemetryOk ?? true),
    },
    {
      label: "Phone lost",
      tip: "The phone goes out of range. MedSync raises silence detection after 30 min. Nothing inside the body changes.",
      event: state?.phonePresent ? { kind: "phone-lost" } : { kind: "phone-found" },
      active: () => !(state?.phonePresent ?? true),
    },
    {
      label: "Battery low",
      tip: "Optical acquisition drops from every 60 s to every 5 min to save power, so the band on tip A widens and the trace coarsens.",
      event: { kind: "battery-low" },
      active: () => state?.batteryLow ?? false,
    },
    {
      label: "Missed calibration",
      tip: "The patient stops answering calibration prompts. Uncertainty grows with days since calibration on both channels.",
      event: { kind: "missed-calibration", on: !(state?.missedCalibration ?? false) },
      active: () => state?.missedCalibration ?? false,
    },
    {
      label: "Unannounced meal, 60 g",
      tip: "60 g of carbohydrate that the controller is not told about, so there is no meal bolus and the loop has to react to what it sees.",
      event: { kind: "meal", grams: 60, announced: false },
    },
  ];
}

export function ControlRail() {
  useBench((s) => s.tick);
  const bench = useBench();
  const state = benchData.state;
  const [envelopeOpen, setEnvelopeOpen] = useState(false);

  // Keyboard shortcuts, skipped whenever a form control has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " ") {
        event.preventDefault();
        bench.toggle();
      } else if (event.key === ".") {
        bench.stepMinutes(1);
      } else if (event.key >= "1" && event.key <= "4") {
        const speed = SPEEDS[Number(event.key) - 1];
        if (speed) bench.setSpeed(speed);
      } else if (event.key.toLowerCase() === "m") {
        bench.send({ kind: "meal", grams: 60, announced: true });
      } else if (event.key.toLowerCase() === "p") {
        bench.send({ kind: "paracetamol" });
      } else if (event.key.toLowerCase() === "c") {
        bench.send({ kind: "calibrate" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bench]);

  return (
    <div className="flex flex-col gap-3">
      <Group title="Time" hint="Space plays or pauses. Full stop steps one minute. Keys 1 to 4 set the acceleration.">
        <div className="flex gap-1">
          <Button
            onClick={bench.toggle}
            wide
            primary
            label={bench.running ? "Pause" : "Play"}
            tip="Start or stop the simulation. The device keeps its state either way."
          />
          <Button
            onClick={() => bench.stepMinutes(1)}
            label="Step 1 min"
            tip="Advance exactly 60 simulated seconds, one acquisition."
          />
        </div>
        <div role="group" aria-label="Time acceleration" className="mt-1 flex gap-1">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => bench.setSpeed(speed)}
              aria-pressed={bench.speed === speed}
              title={
                speed === 1440
                  ? "One simulated day per wall-clock minute."
                  : `${speed} simulated seconds per wall-clock second.`
              }
              className={`flex-1 rounded-[var(--radius-control)] border px-1 py-1 font-mono text-micro transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
                bench.speed === speed
                  ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
                  : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
        <Button
          onClick={() => bench.runDays(365)}
          wide
          label="Run 365 days"
          tip="Fast-forward a year of ageing and report the scoreboard. Takes a little under a minute of wall-clock time."
          className="mt-1"
        />
        {state ? (
          <p className="tabular mt-1 text-micro text-muted">
            {num(benchData.achievedRate, 0)} of {bench.speed} simulated s per wall s
            {" · "}
            engine {num(benchData.stepBudgetUs, 2)} us per simulated second
          </p>
        ) : null}
      </Group>

      <Group title="Physiology">
        <div className="flex flex-wrap gap-1">
          {[30, 60, 90].map((grams) => (
            <Button
              key={grams}
              onClick={() => bench.send({ kind: "meal", grams, announced: true })}
              label={`Meal ${grams} g`}
              tip={`${grams} g of carbohydrate, announced to the controller, so it delivers a meal bolus of up to the envelope's bolus ceiling.`}
            />
          ))}
          <Button
            onClick={() => bench.send({ kind: "meal", grams: 60, announced: false })}
            label="Unannounced"
            tip="60 g of carbohydrate the controller is not told about."
          />
        </div>
        <div className="mt-1 flex gap-1">
          <Toggle
            on={state?.exercising ?? false}
            onClick={() =>
              bench.send(state?.exercising ? { kind: "exercise-stop" } : { kind: "exercise-start" })
            }
            label="Exercise"
            tip="Raises insulin sensitivity by 40 percent and lowers peritoneal oxygen by 15 percent."
          />
          <Toggle
            on={state?.asleep ?? false}
            onClick={() =>
              bench.send(state?.asleep ? { kind: "sleep-stop" } : { kind: "sleep-start" })
            }
            label="Sleep"
            tip="Insulin sensitivity falls by 10 percent, and endogenous production rises 15 percent in the dawn window after five hours."
          />
        </div>
      </Group>

      <Group title="Faults" hint="Each says exactly what it does to the model.">
        <div className="flex flex-wrap gap-1">
          {faultActions().map((action) => (
            <Toggle
              key={action.label}
              on={action.active?.() ?? false}
              onClick={() => (action.event ? bench.send(action.event) : action.run?.())}
              label={action.label}
              tip={action.tip}
            />
          ))}
        </div>
      </Group>

      <Group title="Clinical">
        <div className="flex flex-wrap gap-1">
          <Button
            onClick={() => bench.send({ kind: "calibrate" })}
            label="Finger-prick calibration"
            tip="Sets each channel's sensitivity estimate to match plasma at this instant, with the meter's own error of 0.4 mmol/L one sigma."
          />
          <Button
            onClick={() => bench.send({ kind: "flush" })}
            label="Flush"
            tip="Removes 20 percent of the capsule surface layer and half the fouling on both tips."
          />
          <Button
            onClick={() => bench.send({ kind: "tip-exchange", tip: "A" })}
            label="Exchange tip A"
            tip="Replaces the optical tip. Resets its capsule, photobleaching and lead integrity."
          />
          <Button
            onClick={() => bench.send({ kind: "tip-exchange", tip: "B" })}
            label="Exchange tip B"
            tip="Replaces the electrochemical tip. Resets its capsule, enzyme activity, fouling, reference drift and lead integrity."
          />
          <Toggle
            on={state?.cgmBridged ?? false}
            onClick={() =>
              bench.send(state?.cgmBridged ? { kind: "cgm-bridge-off" } : { kind: "cgm-bridge-on" })
            }
            label="Bridge external monitor"
            tip="Bridges an external continuous glucose monitor through the phone. It reads the subcutaneous site, so it lifts a suspended device to basal modulation only, never to full closed loop."
          />
          <Button
            onClick={() => setEnvelopeOpen(true)}
            label="Clinician envelope"
            tip="Change the dosing bounds. Requires the simulated multi-factor step and writes an audit entry."
          />
        </div>
      </Group>

      <Group title="Scenarios" hint="Each sets up a situation, runs it, and states what it expects.">
        <div className="flex flex-col gap-1">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => bench.loadScenario(scenario.id)}
              title={`${scenario.teaches} Expectation: ${scenario.expectation}`}
              className="rounded-[var(--radius-control)] border border-edge px-2 py-1 text-left text-micro text-[#cfd8e6] transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] hover:border-teal-bright hover:bg-teal-bright/10 hover:text-teal-bright"
            >
              <span className="tabular mr-1.5 text-muted">{scenario.number}</span>
              {scenario.title}
            </button>
          ))}
          <Button
            onClick={() => bench.reset()}
            label="Reset to a fresh implant"
            tip="Rebuilds the device at day zero with the current seed."
            className="mt-1"
          />
        </div>
      </Group>

      {envelopeOpen ? <EnvelopePanel onClose={() => setEnvelopeOpen(false)} /> : null}
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted">{title}</h2>
      {hint ? <p className="mb-1 text-micro leading-snug text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

function Button({
  label,
  tip,
  onClick,
  wide,
  primary,
  className = "",
}: {
  label: string;
  tip: string;
  onClick: () => void;
  wide?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tip}
      aria-label={`${label}. ${tip}`}
      className={`rounded-[var(--radius-control)] border px-2 py-1 text-micro transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
        primary
          ? "border-teal-bright bg-teal-bright text-bench hover:bg-teal-100"
          : "border-edge text-[#cfd8e6] hover:border-teal-bright hover:bg-teal-bright/10 hover:text-teal-bright"
      } ${wide ? "flex-1" : ""} ${className}`}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  tip,
  on,
  onClick,
}: {
  label: string;
  tip: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={tip}
      aria-label={`${label}. ${tip}`}
      className={`rounded-[var(--radius-control)] border px-2 py-1 text-micro transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
        on
          ? "border-amber bg-amber/15 text-amber"
          : "border-edge text-[#cfd8e6] hover:border-teal-bright hover:bg-teal-bright/10 hover:text-teal-bright"
      }`}
    >
      {on ? (
        <span aria-hidden="true" className="mr-1 font-mono text-[9px]">
          ON
        </span>
      ) : null}
      {label}
    </button>
  );
}
