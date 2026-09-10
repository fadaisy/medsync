import { domAnimation, LazyMotion } from "framer-motion";
import { useEffect } from "react";

import { ControlRail } from "./components/ControlRail.tsx";
import { DeviceStage } from "./components/DeviceStage.tsx";
import { EventLog } from "./components/EventLog.tsx";
import { HonestyStrip } from "./components/HonestyStrip.tsx";
import { Readouts } from "./components/Readouts.tsx";
import { ScenarioCard } from "./components/ScenarioCard.tsx";
import { ScoreboardPanel } from "./components/ScoreboardPanel.tsx";
import { StateCard } from "./components/StateCard.tsx";
import { Traces } from "./components/Traces.tsx";
import { simTime } from "./lib/format.ts";
import { benchData } from "./store/benchData.ts";
import { useBench } from "./store/bench.ts";

export default function App() {
  const connect = useBench((s) => s.connect);
  useEffect(() => connect(), [connect]);

  return (
    /*
     * LazyMotion with the dom-animation feature set, not the whole of
     * framer-motion: the bench uses it for two panel transitions and nothing
     * else, and the full library is 44 kB gzipped for that. The design system
     * has no decorative motion for it to do.
     */
    /*
     * One screen. On a wide viewport nothing scrolls except the individual
     * panels, so the device, the instruments and the log are all in view at
     * once. Below that the columns stack and the page scrolls, because a
     * three-column bench does not fit a phone and pretending otherwise would
     * make all three unusable.
     */
    <LazyMotion features={domAnimation} strict>
    <div className="flex min-h-screen flex-col xl:h-screen xl:overflow-hidden">
      <HonestyStrip />
      <TitleBar />
      <ProgressBar />
      <ScenarioCard />

      <main className="grid min-h-0 flex-1 gap-3 p-3 xl:grid-cols-[236px_minmax(0,1fr)_352px]">
        <div className="order-2 min-w-0 xl:order-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <ControlRail />
        </div>

        <div className="order-1 grid min-h-0 min-w-0 gap-3 xl:order-2 xl:grid-rows-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="min-h-[300px]">
            <DeviceStage />
          </div>
          <div className="min-h-[320px] min-w-0 rounded-[var(--radius-card)] border border-edge bg-panel p-3 shadow-card">
            <Traces />
          </div>
        </div>

        <div className="order-3 flex min-w-0 flex-col gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <StateCard />
          <ScoreboardPanel />
          <Readouts />
        </div>
      </main>

      <div className="h-44 shrink-0 px-3 pb-3">
        <EventLog />
      </div>
    </div>
    </LazyMotion>
  );
}

function TitleBar() {
  useBench((s) => s.tick);
  const scenario = useBench((s) => s.scenario);
  const seed = useBench((s) => s.seed);
  const state = benchData.state;

  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-edge px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-heading-m">Bionic islet sensor bench</h1>
        <p className="text-micro text-muted">
          MedSync glucose-sensing subsystem, running in a simulated body
        </p>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 text-micro text-muted">
        {scenario ? (
          <span className="rounded-[3px] border border-teal-bright/40 bg-teal-bright/10 px-1.5 py-px text-teal-bright">
            {scenario.title}
          </span>
        ) : null}
        <span className="tabular">seed {seed}</span>
        <span className="tabular text-[#cfd8e6]">{state ? simTime(state.t) : "starting"}</span>
      </div>
    </header>
  );
}

function ProgressBar() {
  const progress = useBench((s) => s.progress);
  if (!progress) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-progress
      className="border-b border-edge bg-[#0f1728] px-3 py-1.5 text-micro text-muted"
    >
      <span className="mr-2 text-[#cfd8e6]">{progress.label}</span>
      <span className="tabular">{Math.round(progress.fraction * 100)} %</span>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-edge">
        <div
          className="h-full bg-teal-600 transition-[width] duration-[var(--duration-quick)] ease-[var(--ease-medsync)]"
          style={{ width: `${progress.fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
