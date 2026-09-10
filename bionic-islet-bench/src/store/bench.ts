/**
 * Bench state that React actually needs to see, and the worker connection.
 *
 * Snapshots arrive at up to 30 a second. The numbers do not need redrawing
 * that often, so the store publishes at 10 a second; the traces read the
 * buffers directly and redraw every frame.
 */

import { create } from "zustand";

import type { Envelope } from "../engine/params.ts";
import type { ScenarioId } from "../engine/scenarios.ts";
import type { SimEvent } from "../engine/types.ts";
import type { FromWorker, ScenarioOutcome, ToWorker } from "../worker/protocol.ts";
import { applySnapshot, benchData, resetBenchData } from "./benchData.ts";

export type TraceWindow = "30m" | "6h" | "24h" | "90d";
export type ZoomLevel = 1 | 2 | 3 | 4;
/**
 * What the stage is showing.
 *
 * `device` is the running implant at one of four zoom levels. `lab` is the
 * Probe Lab, which runs its own copy of the two probe models under conditions
 * the reader sets. They share the stage because the bench is one screen and
 * because they are two views of the same object: what it does, and why.
 */
export type StageMode = "device" | "lab";

export const TRACE_WINDOWS: Array<{ id: TraceWindow; label: string; seconds: number }> = [
  { id: "30m", label: "30 min", seconds: 30 * 60 },
  { id: "6h", label: "6 h", seconds: 6 * 3600 },
  { id: "24h", label: "24 h", seconds: 24 * 3600 },
  { id: "90d", label: "90 days", seconds: 90 * 86_400 },
];

export const ZOOM_LEVELS: Array<{ id: ZoomLevel; label: string; caption: string }> = [
  { id: 1, label: "Body", caption: "Abdominal cross-section, both leads and the catheter" },
  { id: 2, label: "Housing", caption: "Titanium housing, cut away" },
  { id: 3, label: "Tip A", caption: "Optical tip, boronic acid hydrogel cap" },
  { id: 4, label: "Tip B", caption: "Electrochemical tip, layer stack" },
];

const DEFAULT_SEED = 20260101;

type BenchStore = {
  connected: boolean;
  running: boolean;
  speed: number;
  zoom: ZoomLevel;
  stageMode: StageMode;
  window: TraceWindow;
  seed: number;
  /** Non-null while a scenario or fast-forward is being computed. */
  progress: { label: string; fraction: number } | null;
  scenario: ScenarioOutcome | null;
  /** Two scenarios run headlessly and shown side by side. */
  comparison: ScenarioOutcome[] | null;
  /** Bumped on every published snapshot, at about 10 per second. */
  tick: number;

  connect: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (multiplier: number) => void;
  stepMinutes: (minutes: number) => void;
  send: (event: SimEvent) => void;
  runDays: (days: number) => void;
  loadScenario: (id: ScenarioId) => void;
  compare: (a: ScenarioId, b: ScenarioId) => void;
  clearComparison: () => void;
  reset: (seed?: number) => void;
  setZoom: (zoom: ZoomLevel) => void;
  setStageMode: (mode: StageMode) => void;
  setWindow: (window: TraceWindow) => void;
  changeEnvelope: (envelope: Partial<Envelope>, actor: string) => void;
};

/**
 * The simulation host, which is either a Web Worker or the same module running
 * on this thread. The single-file preview build has no separate worker file to
 * fetch and may not be allowed to spawn one, so it runs the host in process.
 * Nothing else in the bench can tell the difference.
 */
let send: (message: ToWorker) => void = () => {};
let connected = false;
let publishHandle: ReturnType<typeof setInterval> | null = null;

function sendToWorker(message: ToWorker): void {
  send(message);
}

const RUN_IN_PROCESS = import.meta.env.VITE_INLINE_HOST === "1";

export const useBench = create<BenchStore>((set, get) => ({
  connected: false,
  running: false,
  speed: 1,
  zoom: 1,
  stageMode: "device",
  window: "6h",
  seed: DEFAULT_SEED,
  progress: null,
  scenario: null,
  comparison: null,
  tick: 0,

  connect: () => {
    if (connected) return;
    connected = true;

    const receive = (data: FromWorker) => {
      if (data.type === "snapshot") {
        applySnapshot(data.snapshot);
        if (data.snapshot.running !== get().running) set({ running: data.snapshot.running });
      } else if (data.type === "progress") {
        set({ progress: data.fraction >= 1 ? null : { label: data.label, fraction: data.fraction } });
      } else if (data.type === "scenarioLoaded") {
        set({ progress: null, running: false, scenario: data.outcome });
      } else if (data.type === "comparison") {
        set({ progress: null, comparison: data.outcomes });
      } else if (data.type === "ready") {
        set({ connected: true });
      }
    };

    if (RUN_IN_PROCESS) {
      void import("../worker/simHost.ts").then((host) => {
        host.setPost(receive);
        send = (message) => host.handle(message);
        sendToWorker({ type: "init", seed: get().seed });
      });
    } else {
      const worker = new Worker(new URL("../worker/sim.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (message: MessageEvent<FromWorker>) => receive(message.data);
      send = (message) => worker.postMessage(message);
      sendToWorker({ type: "init", seed: get().seed });
    }

    // Publish to React at 10 Hz. The canvas does not go through here.
    publishHandle ??= setInterval(() => {
      if (benchData.state) set((s) => ({ tick: s.tick + 1 }));
    }, 100);
  },

  play: () => {
    sendToWorker({ type: "play" });
    set({ running: true });
  },
  pause: () => {
    sendToWorker({ type: "pause" });
    set({ running: false });
  },
  toggle: () => (get().running ? get().pause() : get().play()),
  setSpeed: (multiplier) => {
    sendToWorker({ type: "speed", multiplier });
    set({ speed: multiplier });
  },
  stepMinutes: (minutes) => {
    if (get().running) get().pause();
    sendToWorker({ type: "stepMinutes", minutes });
  },
  send: (event) => sendToWorker({ type: "event", event }),
  runDays: (days) => {
    set({ running: false, progress: { label: `Running ${days} days`, fraction: 0 } });
    sendToWorker({ type: "runDays", days });
  },
  loadScenario: (id) => {
    resetBenchData();
    set({ running: false, progress: { label: "Loading scenario", fraction: 0 }, scenario: null });
    sendToWorker({ type: "scenario", id });
  },
  compare: (a, b) => {
    set({ progress: { label: "Running both scenarios", fraction: 0.5 } });
    sendToWorker({ type: "compare", a, b });
  },
  clearComparison: () => set({ comparison: null }),
  reset: (seed) => {
    const next = seed ?? get().seed;
    resetBenchData();
    set({ running: false, scenario: null, comparison: null, seed: next, progress: null });
    sendToWorker({ type: "reset", seed: next });
  },
  setZoom: (zoom) => set({ zoom, stageMode: "device" }),
  setStageMode: (stageMode) => set({ stageMode }),
  setWindow: (window) => set({ window }),
  changeEnvelope: (envelope, actor) =>
    sendToWorker({ type: "event", event: { kind: "envelope-change", envelope, actor } }),
}));
