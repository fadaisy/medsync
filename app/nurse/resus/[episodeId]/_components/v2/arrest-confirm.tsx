"use client";

import type { ArrestSignsInput } from "@/lib/resus/model";
import type { RefObject } from "react";
import { useRef, useState } from "react";
import { HeartPulseIcon } from "lucide-react";

import { declareArrestV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { arrestSeqForDeclaration } from "@/lib/resus/als/rosc";
import { detectArrest } from "@/lib/resus/arrest";
import { ARREST_SEAM } from "@/lib/resus/reference/abcde-catalog";
import { cn } from "@/lib/utils";
import { CprNotAttempted } from "./cpr-not-attempted";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

/**
 * Resus Desk v2 — the one arrest state is set only here (D20): the multi-sign
 * confirm (responsive? breathing normally? central pulse? yes / no / unknown)
 * with a live verdict from the v1 criterion. Apnoea WITH a pulse is ventilation,
 * not CPR, so it never declares. From the header (source "desk") the three
 * answers start at "no" and focus sits on Declare: open + confirm = one tap more.
 */

type Tri = boolean | null;

const QUESTIONS: { key: keyof ArrestSignsInput; label: string }[] = [
  { key: "responsive", label: "Responsive to voice or pain?" },
  { key: "breathingNormally", label: "Breathing normally? (agonal gasps = no)" },
  { key: "centralPulse", label: "Central pulse?" },
];
const ANSWERS: { v: Tri; label: string }[] = [
  { v: true, label: "Yes" },
  { v: false, label: "No" },
  { v: null, label: "Unknown" },
];

export function ArrestConfirmDialog({
  open,
  source,
  onClose,
}: {
  open: boolean;
  source: "desk" | "step";
  onClose: () => void;
}) {
  const declareRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent
        className="gap-5 sm:max-w-md"
        initialFocus={source === "desk" ? declareRef : undefined}
      >
        <ConfirmBody source={source} onClose={onClose} declareRef={declareRef} />
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  source,
  onClose,
  declareRef,
}: {
  source: "desk" | "step";
  onClose: () => void;
  declareRef: RefObject<HTMLButtonElement | null>;
}) {
  const { store } = useDeskCtx();
  const preset: Tri = source === "desk" ? false : null;
  const [signs, setSigns] = useState<ArrestSignsInput>({
    responsive: preset,
    breathingNormally: preset,
    centralPulse: preset,
  });
  const verdict = detectArrest(signs);
  // Signed rule: apnoea with a pulse → bag-mask ventilation, not CPR.
  const ventilate = signs.breathingNormally === false && signs.centralPulse === true;
  const declarable = verdict.isArrest && !ventilate && !store.readOnly;

  function declare() {
    if (!declarable || !verdict.reason) return;
    const reason = verdict.reason;
    store.submit({
      label: "Declare arrest",
      // The same rule the server applies at the bedside time (ALS-ROSC-04/05): a
      // re-arrest after a sustained ROSC is a NEW arrest, so the console and every
      // one-tap entry queued behind this row count under the new number.
      optimistic: ({ recordedAt }) => {
        const arrestSeq = arrestSeqForDeclaration(store.activeEvents, Date.parse(recordedAt));
        return [
          {
            kind: "arrest_detected",
            step: "arrest",
            arrestSeq,
            payload: {
              arrestSeq,
              reason,
              signs,
              source,
              witnessed: null,
              monitored: null,
              label: `Cardiac arrest — ${reason}`,
            },
          },
          {
            kind: "cpr_started",
            step: "arrest",
            arrestSeq,
            payload: { arrestSeq, label: "CPR started" },
          },
        ];
      },
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(
          await declareArrestV2({
            episodeId: store.episode.id,
            clientEventId,
            recordedAt,
            signs,
            source,
          }),
        ),
    });
    onClose();
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-heading-s">Confirm cardiac arrest</DialogTitle>
        <DialogDescription className="text-body-s">
          {ARREST_SEAM.detectionCriteria}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {QUESTIONS.map((q) => (
          <fieldset key={q.key} className="flex flex-col gap-2">
            <legend className="text-body-s text-foreground mb-2 font-medium">{q.label}</legend>
            <div className="grid grid-cols-3 gap-2">
              {ANSWERS.map((a) => {
                const on = signs[q.key] === a.v;
                return (
                  <button
                    key={a.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSigns({ ...signs, [q.key]: a.v })}
                    className={cn(
                      "tap text-body-s min-h-11 rounded-md border px-3 font-medium",
                      on
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div aria-live="polite" className="text-body-s">
        {ventilate ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="font-medium">Ventilate (bag-mask) — not CPR.</span> Apnoea with a
            pulse: open the airway and ventilate. If the pulse is lost, answer No and declare.
          </p>
        ) : declarable ? (
          <p className="rounded-md border border-rose-300 bg-rose-50 p-3 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100">
            <span className="font-medium">Cardiac arrest: {verdict.reason}.</span>{" "}
            {ARREST_SEAM.cprPrompt}
          </p>
        ) : (
          <p className="border-border text-muted-foreground rounded-md border p-3">
            Arrest criteria not met on these answers.
          </p>
        )}
      </div>

      {/* The secondary decision (ALS-REC-07): only once the answers say arrest. */}
      {declarable ? <CprNotAttempted onRecorded={onClose} /> : null}

      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          className="tap text-body-s text-muted-foreground hover:bg-muted min-h-11 rounded-md px-4 font-medium"
        >
          Cancel
        </button>
        <button
          ref={declareRef}
          type="button"
          disabled={!declarable}
          onClick={declare}
          className="tap text-body-m dark:bg-status-critical-bg dark:text-status-critical-fg dark:hover:bg-status-critical-bg/70 inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-rose-600 px-6 font-medium text-white hover:bg-rose-700 disabled:opacity-40 dark:border dark:border-red-900"
        >
          <HeartPulseIcon className="size-5" aria-hidden />
          Declare arrest
        </button>
      </DialogFooter>
    </>
  );
}
