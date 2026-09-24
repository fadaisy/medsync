"use client";

import type { DoNowItem } from "@/lib/resus/model";
import type { AbcdeLetter } from "@/lib/resus/types";
import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { recordReturnToAV2 } from "@/app/nurse/resus/_v2/actions-survey";
import { computeDoNow } from "@/lib/resus/survey/do-now";
import { cn } from "@/lib/utils";
import {
  ActionStateToken,
  EscalateButton,
  escalationFor,
  isPrescribable,
  ROW_TINT,
  StepBadge,
  useSetActionState,
} from "./action-row";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

/**
 * Resus Desk v2 — the cross-step Do-now queue (prompt §5.5, GATE A ⓖ). The pure
 * engine ranks; this shows the top 3 (the top 1 on a phone) with one button
 * each, and the rest behind "N more". Polite live region names the top item.
 * A failed action is the Law 5 alarm: red tint, "Failed" token, the signed
 * next step, and Escalate. Nothing here in a read-only (closed) episode.
 */

const BTN =
  "tap text-body-s inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-3 font-medium disabled:opacity-50";
const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary-hover";
const SECONDARY = "border-border bg-card text-foreground hover:bg-muted border";

/** Move focus to the step panel heading so a step change off-screen is seen and heard. */
function focusStepHeading() {
  requestAnimationFrame(() => document.getElementById("survey-step-heading")?.focus());
}

export function DoNow() {
  const { store, ui, survey, allergiesRecorded } = useDeskCtx();
  const setActionState = useSetActionState();
  const [open, setOpen] = useState(false);
  const firstDrugPending = !store.activeEvents.some((e) => e.kind === "drug");
  const { top, rest } = useMemo(
    () =>
      computeDoNow({
        states: survey.states,
        actions: survey.actions,
        signals: survey.signals,
        vitals: survey.measure.values,
        allergiesRecorded,
        firstDrugPending,
      }),
    [survey, allergiesRecorded, firstDrugPending],
  );
  if (store.readOnly) return null;
  const all = [...top, ...rest];

  const goTo = (s: AbcdeLetter) => {
    ui.setActiveStep(s);
    focusStepHeading();
  };
  const returnToA = (because: string | null) => {
    ui.saveDraft();
    store.submit({
      label: "Return to A",
      optimistic: () => [
        {
          kind: "reassessment",
          step: "A",
          payload: {
            returnToA: true,
            label: because ? `Returned to A — ${because}` : "Returned to A (reassess from the top)",
          },
        },
      ],
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(
          await recordReturnToAV2({
            episodeId: store.episode.id,
            clientEventId,
            recordedAt,
            reason: because?.slice(0, 200),
          }),
        ),
    });
    goTo("A");
  };

  /** One button per item (never more). */
  function button(it: DoNowItem) {
    const go = (s: AbcdeLetter) => (
      <button
        type="button"
        className={cn(BTN, SECONDARY)}
        aria-label={`Go to ${s}: ${it.label}`}
        onClick={() => goTo(s)}
      >
        Go to {s}
      </button>
    );
    if (it.kind === "action" && it.action) {
      const { step, code, state } = it.action;
      if (state === "failed") {
        const esc = escalationFor(step, code);
        return esc ? <EscalateButton step={step} esc={esc} /> : go(step);
      }
      if (isPrescribable(code))
        return (
          <button
            type="button"
            className={cn(BTN, PRIMARY)}
            aria-label={`Prescribe: ${it.label}`}
            onClick={() => ui.openPrescribe({ recCode: code, recLabel: it.label })}
          >
            Prescribe
          </button>
        );
      return (
        <button
          type="button"
          className={cn(BTN, PRIMARY)}
          aria-label={`Done: ${it.label}`}
          onClick={() => setActionState(step, code, it.label, "performed")}
        >
          Done
        </button>
      );
    }
    if (it.kind === "return_to_a")
      return (
        <button type="button" className={cn(BTN, PRIMARY)} onClick={() => returnToA(it.because)}>
          Return to A
        </button>
      );
    if (it.kind === "vitals_stale")
      return (
        <button type="button" className={cn(BTN, SECONDARY)} onClick={() => ui.openVitals()}>
          Record vitals
        </button>
      );
    if (it.kind === "allergies")
      return (
        <button type="button" className={cn(BTN, SECONDARY)} onClick={ui.openAmple}>
          Record allergies
        </button>
      );
    return it.step ? go(it.step) : null;
  }
  const shown = open ? all : top;
  return (
    <section aria-labelledby="do-now-heading" className="flex flex-col gap-3">
      <h2 id="do-now-heading" className="text-overline text-muted-foreground uppercase">
        Do now
      </h2>
      <p className="sr-only" aria-live="polite">
        {top[0] ? `Do now: ${top[0].label}` : ""}
      </p>
      {all.length === 0 ? (
        <p className="text-body-s text-muted-foreground">Nothing outstanding.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((it, i) => {
            const failed = it.kind === "action" && it.action?.state === "failed";
            const esc = failed && it.action ? escalationFor(it.action.step, it.action.code) : null;
            return (
              <li
                key={it.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3",
                  failed
                    ? ROW_TINT.failed
                    : i === 0
                      ? "border-amber-300/80 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/20"
                      : "border-border bg-card",
                  // Phone: only the top item until "N more" is opened.
                  !open && i > 0 && "hidden lg:flex",
                )}
              >
                <div className="flex items-start gap-3">
                  {it.step ? <StepBadge step={it.step} /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-body-s text-foreground font-medium">{it.label}</p>
                    {failed ? (
                      <p className="text-body-s text-rose-700 dark:text-rose-200">
                        Failed.
                        {esc ? (
                          <>
                            {" "}
                            Next step: <span className="font-medium">{esc.label}</span>
                          </>
                        ) : null}
                      </p>
                    ) : it.because ? (
                      <p className="text-body-s text-muted-foreground">{it.because}</p>
                    ) : null}
                  </div>
                  {failed ? <ActionStateToken state="failed" /> : null}
                </div>
                <div className="flex justify-end">{button(it)}</div>
              </li>
            );
          })}
        </ul>
      )}
      {all.length > 1 ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(
            "tap text-body-s text-foreground hover:bg-muted inline-flex min-h-11 items-center justify-between gap-2 rounded-md px-3 font-medium",
            !open && rest.length === 0 && "lg:hidden",
          )}
        >
          {open ? (
            "Show less"
          ) : (
            <span>
              <span className="lg:hidden">{all.length - 1} more</span>
              <span className="hidden lg:inline">{rest.length} more</span>
            </span>
          )}
          <ChevronDownIcon
            className={cn(
              "ease-expo-out size-4 transition-transform duration-150 motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      ) : null}
    </section>
  );
}
