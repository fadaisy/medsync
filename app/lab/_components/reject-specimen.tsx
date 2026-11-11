"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ChoiceChips } from "@/components/emr/orders/choice-chips";
import { StatusWord } from "@/components/emr/status-word";
import { LabButton } from "@/components/tide/work/button";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { rejectSpecimen } from "@/lib/emr/actions/orders";

/**
 * Reject the specimen from the result screen (Lab Phase 0: the worklist row keeps one control, so
 * rejection lives here). Same action and coded reasons as before; it asks for the reason before it
 * writes, and the order goes back to "to collect" with the reason showing on the ward.
 */
export function RejectSpecimen({
  patientUserId,
  specimenId,
  test,
  reasons,
}: {
  patientUserId: string;
  specimenId: string;
  test: string;
  reasons: readonly { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section
      aria-label="Specimen"
      className="border-border flex flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-s text-muted-foreground">
          Specimen unsuitable? Reject it and the ward is asked to collect again.
        </p>
        <LabButton
          type="button"
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="min-h-11 sm:min-h-0"
          busy={pending}
        >
          Reject specimen
        </LabButton>
      </div>
      {open ? (
        <div className="flex flex-col items-start gap-2">
          <ChoiceChips
            name={`reject-${specimenId}`}
            label={`Why is the ${test} specimen rejected?`}
            options={reasons}
            value={reason}
            onChange={setReason}
          />
          <LabButton
            type="button"
            variant="secondary"
            className="min-h-11 sm:min-h-0"
            onClick={() =>
              start(async () => {
                const r = await rejectSpecimen({
                  surface: "lab",
                  patientUserId,
                  specimenId,
                  reasonCode: reason,
                  clientKey: crypto.randomUUID(),
                });
                if (!r.ok) return setMessage({ ok: false, text: r.error });
                setOpen(false);
                setMessage({ ok: true, text: "Specimen rejected; the ward sees the reason." });
                router.refresh();
              })
            }
            busy={pending}
            disabledReason={!reason ? LABWS2.reasons.pickReason : null}
          >
            Reject and ask for a recollection
          </LabButton>
        </div>
      ) : null}
      <span role="status" aria-live="polite" className="text-body-s">
        {message ? (
          message.ok ? (
            message.text
          ) : (
            <StatusWord tone="caution">{message.text}</StatusWord>
          )
        ) : null}
      </span>
    </section>
  );
}
