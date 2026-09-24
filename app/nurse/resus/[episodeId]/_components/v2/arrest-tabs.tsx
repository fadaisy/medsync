"use client";

import { useMemo } from "react";
import { PauseIcon, TimerIcon, TriangleAlertIcon } from "lucide-react";

import { computeArrestState } from "@/lib/resus/als/engine";
import { cn } from "@/lib/utils";
import { fmtMs, toneClass, useArrestCtx } from "./arrest-console-model";
import { useDeskCtx } from "./desk-context";
import { useNow } from "./use-desk";

const container = "mx-auto w-full max-w-screen-2xl px-4 sm:px-6";

const segment =
  "tap text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 font-medium";
/** Selected = fill + a 1 px ring, so the state holds 3:1 in both themes. */
const selectedSegment = "text-foreground bg-gray-150 ring-1 ring-gray-500 ring-inset";

/**
 * Arrest mode: the console, or the paused survey (UI-BUILD-SPEC §6). The
 * selected tab is neutral — the console's own strip carries the arrest red.
 */
export function ArrestTabs() {
  const { ui } = useDeskCtx();
  return (
    <div className={cn(container, "flex flex-wrap items-center gap-2 pt-3")}>
      <div
        role="group"
        aria-label="Arrest view"
        className="border-border inline-flex gap-1 rounded-lg border p-1"
      >
        <button
          type="button"
          aria-pressed={!ui.surveyTab}
          onClick={() => ui.setSurveyTab(false)}
          className={cn(
            segment,
            ui.surveyTab ? "hover:bg-muted text-rose-700 dark:text-rose-300" : selectedSegment,
          )}
        >
          <TriangleAlertIcon aria-hidden className="size-4 text-rose-700 dark:text-rose-300" />
          Arrest console
        </button>
        <button
          type="button"
          aria-pressed={ui.surveyTab}
          onClick={() => ui.setSurveyTab(true)}
          className={cn(
            segment,
            ui.surveyTab ? selectedSegment : "text-muted-foreground hover:bg-muted",
          )}
        >
          <PauseIcon aria-hidden className="size-4" />
          Survey (paused)
        </button>
      </div>
      {ui.surveyTab ? <ArrestDue /> : null}
    </div>
  );
}

/**
 * Spec §5.9 "audio is never the only cue": behind the Survey (paused) tab the
 * console is hidden, so what it says is due shows here in words (amber, never
 * red). Its own ticking leaf; the assertive announcement stays with the
 * console, whose live region is portalled outside the hidden subtree.
 */
function ArrestDue() {
  const { store, ui } = useDeskCtx();
  const ctx = useArrestCtx();
  const now = useNow(store.nowMs, 1000);
  const a = useMemo(
    () => computeArrestState(store.activeEvents, now, ctx),
    [store.activeEvents, now, ctx],
  );
  if (a.status !== "in_arrest") return null;
  const cues: { key: string; text: string; tone: "due" | "overdue" }[] = [];
  const { cycle, adrenaline } = a;
  const late = cycle.status === "due" ? "due" : cycle.status === "overdue" ? "overdue" : null;
  if (late && cycle.startedAtMs !== null && cycle.dueAtMs !== null)
    cues.push({
      key: "cycle",
      text: `Rhythm check ${late} +${fmtMs(now - cycle.dueAtMs)}`,
      tone: late,
    });
  if (adrenaline.status === "due_now" || adrenaline.status === "window_open")
    cues.push({ key: "adrenaline", text: "Adrenaline due", tone: "due" });
  else if (adrenaline.status === "overdue")
    cues.push({ key: "adrenaline", text: "Adrenaline overdue", tone: "overdue" });
  return cues.map((c) => (
    <button
      key={c.key}
      type="button"
      onClick={() => ui.setSurveyTab(false)}
      className={cn(segment, "border", toneClass(c.tone, true))}
    >
      <TimerIcon aria-hidden className="size-4" />
      <span className="tabular-nums">{c.text}</span>
    </button>
  ));
}
