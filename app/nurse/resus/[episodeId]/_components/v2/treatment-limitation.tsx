"use client";

import { useMemo, useState } from "react";
import { FileTextIcon } from "lucide-react";

import { recordTreatmentLimitationV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import { Button } from "@/components/ui/button";
import { FIELD, hhmm, isDecision, latest } from "./after-arrest-shared";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

/**
 * TreatmentLimitation — a treatment-limitation decision inside a resus (D11):
 * doctor / clinical officer only (me.stopRecommended), with the rationale and the
 * family's involvement recorded. Collapsed to one secondary button until opened;
 * the latest recorded decision is always shown to everyone.
 */

export function TreatmentLimitation({ onRecorded }: { onRecorded?: () => void }) {
  const { store, ui, initial } = useDeskCtx();
  const existing = useMemo(
    () => latest(store.activeEvents, (e) => isDecision(e, "treatment_limitation")),
    [store.activeEvents],
  );
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [familyInvolvement, setFamily] = useState("");

  const recorded = existing ? (
    <p className="text-body-s text-foreground inline-flex items-start gap-1.5">
      <FileTextIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Treatment limitation recorded {hhmm(existing.recordedAt)}:{" "}
        {String(existing.payload.summary ?? "")}
      </span>
    </p>
  ) : null;

  if (!initial.me.stopRecommended || store.readOnly) return recorded;

  const ok =
    summary.trim().length >= 3 &&
    rationale.trim().length >= 3 &&
    familyInvolvement.trim().length >= 2;

  const save = () => {
    const input = {
      summary: summary.trim(),
      rationale: rationale.trim(),
      familyInvolvement: familyInvolvement.trim(),
    };
    const label = `Treatment limitation: ${input.summary}`;
    const episodeId = store.episode.id;
    store.submit({
      label: "Treatment-limitation decision",
      optimistic: () => [
        {
          kind: "decision",
          step: "pre",
          payload: { decision: "treatment_limitation", ...input, label },
        },
      ],
      run: async ({ clientEventId, recordedAt }) =>
        toOutcome(
          await recordTreatmentLimitationV2({ ...input, episodeId, clientEventId, recordedAt }),
        ),
    });
    ui.toast({ message: "Recorded" });
    setOpen(false);
    setSummary("");
    setRationale("");
    setFamily("");
    onRecorded?.();
  };

  if (!open)
    return (
      <div className="space-y-2">
        {recorded}
        <Button variant="secondary" size="lg" className="self-start" onClick={() => setOpen(true)}>
          <FileTextIcon className="size-4" aria-hidden />
          Record a treatment-limitation decision…
        </Button>
      </div>
    );

  return (
    <fieldset className="border-border space-y-2 rounded-lg border p-3">
      <legend className="text-body-s text-foreground px-1 font-medium">
        Treatment-limitation decision (doctor / clinical officer)
      </legend>
      {recorded}
      <input
        aria-label="Decision"
        placeholder="Decision (summary)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        maxLength={300}
        className={FIELD}
      />
      <textarea
        aria-label="Rationale"
        placeholder="Rationale"
        rows={2}
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        maxLength={1000}
        className={FIELD}
      />
      <textarea
        aria-label="Family involvement"
        placeholder="Family involvement"
        rows={2}
        value={familyInvolvement}
        onChange={(e) => setFamily(e.target.value)}
        maxLength={500}
        className={FIELD}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="lg" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="lg" disabled={!ok} onClick={save}>
          Record decision
        </Button>
      </div>
    </fieldset>
  );
}
