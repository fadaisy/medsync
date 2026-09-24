"use client";

import type { Person } from "./arrest-console-model";
import type { RoscSign } from "@/lib/resus/model";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, HeartPulseIcon } from "lucide-react";

import { computeArrestState } from "@/lib/resus/als/engine";
import { CyclePanel } from "./arrest-console-cycle";
import { ArrestStrip } from "./arrest-console-header";
import { LogRow } from "./arrest-console-log";
import {
  arrestLog,
  consoleBtn,
  stackOffered,
  teamPeople,
  useArrestCtx,
} from "./arrest-console-model";
import { NextPanel, SpecialBanner } from "./arrest-console-next";
import { RhythmRow } from "./arrest-console-rhythm";
import { logCause, logRhythm, logRosc } from "./arrest-console-rows";
import { KeysHelp, LogStrip, UNDO_WINDOW_MS } from "./arrest-console-strip";
import { logProcedure } from "./arrest-console-tools";
import { useConsoleLog } from "./arrest-console-writes";
import { ArrestDetails } from "./arrest-details";
import { useConsoleAudio } from "./console-audio";
import { useDeskCtx } from "./desk-context";
import { ReversibleCauses } from "./reversible-causes";
import { RoscConfirm } from "./rosc-confirm";
import { useConsoleKeys } from "./use-console-keys";
import { useNow } from "./use-desk";

/**
 * Resus Desk v2 — the ALS arrest console (prompt §5.9; docs/clinical/resus-als-clinical-catalog.md).
 *
 * The console ticks (500 ms) and computes the arrest state itself — the desk never does it
 * every second. Clocks come from events, so they survive reload and agree across devices.
 * Every arrest event is one tap through the queued, optimistic write path; the engine only
 * says what is due. Red is the arrest state (this header strip) and nothing else here:
 * due and overdue are amber; ROSC is teal; "Stop resuscitation…" is a deliberate neutral.
 * The assertive live region is portalled to <body>: behind the "Survey (paused)" tab the
 * console is `hidden`, and a live region in a hidden subtree is never announced.
 */

const UNDOABLE = new Set([
  "rhythm_check",
  "shock",
  "drug",
  "procedure",
  "decision",
  "vital",
  "note",
]);

const noSubscribe = () => () => undefined;

/** Assertive announcements: clear, then set, so a repeat is read again. */
function say(el: HTMLElement | null, text: string) {
  if (!el) return;
  el.textContent = "";
  requestAnimationFrame(() => {
    el.textContent = text;
  });
}

export function ArrestConsole() {
  const { initial, store, ui, flags } = useDeskCtx();
  // Every clock here is "now"-dependent: render them on the client only (no hydration drift).
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const ctx = useArrestCtx();
  const now = useNow(store.nowMs, 500);
  const arrest = useMemo(
    () => computeArrestState(store.activeEvents, now, ctx),
    [store.activeEvents, now, ctx],
  );
  const seq = arrest.arrestSeq;
  const { log, undo, reopen } = useConsoleLog(arrest.arrestAtMs);
  const rootRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const [rosc, setRosc] = useState<{ pulse: boolean } | null>(null);
  const [help, setHelp] = useState(false);

  const inArrest = arrest.status === "in_arrest";
  const cs = arrest.cycle.status;
  // One key per due rhythm check: the tone, the vibration and the announcement fire once.
  const dueKey =
    inArrest && (cs === "due" || cs === "overdue") ? `${seq}:${arrest.cycle.startedAtMs}` : null;
  const audio = useConsoleAudio({
    cueKey: dueKey,
    running: inArrest,
    toneDefault: initial.settings.rhythmCheckTone,
  });

  // Entry: the desk moves focus here on a mode switch; on a direct load, take it if nobody has.
  const [freshAtEntry] = useState(() => arrest.arrestElapsedMs < 30_000);
  useEffect(() => {
    if (!hydrated) return;
    if (!document.activeElement || document.activeElement === document.body)
      headingRef.current?.focus();
    if (!freshAtEntry) return;
    const t = setTimeout(() => say(liveRef.current, "Cardiac arrest declared."), 150);
    return () => clearTimeout(t);
  }, [hydrated, freshAtEntry]);
  const uiRef = useRef(ui);
  useLayoutEffect(() => {
    uiRef.current = ui;
  });
  useEffect(() => {
    if (!hydrated || !dueKey) return;
    say(liveRef.current, "Rhythm check due.");
    // On the paused survey the console is out of sight, and the tone may be off.
    if (uiRef.current.surveyTab)
      uiRef.current.toast({
        message: "Rhythm check due — open the Arrest console tab.",
        tone: "warn",
      });
  }, [hydrated, dueKey]);

  const entries = useMemo(() => arrestLog(store.activeEvents, seq), [store.activeEvents, seq]);
  const { roster, responders } = store;
  const people = useMemo(
    () => teamPeople(initial, { roster, responders }),
    [initial, roster, responders],
  );
  const stackOk = useMemo(() => stackOffered(store.activeEvents, seq), [store.activeEvents, seq]);
  const last = entries[entries.length - 1];
  const undoable =
    last?.clientEventId &&
    UNDOABLE.has(last.kind) &&
    last.recordedByUserId === initial.me.userId &&
    now - Date.parse(last.recordedAt) <= UNDO_WINDOW_MS
      ? last.clientEventId
      : null;
  useConsoleKeys(rootRef, {
    u: () => {
      if (undoable) undo(undoable);
    },
    "?": () => setHelp(true),
  });

  const confirmRosc = (signs: RoscSign[]) => {
    logRosc(log, seq, signs);
    setRosc(null);
  };
  const swap = (p: Person) =>
    logProcedure(log, seq, "compressor_swap", { to: { userId: p.userId, name: p.name } });

  if (!hydrated)
    return (
      <section data-testid="arrest-console" aria-labelledby="arrest-console-title">
        <h2
          id="arrest-console-title"
          className="text-heading-s dark:bg-status-critical-bg dark:text-status-critical-fg rounded-lg bg-rose-600 px-4 py-2 text-white"
        >
          Cardiac arrest
        </h2>
      </section>
    );

  return (
    <section
      ref={rootRef}
      data-testid="arrest-console"
      aria-labelledby="arrest-console-title"
      className="flex flex-col gap-3"
    >
      {createPortal(
        <div ref={liveRef} aria-live="assertive" aria-atomic="true" className="sr-only" />,
        document.body,
      )}
      <ArrestStrip
        headingRef={headingRef}
        seq={seq}
        arrest={arrest}
        now={now}
        startedAtIso={initial.episode.startedAtIso}
        audio={audio}
        ageUnknown={ctx.ageYears === null}
        onHelp={() => setHelp(true)}
      />

      {!inArrest && seq > 0 ? (
        <p
          role="status"
          className="border-border bg-muted/40 text-body-s rounded-lg border px-3 py-2"
        >
          {arrest.status === "rosc"
            ? "ROSC recorded — the post-ROSC view opens as the record updates."
            : "Resuscitation stopped — confirmation of death opens as the record updates."}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
        <CyclePanel arrest={arrest} now={now} people={people} onSwap={swap} />
        <NextPanel arrest={arrest} now={now} />
      </div>
      <SpecialBanner arrest={arrest} flags={flags} />
      <RhythmRow
        current={arrest.currentRhythm}
        onRhythm={(r) => logRhythm(log, seq, r)}
        onPulse={(present) => {
          logRhythm(log, seq, "organised", present);
          if (present) setRosc({ pulse: true });
        }}
      />
      <LogRow
        arrest={arrest}
        now={now}
        ctx={ctx}
        stackOk={stackOk}
        bayProfiles={initial.bayProfiles}
        log={log}
        onPrescribe={ui.openPrescribe}
      />
      <ReversibleCauses
        causes={arrest.causes}
        paediatric={arrest.paediatric}
        onSet={(c, s) => logCause(log, seq, c, s)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          data-console-key="o"
          onClick={() => setRosc({ pulse: false })}
          className={consoleBtn("primed", "min-w-40 justify-center px-6")}
        >
          <HeartPulseIcon aria-hidden className="size-5" />
          <span className="text-body-m font-medium">ROSC</span>
          <CheckIcon aria-hidden className="size-5" />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <ArrestDetails arrestSeq={seq} />
          <button
            type="button"
            onClick={() => ui.openTermination()}
            className="tap border-border text-body-m hover:bg-muted inline-flex min-h-14 items-center rounded-md border bg-transparent px-5 font-medium"
          >
            Stop resuscitation…
          </button>
        </div>
      </div>

      <LogStrip
        entries={entries}
        pending={store.pending}
        online={store.online}
        arrestAtMs={arrest.arrestAtMs}
        undoable={undoable}
        onUndo={(id) => undo(id)}
        onOpenDialog={reopen}
      />

      {rosc ? (
        <RoscConfirm
          presetPulse={rosc.pulse}
          onConfirm={confirmRosc}
          onClose={() => setRosc(null)}
        />
      ) : null}
      {help ? <KeysHelp onClose={() => setHelp(false)} /> : null}
    </section>
  );
}
