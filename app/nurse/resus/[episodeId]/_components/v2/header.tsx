"use client";

import type { DeskMode } from "./mode-clock";
import type { OutcomeCode } from "@/lib/resus/model";
import type { ReactNode } from "react";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeftIcon, ClockAlertIcon, SirenIcon, TriangleAlertIcon } from "lucide-react";

import { idleClass } from "@/lib/resus/closeout/idle";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";
import { deskMode, formatClock, ModeClock } from "./mode-clock";
import { useReArrest } from "./post-rosc-rearrest";
import { unsavedSteps } from "./step-panel-draft";
import { TeamChip } from "./team-popover";
import { useNow } from "./use-desk";

const OUTCOME_LABEL: Record<OutcomeCode, string> = {
  stabilised: "Stabilised",
  rosc_sustained: "ROSC, sustained",
  rosc_not_sustained: "ROSC, not sustained",
  died_after_cpr: "Died after CPR",
  died_cpr_not_attempted: "Died, CPR not attempted",
  transferred_out: "Transferred out",
};

const TRIGGER_LABEL: Record<string, string> = {
  triage_red: "Triage red",
  step0_life_threat: "Step-0 life threat",
  in_resus_deterioration: "Deterioration in resus",
};

const actionBtn =
  "tap text-body-s inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 font-medium";

/**
 * The sticky desk header (prompt §5.7, GATE A §2 ⓐ–ⓔ). Row 1: who (Board, the
 * RESUS tag, patient, trigger, bay) and the Emergency affordance at the far
 * right — a red OUTLINE, on its own row so it never competes with the solid
 * Arrest. Row 2: the mode clocks, then the team chip, End resus (teal
 * outline) and Arrest / Re-arrest (solid red; hidden while in arrest). The
 * meta line names the episode's department, never the viewer's.
 * Read-only episodes show their state + outcome instead of any action.
 */
export function DeskHeader() {
  const { initial, store, ui, inArrest } = useDeskCtx();
  const { patient, bayProfiles } = initial;
  const episode = store.episode;
  const mode = deskMode(store.activeEvents, episode, inArrest);
  const waiting = store.pending.length;
  const reArrest = useReArrest();

  const name = patient.displayName ?? "Unidentified patient";
  const ageSex = [
    patient.ageYears != null ? `${patient.ageYears}y` : null,
    patient.sex ? patient.sex.charAt(0).toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(" ");
  const bay = bayProfiles.find((b) => b.id === episode.bayProfileId)?.label ?? null;
  const meta = [
    episode.triggerReason ?? TRIGGER_LABEL[episode.triggerKind] ?? episode.triggerKind,
    bay,
    episode.departmentName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <header className="border-border bg-background/95 sticky top-0 z-30 border-b supports-backdrop-filter:backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-1.5 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={initial.basePath}
            aria-label="Back to board"
            onClick={(e) => {
              // The write queue lives in memory (E1): leaving would drop it.
              const drafts = unsavedSteps(store.episode.id, store.activeEvents);
              if (waiting === 0 && drafts.length === 0) return;
              const msg = [
                waiting > 0
                  ? `${waiting} ${waiting === 1 ? "entry is" : "entries are"} still waiting to send.`
                  : null,
                drafts.length > 0
                  ? `Unsaved findings in ${drafts.join(", ")} (kept on this device until recorded).`
                  : null,
                "Leave anyway?",
              ];
              if (!window.confirm(msg.filter(Boolean).join(" "))) e.preventDefault();
            }}
            className="tap text-body-s text-muted-foreground hover:text-foreground inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md sm:justify-start sm:pr-1"
          >
            <ArrowLeftIcon aria-hidden className="size-4" />
            <span className="hidden sm:inline">Board</span>
          </Link>
          <span className="text-overline shrink-0 rounded-sm bg-rose-600 px-1.5 py-0.5 font-mono text-white">
            RESUS
          </span>
          <div className="min-w-0 flex-1">
            <h1 id="resus-desk-title" tabIndex={-1} className="text-body-m truncate font-medium">
              {name}
              {ageSex ? (
                <span className="text-body-s text-muted-foreground ml-2 font-mono">{ageSex}</span>
              ) : null}
            </h1>
            {meta ? (
              <p className="text-caption text-muted-foreground hidden truncate sm:block">{meta}</p>
            ) : null}
          </div>
          <Link
            href="/emergency"
            aria-label="Emergency — get help now"
            // The floating platform pill stands down while this one is on the page.
            data-emergency-inline
            // Never lose waiting entries on the way to help: open it beside the desk.
            target={waiting > 0 ? "_blank" : undefined}
            className={cn(
              actionBtn,
              "border border-rose-600 text-rose-700 hover:bg-rose-50 dark:border-rose-500 dark:text-rose-300 dark:hover:bg-rose-950/40",
            )}
          >
            <SirenIcon aria-hidden className="size-4" />
            Emergency
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Clocks mode={mode} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {store.readOnly ? (
              <ClosedBadge />
            ) : (
              <>
                <TeamChip />
                <button
                  type="button"
                  onClick={() => ui.openCloseOut({ arrestEnding: mode === "arrest" })}
                  className={cn(actionBtn, "border border-teal-600 text-teal-700 hover:bg-teal-50")}
                >
                  End resus
                </button>
                {mode === "arrest" || mode === "death_confirmed" ? null : (
                  <button
                    type="button"
                    // Post-ROSC: one tap, like the panel's Re-arrest (ALS-ROSC-07).
                    onClick={mode === "post_rosc" ? reArrest : () => ui.openArrestConfirm("desk")}
                    aria-label={
                      mode === "post_rosc" ? "Declare re-arrest" : "Declare cardiac arrest"
                    }
                    className={cn(
                      actionBtn,
                      "bg-rose-600 text-white hover:bg-rose-700",
                      // Dark: the design system's soft emergency pair, as buttonVariants emergency.
                      "dark:bg-status-critical-bg dark:text-status-critical-fg dark:hover:bg-status-critical-bg/70 dark:border dark:border-red-900",
                    )}
                  >
                    <TriangleAlertIcon aria-hidden className="size-4" />
                    {mode === "post_rosc" ? "Re-arrest" : "Arrest"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ─── Clocks (ⓐ): T+, then A+ / ROSC / Boarding by mode ─────────────── */

function Tick({
  prefix,
  sinceIso,
  label,
  className,
}: {
  prefix: string;
  sinceIso: string;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span aria-hidden className="text-overline">
        {prefix}
      </span>
      <span className="text-heading-s lg:text-heading-m">
        <ModeClock sinceIso={sinceIso} label={label} />
      </span>
    </span>
  );
}

/** A frozen duration (boarding stops the resus clock; a closed episode lasted). */
function Frozen({ prefix, ms }: { prefix: string; ms: number }) {
  return (
    <span className="text-muted-foreground inline-flex items-baseline gap-1.5">
      <span className="text-overline">{prefix}</span>
      <span className="text-heading-s font-mono tabular-nums">{formatClock(ms)}</span>
    </span>
  );
}

function Clocks({ mode }: { mode: DeskMode }) {
  const { store } = useDeskCtx();
  const ep = store.episode;
  const ev = store.activeEvents;
  const startMs = Date.parse(ep.startedAtIso);

  if (mode === "closed")
    return ep.endedAtIso ? (
      <Frozen prefix="Lasted" ms={Date.parse(ep.endedAtIso) - startMs} />
    ) : null;

  const tPlus = (
    <Tick prefix="T+" sinceIso={ep.startedAtIso} label="Time since the resus started" />
  );
  let second: ReactNode = null;
  if (mode === "arrest") {
    const at = ev.findLast((e) => e.kind === "arrest_detected")?.recordedAt;
    if (at)
      second = (
        <Tick
          prefix="A+"
          sinceIso={at}
          label="Time since the arrest was declared"
          className="text-rose-700 dark:text-rose-300"
        />
      );
  } else if (mode === "post_rosc") {
    const at = ev.findLast((e) => e.kind === "rosc")?.recordedAt;
    if (at)
      second = (
        <Tick prefix="ROSC" sinceIso={at} label="Time since ROSC" className="text-teal-700" />
      );
  } else if (mode === "boarding") {
    const at =
      ep.dispositionDecidedAtIso ??
      ev.findLast((e) => e.kind === "decision" && e.payload.phase === "boarding")?.recordedAt;
    if (at)
      return (
        <IdleOr>
          <Frozen prefix="Resus" ms={Date.parse(at) - startMs} />
          <Tick prefix="Boarding" sinceIso={at} label="Time boarding" />
        </IdleOr>
      );
  }
  return (
    <IdleOr>
      {tPlus}
      {second}
    </IdleOr>
  );
}

/**
 * D14: an idle episode shows how long nothing has happened instead of a
 * runaway clock (CO-IDLE-01 at 2 h). Re-checked every 30 s, not every second.
 */
function IdleOr({ children }: { children: ReactNode }) {
  const { store } = useDeskCtx();
  const now = useNow(store.nowMs, 30_000);
  const lastMs = useMemo(() => {
    let m = Date.parse(store.episode.lastActivityAtIso ?? store.episode.startedAtIso);
    for (const e of store.events) m = Math.max(m, Date.parse(e.createdAt));
    for (const p of store.pending) m = Math.max(m, p.queuedAtMs);
    return m;
  }, [store.episode, store.events, store.pending]);
  const idle = idleClass(lastMs, now);
  if (idle.class === "active")
    return <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">{children}</div>;
  return (
    <p
      className="text-body-s inline-flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200"
      suppressHydrationWarning
    >
      <ClockAlertIcon aria-hidden className="size-4 shrink-0" />
      {`${idle.label} — close or continue?`}
    </p>
  );
}

function ClosedBadge() {
  const { store } = useDeskCtx();
  const ep = store.episode;
  const state =
    ep.state === "cancelled"
      ? "Cancelled"
      : ep.closureKind === "administrative"
        ? "Closed administratively"
        : "Ended";
  const outcome = ep.outcomeCode ? OUTCOME_LABEL[ep.outcomeCode] : null;
  return (
    <span className="text-caption bg-status-pending-bg text-status-pending-fg rounded-sm px-2.5 py-1">
      {outcome ? `${state} · ${outcome}` : state} · read-only
    </span>
  );
}
