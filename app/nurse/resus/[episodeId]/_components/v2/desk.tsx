"use client";

import type { DeskCtxValue, DeskUi, PrescribeRequest } from "./desk-context";
import type { DeskMode } from "./mode-clock";
import type { DeskToast } from "./toast";
import type { DeskInitialData } from "./types";
import type { StepLocalToggles } from "@/lib/resus/model";
import type { AbcdeLetter } from "@/lib/resus/types";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { recordedAllergiesFromTimeline } from "@/lib/prescribing/administration";
import { EMPTY_LOCAL } from "@/lib/resus/model";
import { arrestActive, latestContext } from "@/lib/resus/survey/context";
import { computeSurvey } from "@/lib/resus/survey/floor";
import { cn } from "@/lib/utils";
import { PrescribeDialog } from "../prescribe-dialog";
import { AmpleDrawer } from "./ample-drawer";
import { ArrestConfirmDialog } from "./arrest-confirm";
import { NEEDS_DIALOG } from "./arrest-console-writes";
import { CloseOutSheet } from "./close-out-sheet";
import { DeskBanners } from "./desk-banners";
import { bottomBarShown, DeskBody, DeskBottomBar, RecordSheet } from "./desk-body";
import { DeskCtx } from "./desk-context";
import { DeskHeader } from "./header";
import { deskMode } from "./mode-clock";
import { TerminationReview } from "./termination-review";
import { Toaster } from "./toast";
import { useDesk, useNow } from "./use-desk";

/**
 * Resus Desk v2 — the root (UI-BUILD-SPEC §2, §6). Owns the store (useDesk),
 * the derived survey (recomputed when events change and on a 30 s tick for
 * vitals freshness — never every second), and the UI state every lane reads
 * through DeskCtx: the step in focus, the arrest-mode survey tab, step-local
 * toggles, and which dialog / sheet / toast is showing. It picks the mode
 * surface and hosts the dialogs so any lane can open them.
 */
export function ResusDeskV2({ initial }: { initial: DeskInitialData }) {
  const store = useDesk(initial);
  const events = store.activeEvents;
  const ageYears = initial.patient.ageYears;

  const flags = useMemo(() => latestContext(events), [events]);
  const inArrest = useMemo(() => arrestActive(events), [events]);
  const [local, setLocalState] = useState<StepLocalToggles>(EMPTY_LOCAL);
  const tick = useNow(store.nowMs, 30_000);
  const survey = useMemo(
    () => computeSurvey(events, { ageYears, nowMs: tick, inArrest, flags, local }),
    [events, ageYears, tick, inArrest, flags, local],
  );
  const allergiesRecorded = useMemo(
    () =>
      recordedAllergiesFromTimeline(events).length > 0 ||
      events.some(
        (e) => (e.payload as { allergyCapture?: { nkda?: boolean } }).allergyCapture?.nkda === true,
      ),
    [events],
  );

  /* ── UI state ── */
  const [activeStep, setActiveStep] = useState<AbcdeLetter>(
    () =>
      survey.states.find((s) => s.visual === "threatened" || s.visual === "active_threat")?.step ??
      "A",
  );
  // The survey tab belongs to one arrest: a new declaration opens on the console.
  const arrestKey = events.findLast((e) => e.kind === "arrest_detected")?.recordedAt ?? "";
  const [tab, setTab] = useState({ survey: false, key: "" });
  const surveyTab = tab.survey && tab.key === arrestKey;
  const setSurveyTab = useCallback(
    (v: boolean) => setTab({ survey: v, key: arrestKey }),
    [arrestKey],
  );
  const [arrestConfirm, setArrestConfirm] = useState<{ open: boolean; source: "desk" | "step" }>({
    open: false,
    source: "desk",
  });
  // The board's "Close" link (?close=1) opens the close-out sheet, as End resus would.
  const closeOnLoad = useSearchParams().get("close") === "1";
  const pathname = usePathname();
  const [closeOut, setCloseOut] = useState(() => ({
    open: closeOnLoad && !store.readOnly,
    arrestEnding: closeOnLoad && inArrest,
  }));
  useEffect(() => {
    // Drop the param without a server round trip, so a reload does not reopen the sheet.
    if (closeOnLoad) window.history.replaceState(null, "", pathname);
  }, [closeOnLoad, pathname]);
  const [termination, setTermination] = useState(false);
  const [ample, setAmple] = useState(false);
  // A queue: a block that arrives while another prescription is open waits its turn.
  const [prescribeQueue, setPrescribeQueue] = useState<(PrescribeRequest & { id: string })[]>([]);
  const prescribe = prescribeQueue[0] ?? null;
  // The dialog calls onDone() then onClose() in one tick only when a dose was recorded
  // (an allergy capture calls onDone alone) — this flag tells the two apart.
  const doseJustRecorded = useRef(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [vitalsCapture, setVitalsCapture] = useState<DeskUi["vitalsCapture"]>(null);
  const draftSaver = useRef<(() => void) | null>(null);
  const [toasts, setToasts] = useState<DeskToast[]>([]);
  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  const ui = useMemo<DeskUi>(
    () => ({
      activeStep,
      setActiveStep,
      surveyTab,
      setSurveyTab,
      local,
      setLocal: (patch) => setLocalState((prev) => ({ ...prev, ...patch })),
      openArrestConfirm: (source) => setArrestConfirm({ open: true, source }),
      openCloseOut: (opts) =>
        setCloseOut({ open: true, arrestEnding: opts?.arrestEnding ?? false }),
      openTermination: () => setTermination(true),
      openPrescribe: (d) => setPrescribeQueue((q) => [...q, { ...d, id: crypto.randomUUID() }]),
      openAmple: () => setAmple(true),
      vitalsCapture,
      openVitals: (opts) => setVitalsCapture(opts ?? {}),
      closeVitals: () => setVitalsCapture(null),
      toast: (t) => setToasts((prev) => [...prev, { ...t, id: crypto.randomUUID() }]),
      saveDraft: () => draftSaver.current?.(),
      setDraftSaver: (fn) => {
        draftSaver.current = fn;
      },
    }),
    [activeStep, surveyTab, setSurveyTab, local, vitalsCapture],
  );

  const mode = deskMode(events, store.episode, inArrest);
  useModeFocus(mode);
  const barShown = bottomBarShown(mode, surveyTab);

  // A write the server refused is announced once (an alert that stays), not only as
  // a muted "Not saved" in a record that may be closed. Labels carry no patient name;
  // a drug blocked for the prescribe dialog has its own warning. Keyed by entry, so
  // the alert leaves once the entry is retried or discarded.
  const announced = useRef(new Map<string, string>());
  const retry = store.retry;
  useEffect(() => {
    const next = new Map<string, string>();
    const add: DeskToast[] = [];
    for (const p of store.pending) {
      if (p.status !== "failed") continue;
      const had = announced.current.get(p.clientEventId);
      const id = had ?? crypto.randomUUID();
      next.set(p.clientEventId, id);
      if (had || p.error?.startsWith(NEEDS_DIALOG)) continue;
      const why = p.error ? ` — ${p.error}` : "";
      const clientEventId = p.clientEventId;
      add.push({
        id,
        tone: "error",
        message: `Not saved: ${p.label}${why}. The desk does not count it until it is saved.`,
        retry: () => retry(clientEventId),
      });
    }
    const kept = new Set(next.values());
    const gone = new Set([...announced.current.values()].filter((id) => !kept.has(id)));
    announced.current = next;
    if (add.length > 0 || gone.size > 0)
      setToasts((prev) => [...prev.filter((t) => !gone.has(t.id)), ...add]);
  }, [store.pending, retry]);

  const openRecord = useCallback(() => setRecordOpen(true), []);

  const ctx: DeskCtxValue = {
    initial,
    store,
    ui,
    ageYears,
    flags,
    inArrest,
    survey,
    allergiesRecorded,
  };

  return (
    <DeskCtx.Provider value={ctx}>
      <div
        data-resus-desk
        className={cn(
          "bg-background flex min-h-svh flex-col",
          // Reserve the fixed bottom bar's height (+ the safe area) so it never covers content.
          barShown && "pb-[calc(4rem+env(safe-area-inset-bottom))] xl:pb-0",
        )}
      >
        <DeskHeader />
        <DeskBanners />
        <DeskBody mode={mode} />
        <DeskBottomBar mode={mode} onOpenRecord={openRecord} />
      </div>

      <RecordSheet open={recordOpen} onClose={() => setRecordOpen(false)} />
      <ArrestConfirmDialog
        open={arrestConfirm.open}
        source={arrestConfirm.source}
        onClose={() => setArrestConfirm((s) => ({ ...s, open: false }))}
      />
      <CloseOutSheet
        open={closeOut.open}
        arrestEnding={closeOut.arrestEnding}
        onClose={() => setCloseOut((s) => ({ ...s, open: false }))}
      />
      <TerminationReview open={termination} onClose={() => setTermination(false)} />
      <AmpleDrawer open={ample} onClose={() => setAmple(false)} />
      {prescribe ? (
        <PrescribeDialog
          key={prescribe.id}
          episodeId={initial.episode.id}
          recCode={prescribe.recCode}
          recLabel={prescribe.recLabel}
          reasons={prescribe.reasons}
          patientAgeYears={ageYears}
          prescribeAuthority={initial.me.prescribeAuthority}
          timeline={events}
          onClose={() => {
            if (doseJustRecorded.current) prescribe.onRecorded?.();
            doseJustRecorded.current = false;
            setPrescribeQueue((q) => q.slice(1));
          }}
          onDone={() => {
            doseJustRecorded.current = true;
            queueMicrotask(() => {
              doseJustRecorded.current = false;
            });
            void store.refresh();
          }}
        />
      ) : null}
      <Toaster toasts={toasts} onDismiss={dismissToast} overConsole={!barShown} />
    </DeskCtx.Provider>
  );
}

/** Each mode's surface heading — where focus lands when the desk switches to it. */
const MODE_HEADING: Record<DeskMode, string> = {
  arrest: "#arrest-console-title",
  post_rosc: "#post-rosc-heading",
  confirm_death: "#death-heading",
  death_confirmed: "#death-confirmed-heading",
  boarding: "#boarding-title",
  closed: "#closed-summary-heading",
  survey: "#survey-step-heading",
};

/**
 * Focus follows every mode switch (UI-BUILD-SPEC §1) to the new surface's
 * heading, so it never drops to <body> when the control that caused the switch
 * unmounts. Not on first render; one frame late, after a closing sheet or
 * dialog has returned focus.
 */
function useModeFocus(mode: DeskMode) {
  const prev = useRef(mode);
  useEffect(() => {
    if (prev.current === mode) return;
    prev.current = mode;
    const id = requestAnimationFrame(() => {
      const el =
        document.querySelector<HTMLElement>(MODE_HEADING[mode]) ??
        document.getElementById("resus-desk-title");
      if (!el) return;
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [mode]);
}
