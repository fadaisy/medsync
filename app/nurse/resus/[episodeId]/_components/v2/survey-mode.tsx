"use client";

import { PinIcon } from "lucide-react";

import { postRoscPins } from "@/lib/resus/closeout/post-rosc";
import { refValue } from "@/lib/resus/reference/ref";
import { ADULT_MIN_AGE_YEARS } from "@/lib/resus/survey/vitals-bands";
import { ContextBar } from "./context-bar";
import { useDeskCtx } from "./desk-context";
import { DoNow } from "./do-now";
import { ProtocolsChip } from "./protocols-chip";
import { StepPanel } from "./step-panel";

/**
 * Resus Desk v2 — survey mode (prompt §5.1, GATE A §2): the patient context
 * bar, then Do now + Protocols on the left and the active step in the centre
 * (the step rail above and the record rail beside are the shell's). After ROSC
 * each step carries its post-ROSC targets at the top (adults only — the
 * targets are adult numbers). Read-only when the episode is closed.
 */
export function SurveyMode({ postRosc = false }: { postRosc?: boolean }) {
  const { ui, ageYears } = useDeskCtx();
  const step = ui.activeStep;
  const child = ageYears != null && ageYears < ADULT_MIN_AGE_YEARS;
  const pins = postRosc && !child ? postRoscPins(step) : [];

  return (
    <div className="flex flex-col gap-4">
      <ContextBar />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <aside aria-label="Do now and protocols" className="flex flex-col gap-4">
          <DoNow />
          <ProtocolsChip />
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
          {pins.length > 0 ? (
            <section
              aria-label={`Post-ROSC targets for ${step}`}
              className="border-border bg-muted/40 flex flex-col gap-1 rounded-lg border p-3"
            >
              <p className="text-overline text-muted-foreground inline-flex items-center gap-1.5 uppercase">
                <PinIcon className="size-3.5" aria-hidden />
                Post-ROSC · {step}
              </p>
              {pins.map((p) => (
                <p key={p.id} className="text-body-s text-foreground">
                  {refValue(p)}
                </p>
              ))}
            </section>
          ) : null}
          <StepPanel step={step} />
        </div>
      </div>
    </div>
  );
}
