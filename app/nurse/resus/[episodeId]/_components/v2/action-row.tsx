"use client";

import type { BoardAction } from "@/lib/resus/survey/floor";
import type { AbcdeLetter } from "@/lib/resus/types";
import type { ActionState } from "@/lib/resus/v2-payloads";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  CheckIcon,
  CircleDotIcon,
  EllipsisIcon,
  LoaderCircleIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  SyringeIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { setStepActionStateV2 } from "@/app/nurse/resus/_v2/actions-survey";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RECOMMENDATION_DRUG_MAP } from "@/lib/prescribing/reference/emergency-drug-catalog";
import { airwayAction } from "@/lib/resus/reference/airway-catalog";
import { breathingAction } from "@/lib/resus/reference/breathing-catalog";
import { circulationAction } from "@/lib/resus/reference/circulation-catalog";
import { disabilityAction } from "@/lib/resus/reference/disability-catalog";
import { exposureAction } from "@/lib/resus/reference/exposure-catalog";
import { buildActionStatePayload } from "@/lib/resus/v2-payloads";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

/**
 * Resus Desk v2 — one action row (prompt §5.5): title, step badge, the engine's
 * "why" line, the current state as a token (icon + word, DESIGN-medsync action
 * tokens) and at most three controls: a primary (Done, or Prescribe for a drug),
 * Start where the action takes time (tier ≥ 2), and ⋯ for Failed / Defer /
 * Not indicated / Why + source. Failed shows the signed escalation inline.
 */

interface CatalogEntry {
  code: string;
  label: string;
  tier: number;
  source: string;
  escalatesTo?: string;
}

/** The step's signed action catalog (label, tier, source, escalation). */
export const STEP_CATALOG: Record<AbcdeLetter, (code: string) => CatalogEntry | null> = {
  A: airwayAction,
  B: breathingAction,
  C: circulationAction,
  D: disabilityAction,
  E: exposureAction,
};

/** A drug the prescribe dialog knows (its recommendation code maps to a drug). */
export function isPrescribable(code: string): boolean {
  return Object.hasOwn(RECOMMENDATION_DRUG_MAP, code);
}

export const ACTION_STATE: Record<ActionState, { label: string; icon: LucideIcon; token: string }> =
  {
    indicated: {
      label: "Indicated",
      icon: CircleDotIcon,
      token: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    },
    in_progress: {
      label: "In progress",
      icon: LoaderCircleIcon,
      token: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    },
    performed: {
      label: "Performed",
      icon: CheckIcon,
      // The teal ramp flips in .dark: no dark: overrides.
      token: "bg-teal-100 text-teal-800",
    },
    failed: {
      label: "Failed",
      icon: TriangleAlertIcon,
      token: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200",
    },
    deferred: { label: "Deferred", icon: PauseIcon, token: "bg-muted text-muted-foreground" },
    not_indicated: {
      label: "Not indicated",
      icon: MinusIcon,
      token: "border-border text-muted-foreground border",
    },
  };

export const ROW_TINT: Record<ActionState, string> = {
  indicated: "border-amber-300/70 bg-amber-50/40 dark:border-amber-700/50 dark:bg-amber-950/15",
  in_progress: "border-blue-300/60 bg-blue-50/40 dark:border-blue-800/50 dark:bg-blue-950/15",
  performed: "border-border bg-muted/30",
  failed: "border-rose-300 bg-rose-50/60 dark:border-rose-800/60 dark:bg-rose-950/20",
  deferred: "border-border",
  not_indicated: "border-border",
};

export function StepBadge({ step }: { step: AbcdeLetter }) {
  return (
    <span className="bg-muted text-foreground text-caption inline-flex size-6 shrink-0 items-center justify-center rounded-sm font-mono">
      <span className="sr-only">Step </span>
      {step}
    </span>
  );
}

export function ActionStateToken({ state }: { state: ActionState }) {
  const s = ACTION_STATE[state];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "text-caption inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5",
        s.token,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

/** Record an action state (optimistic row = the server's own payload). */
export function useSetActionState() {
  const { store } = useDeskCtx();
  return (step: AbcdeLetter, code: string, label: string, state: ActionState) => {
    const built = buildActionStatePayload({ step, actionId: code, actionCode: code, state });
    if (!built) return;
    store.submit({
      label: `${label} — ${ACTION_STATE[state].label.toLowerCase()}`,
      optimistic: () => [{ kind: built.kind, step, payload: built.payload }],
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(
          await setStepActionStateV2({
            episodeId: store.episode.id,
            clientEventId,
            recordedAt,
            step,
            actionId: code,
            actionCode: code,
            state,
          }),
        ),
    });
  };
}

const BTN =
  "tap text-body-s inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 font-medium disabled:opacity-50";
const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-primary-hover`;
const BTN_SECONDARY = `${BTN} border-border bg-card text-foreground hover:bg-muted border`;

/** The signed next-tier action for a failed one (catalog `escalatesTo`), or null. */
export function escalationFor(step: AbcdeLetter, code: string): CatalogEntry | null {
  const next = STEP_CATALOG[step](code)?.escalatesTo;
  return next ? STEP_CATALOG[step](next) : null;
}

/** Escalate a failed action: prescribe the next tier, or start it. */
export function EscalateButton({ step, esc }: { step: AbcdeLetter; esc: CatalogEntry }) {
  const { ui } = useDeskCtx();
  const setState = useSetActionState();
  return (
    <button
      type="button"
      className={`${BTN} border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/30`}
      aria-label={`Escalate to ${esc.label}`}
      onClick={() =>
        isPrescribable(esc.code)
          ? ui.openPrescribe({ recCode: esc.code, recLabel: esc.label })
          : setState(step, esc.code, esc.label, "in_progress")
      }
    >
      Escalate
    </button>
  );
}

export function ActionRow({ action }: { action: BoardAction }) {
  const { store, ui } = useDeskCtx();
  const setState = useSetActionState();
  const [why, setWhy] = useState(false);
  const { step, code, label } = action;
  const state: ActionState = action.state ?? "indicated";
  const cat = STEP_CATALOG[step](code);
  const drug = isPrescribable(code);
  const esc = state === "failed" ? escalationFor(step, code) : null;
  // Say it once: no line that repeats the title.
  const evidence =
    action.rationale && action.rationale.trim().toLowerCase() !== label.trim().toLowerCase()
      ? action.rationale
      : null;
  const set = (s: ActionState) => setState(step, code, label, s);
  const canWrite = !store.readOnly && cat !== null;

  const primary =
    state === "performed" ? null : drug ? (
      <button
        type="button"
        className={BTN_PRIMARY}
        aria-label={`Prescribe: ${label}`}
        onClick={() => ui.openPrescribe({ recCode: code, recLabel: label })}
      >
        <SyringeIcon className="size-4" aria-hidden />
        Prescribe
      </button>
    ) : (
      <button
        type="button"
        className={BTN_PRIMARY}
        aria-label={`Done: ${label}`}
        onClick={() => set("performed")}
      >
        <CheckIcon className="size-4" aria-hidden />
        Done
      </button>
    );

  const secondary = esc ? (
    <EscalateButton step={step} esc={esc} />
  ) : (cat?.tier ?? 1) >= 2 && !drug && (state === "indicated" || state === "deferred") ? (
    <button
      type="button"
      className={BTN_SECONDARY}
      aria-label={`Start: ${label}`}
      onClick={() => set("in_progress")}
    >
      <PlayIcon className="size-4" aria-hidden />
      Start
    </button>
  ) : null;

  return (
    <li
      data-action-row
      className={cn("flex flex-col gap-2 rounded-lg border p-3", ROW_TINT[state])}
    >
      <div className="flex items-start gap-3">
        <StepBadge step={step} />
        <div className="min-w-0 flex-1">
          <p className="text-body-s text-foreground font-medium">{label}</p>
          {evidence ? (
            <p className="text-body-s text-muted-foreground line-clamp-2">{evidence}</p>
          ) : null}
        </div>
        <ActionStateToken state={state} />
      </div>

      {esc ? (
        <p className="text-body-s text-rose-700 dark:text-rose-200">
          Failed. Next step: <span className="font-medium">{esc.label}</span>
        </p>
      ) : null}

      {canWrite ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {primary}
          {secondary}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(BTN_SECONDARY, "w-11 px-0")}
                  aria-label={`More for ${label}`}
                />
              }
            >
              <EllipsisIcon className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem className="text-body-s min-h-11 px-3" onClick={() => setWhy(!why)}>
                {why ? "Hide why + source" : "Why + source"}
              </DropdownMenuItem>
              {drug && state !== "performed" ? (
                <DropdownMenuItem
                  className="text-body-s min-h-11 px-3"
                  onClick={() => set("performed")}
                >
                  Mark done
                </DropdownMenuItem>
              ) : null}
              {(["failed", "deferred", "not_indicated"] as const)
                .filter((s) => s !== state)
                .map((s) => (
                  <DropdownMenuItem
                    key={s}
                    className="text-body-s min-h-11 px-3"
                    onClick={() => set(s)}
                  >
                    {s === "failed" ? "Failed" : s === "deferred" ? "Defer" : "Not indicated"}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      {why ? (
        <div className="border-border text-body-s text-muted-foreground flex flex-col gap-1 border-t pt-2">
          {action.rationale ? <p>{action.rationale}</p> : null}
          {cat ? (
            <p className="text-caption">
              Tier {cat.tier} · Source: {cat.source}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
