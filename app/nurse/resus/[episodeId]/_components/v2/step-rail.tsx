"use client";

import type { StepState, StepVisual } from "@/lib/resus/model";
import { RotateCcwIcon } from "lucide-react";

import { recordReturnToAV2 } from "@/app/nurse/resus/_v2/actions-survey";
import { ABCDE_CATALOG } from "@/lib/resus/reference/abcde-catalog";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

/*
 * DESIGN-medsync "Resus state colour system" → ABCDE step-bar states. The teal
 * ramp flips with the theme on its own (teal-50 is deep teal in dark), so only
 * amber needs dark overrides; the filled Addressed chip keeps its contrast in
 * dark with the dark end of the ramp for its letter. Qualifier text is never
 * faded: on the red card that would drop it below 4.5:1.
 */
const CARD: Record<StepVisual, string> = {
  pending: "border-border bg-muted/30 text-muted-foreground",
  clear: "border-teal-300/70 bg-teal-50/60 text-teal-800",
  addressed: "border-teal-600/60 bg-teal-600/10 text-teal-800",
  threatened:
    "border-amber-300/80 bg-amber-50/70 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200",
  active_threat: "border-rose-600 bg-rose-600 text-white ring-1 ring-rose-500/50",
};

const CHIP: Record<StepVisual, string> = {
  pending: "bg-muted text-muted-foreground",
  clear: "bg-teal-100 text-teal-700",
  addressed: "bg-teal-700 text-white dark:text-teal-50",
  threatened: "bg-amber-400 text-amber-950",
  active_threat: "bg-white text-rose-700",
};

const WORD: Record<StepVisual, string> = {
  pending: "Pending",
  clear: "Clear",
  addressed: "Addressed",
  threatened: "Threatened",
  active_threat: "Active threat",
};

const OPEN: ReadonlySet<StepVisual> = new Set(["pending", "threatened", "active_threat"]);

/** "from vitals" / "not assessed" — the two qualifiers GATE A §5 keeps visible. */
function qualifiers(s: StepState): string {
  return [
    s.fromVitals ? "from vitals" : null,
    !s.assessed && s.visual !== "pending" ? "not assessed" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const RETURN_LABEL = "Returned to A (reassess from the top)";

/**
 * The step rail (GATE A §2): the five A–E states, doubling as the step tabs.
 * Current step = brand teal ring (E6); recommended next = teal dashed outline
 * (the first letter still pending or open, as v1's recommendedNextStep). Both
 * use the primary token so they hold 3:1 in either theme.
 */
export function StepRail() {
  const { survey, ui, store, initial } = useDeskCtx();
  const recommended = store.readOnly
    ? null
    : (survey.states.find((s) => OPEN.has(s.visual))?.step ?? null);

  function returnToA() {
    ui.saveDraft();
    ui.setActiveStep("A");
    store.submit({
      label: "Return to A",
      optimistic: () => [
        { kind: "reassessment", step: "A", payload: { returnToA: true, label: RETURN_LABEL } },
      ],
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(
          await recordReturnToAV2({ episodeId: initial.episode.id, clientEventId, recordedAt }),
        ),
    });
  }

  return (
    <nav aria-label="Primary survey steps" className="flex flex-wrap items-stretch gap-2">
      {/* Five equal columns: never a horizontal scroll, the active threat always in view.
          Below md each step is its letter over its state word (qualifiers stay in the name). */}
      <div className="grid min-w-0 flex-1 basis-full grid-cols-5 gap-1 md:gap-2 lg:basis-0">
        {survey.states.map((s) => {
          const v = s.visual;
          const focused = ui.activeStep === s.step;
          const next = recommended === s.step && !focused;
          const qual = qualifiers(s);
          return (
            <button
              key={s.step}
              type="button"
              onClick={() => ui.setActiveStep(s.step)}
              aria-current={focused ? "step" : undefined}
              aria-label={`${s.step} ${ABCDE_CATALOG[s.step].title}: ${WORD[v]}${qual ? `, ${qual}` : ""}${next ? ", recommended next" : ""}`}
              className={cn(
                "tap flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-0.5 py-1.5 text-center",
                "md:flex-row md:justify-start md:gap-2 md:px-2.5 md:text-left",
                CARD[v],
                focused && "ring-offset-background ring-primary ring-2 ring-offset-1",
                next && "outline-primary outline-1 outline-offset-1 outline-dashed",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "text-body-s flex size-7 shrink-0 items-center justify-center rounded-md font-mono font-medium",
                  CHIP[v],
                )}
              >
                {s.step}
              </span>
              <span aria-hidden className="flex min-w-0 flex-col">
                <span className="text-caption md:text-body-s font-medium wrap-break-word hyphens-auto">
                  {WORD[v]}
                </span>
                {qual ? <span className="text-caption hidden md:block">{qual}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {store.readOnly ? null : (
        <button
          type="button"
          onClick={returnToA}
          className="tap border-border bg-background text-foreground hover:bg-muted text-body-s ml-auto inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium"
        >
          <RotateCcwIcon aria-hidden className="size-4" />
          Return to A
        </button>
      )}
    </nav>
  );
}
