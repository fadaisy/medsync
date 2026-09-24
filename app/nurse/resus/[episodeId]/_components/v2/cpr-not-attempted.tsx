"use client";

import { useState } from "react";
import { HandIcon } from "lucide-react";

import { recordCprNotAttemptedV2 } from "@/app/nurse/resus/_v2/actions-arrest";
import { Button } from "@/components/ui/button";
import { Choice, FIELD, NEUTRAL_DARK } from "./after-arrest-shared";
import { useDeskCtx } from "./desk-context";
import { toOutcome } from "./use-desk";

/**
 * CprNotAttempted — the secondary control (ALS-REC-07): a mandatory reason (a
 * valid recorded treatment-limitation decision, or obvious irreversible death)
 * plus detail, then straight to confirmation of death (the 5:00 observation
 * starts at this record, ALS-DTH-02). Collapsed to one quiet button until opened.
 */

type Reason = "treatment_limitation" | "irreversible_death";

const REASON_LABEL: Record<Reason, string> = {
  treatment_limitation: "Valid treatment-limitation decision",
  irreversible_death: "Obvious irreversible death",
};

export function CprNotAttempted({ onRecorded }: { onRecorded?: () => void }) {
  const { store, ui } = useDeskCtx();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [detail, setDetail] = useState("");

  if (store.readOnly) return null;

  if (!open)
    return (
      <Button variant="ghost" size="lg" className="self-start" onClick={() => setOpen(true)}>
        <HandIcon className="size-4" aria-hidden />
        CPR not attempted…
      </Button>
    );

  const text = detail.trim();
  const save = () => {
    if (!reason) return;
    const label = `CPR not attempted — ${REASON_LABEL[reason].toLowerCase()}: ${text}`;
    const episodeId = store.episode.id;
    store.submit({
      label: "CPR not attempted",
      optimistic: () => [
        {
          kind: "decision",
          step: "arrest",
          payload: { decision: "cpr_not_attempted", reason, detail: text, label },
        },
      ],
      // R8: "Recorded" only once the server has it; a refusal raises the desk's error toast.
      run: async ({ clientEventId, recordedAt }) => {
        const o = toOutcome(
          await recordCprNotAttemptedV2({
            episodeId,
            clientEventId,
            recordedAt,
            reason,
            detail: text,
          }),
        );
        if (o.ok) ui.toast({ message: "Recorded — confirmation of death follows" });
        return o;
      },
    });
    ui.toast({ message: "Saving…" });
    setOpen(false);
    onRecorded?.();
  };

  return (
    <fieldset className="border-border space-y-2 rounded-lg border p-3">
      <legend className="text-body-s text-foreground px-1 font-medium">CPR not attempted</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Reason (required)">
        {(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
          <Choice key={r} selected={reason === r} onClick={() => setReason(r)}>
            {REASON_LABEL[r]}
          </Choice>
        ))}
      </div>
      <textarea
        aria-label="Detail (required)"
        placeholder="Detail (required)"
        rows={2}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        maxLength={500}
        className={FIELD}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="lg" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <button
          type="button"
          disabled={!reason || text.length < 3}
          onClick={save}
          className={NEUTRAL_DARK}
        >
          Record — CPR not attempted
        </button>
      </div>
    </fieldset>
  );
}
