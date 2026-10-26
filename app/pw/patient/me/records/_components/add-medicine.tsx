"use client";

import { useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { addMedicineFromVisitAction } from "@/app/patient/care/visits/[summaryId]/actions";
import { Button, ICON } from "@/components/tide/kit";
import { ME_COPY as C } from "@/content/patient/me";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";

/**
 * "Add to my medicines" (ADR 0203 §7): the web's own action, which checks it is a take-home item on this
 * shared copy and writes the row with no dose times. "Already in your medicines." is the outcome wanted.
 */
export function AddMedicine({
  summaryId,
  prescriptionId,
  name,
  inMedicines,
}: {
  summaryId: string;
  prescriptionId: string;
  name: string;
  inMedicines: boolean;
}) {
  const [done, setDone] = useState(inMedicines);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (done)
    return (
      <p className="text-pw-accent-text inline-flex items-center gap-1 text-[15px] font-semibold">
        <CheckIcon className="size-4" {...ICON} />
        {C.inMedicines}
      </p>
    );
  const add = () =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("summary_id", summaryId);
      fd.set("prescription_id", prescriptionId);
      const res = await addMedicineFromVisitAction({}, fd).catch(
        (): { ok?: boolean; error?: string } => ({ error: W.offline }),
      );
      if (res.ok || res.error === "Already in your medicines.") setDone(true);
      else setError(res.error ?? W.offline);
    });
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button tone="soft" size="s" busy={busy} onClick={add} aria-label={C.addLabel(name)}>
        {busy ? C.adding : C.addToMedicines}
      </Button>
      {error ? (
        <p role="status" className="text-pw-ink-2 text-[15px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
