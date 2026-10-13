"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { releaseResults } from "@/lib/emr/actions/results";
import { inputClass, newKey, Pop } from "../../../_components/pop";
import { QUALITY } from "../../../quality/_lib/copy";
import { Field, Said, useAct } from "../../../setup/criticals/_components/setup-forms";

const H = QUALITY.hold;

/**
 * §5.3 (QH-4, E-LAB3-08): release past the QC hold with a reason, for holders of lab.qc.override only (the
 * server checks it again in the one release path); or, once the hold is lifted, release what was held by a
 * completion version (no correction alert).
 */
export function QcHoldActions({
  patientUserId,
  reportId,
  held,
  canOverride,
  completion,
}: {
  patientUserId: string;
  reportId: string;
  /** The analytes held now ("potassium"). */
  held: string[];
  canOverride: boolean;
  /** Held in the released report but no longer blocked: "Release {analytes} now". */
  completion: string[];
}) {
  const { pending, message, act } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const release = (qcOverride?: { reason: string }) =>
    act(async () => {
      const r = await releaseResults({
        surface: "lab",
        patientUserId,
        reportId,
        clientKey: newKey(),
        ...(qcOverride ? { qcOverride } : {}),
      });
      if (r.ok) setOpen(false);
      return r;
    }, H.released);
  return (
    <div className="flex flex-col gap-3">
      {completion.length ? (
        <section className="border-border bg-card shadow-card text-body-s flex flex-col gap-2 rounded-lg border p-4">
          <p>{H.releaseHeldLede}</p>
          <Button
            type="button"
            className="min-h-11 w-fit sm:min-h-9"
            disabled={pending}
            onClick={() => release()}
          >
            {H.releaseHeld(completion.join(", "))}
          </Button>
        </section>
      ) : null}
      {held.length && canOverride ? (
        <section
          aria-labelledby="qc-override"
          className="border-border bg-card shadow-card text-body-s flex flex-col gap-2 rounded-lg border p-4"
        >
          <h2 id="qc-override" className="text-heading-s font-medium">
            {H.overrideTitle}
          </h2>
          <p className="text-muted-foreground">{H.overrideLede}</p>
          <Pop
            label={H.override(held.join(", "))}
            title={H.override(held.join(", "))}
            lede={H.overrideLede}
            open={open}
            setOpen={setOpen}
            action={
              <Button
                type="button"
                onClick={() => release({ reason })}
                disabled={pending || reason.trim().length < 3}
              >
                {H.override(held.join(", "))}
              </Button>
            }
          >
            <Field label={H.reason}>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                className={inputClass}
              />
            </Field>
          </Pop>
        </section>
      ) : null}
      <Said message={message} />
    </div>
  );
}
