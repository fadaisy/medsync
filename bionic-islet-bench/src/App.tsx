import { useEffect } from "react";
import { domAnimation, LazyMotion } from "framer-motion";

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
import { useBench } from "./store/bench.ts";
import { benchData } from "./store/benchData.ts";

export default function App() {
  const connect = useBench((s) => s.connect);
  const lab = useBench((s) => s.stageMode) === "lab";
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

        {/*
         * The Probe Lab takes the instrument column as well as the stage. It is
         * a reference surface with a lot on it, and the supervisor and the
         * scoreboard are describing a run nobody is watching while they are in
         * the lab. Giving it the width lets its charts sit two up instead of
         * one above the other in a 500 pixel column.
         */}
        {/*
         * `xl:grid-rows-[minmax(0,1fr)]` is not decoration either. Without it
         * the single implicit row is sized `auto`, so it grows to fit its
         * tallest column and the whole grid pushes down past the flex line into
         * the event log below: the scoreboard and the live readouts overlapped
         * it by up to 164 pixels. The columns already carry `min-h-0` and
         * `overflow-y-auto`, but neither can do anything while the track they
         * sit in is free to grow. State the track.
         */}
        <main
          className={`grid min-h-0 flex-1 gap-3 p-3 xl:grid-rows-[minmax(0,1fr)] ${
            lab ? "xl:grid-cols-[236px_minmax(0,1fr)]" : "xl:grid-cols-[236px_minmax(0,1fr)_352px]"
          }`}
        >
          <div className="order-2 min-w-0 xl:order-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <ControlRail />
          </div>

          {/*
           * The Probe Lab takes the whole middle column rather than the stage's
           * share of it. It is a different job from watching the traces: nobody
           * asks what an oxygen tension does to the enzyme while also following
           * a meal, and squeezed into half the column its charts fall below the
           * fold and it is worse than useless.
           */}
          {/*
           * The row minimums are on the **tracks**, not only on the items.
           *
           * They used to be `minmax(0, 1.05fr)` and `minmax(0, 1fr)` with the
           * two children carrying `min-h-[300px]` and `min-h-[320px]`. A zero
           * row minimum lets the track shrink below what its item needs, and
           * the item then keeps its own height and paints straight over the
           * next row: on a 1440 by 700 viewport the device stage overlapped the
           * traces by thirty pixels, so the body drawing sat on top of the
           * chart. Nothing was clipping it because nothing had overflowed
           * anything; the grid had simply been told it was allowed to do that.
           *
           * With the minimums on the tracks the column asks for the 632 pixels
           * it needs, and when the viewport cannot give them the column scrolls.
           * That costs the "on a wide viewport nothing scrolls" intent on short
           * screens, which is a much smaller price than two panels on top of
           * each other.
           */}
          <div
            className={`order-1 grid min-h-0 min-w-0 gap-3 xl:order-2 ${
              lab
                ? ""
                : "xl:grid-rows-[minmax(300px,1.05fr)_minmax(320px,1fr)] xl:overflow-y-auto xl:pr-1"
            }`}
          >
            <div className="min-h-[300px] min-w-0">
              <DeviceStage />
            </div>
            {lab ? null : (
              <section
                aria-label="Traces"
                className="border-edge bg-panel shadow-card min-h-[320px] min-w-0 rounded-[var(--radius-card)] border p-3"
              >
                <Traces />
              </section>
            )}
          </div>

          {lab ? null : (
            <div className="order-3 flex min-w-0 flex-col gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              <StateCard />
              <ScoreboardPanel />
              <Readouts />
            </div>
          )}
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
    <header className="border-edge flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-heading-m">Bionic islet sensor bench</h1>
        <p className="text-micro text-muted">
          MedSync glucose-sensing subsystem, running in a simulated body
        </p>
      </div>
      <div className="text-micro text-muted flex flex-wrap items-baseline gap-x-3">
        {scenario ? (
          <span className="border-teal-bright/40 bg-teal-bright/10 text-teal-bright rounded-[3px] border px-1.5 py-px">
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
      className="border-edge text-micro text-muted border-b bg-[#0f1728] px-3 py-1.5"
    >
      <span className="mr-2 text-[#cfd8e6]">{progress.label}</span>
      <span className="tabular">{Math.round(progress.fraction * 100)} %</span>
      <div className="bg-edge mt-1 h-1 w-full overflow-hidden rounded-full">
        <div
          className="h-full bg-teal-600 transition-[width] duration-[var(--duration-quick)] ease-[var(--ease-medsync)]"
          style={{ width: `${progress.fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
