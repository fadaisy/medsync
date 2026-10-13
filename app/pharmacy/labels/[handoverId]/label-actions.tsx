"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { SUPPLY } from "@/content/pharmacy-supply";
import { Refusal, TARGET } from "../../_components/review-dialogs";
import * as actions from "../../supply-actions";

/**
 * LB-4, SU-13, Law 11: Print logs the print (or the reprint) and then opens the browser's own print with
 * CSS. A failure to log is said in words and the print goes ahead. If printing fails or is cancelled,
 * the supplier may switch this hand-over to labels written by hand, with the tick; that is logged.
 */
export function LabelActions({ handoverId, reprint }: { handoverId: string; reprint: boolean }) {
  const H = SUPPLY.handover;
  const [error, setError] = useState<string | null>(null);
  const [byHand, setByHand] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [pending, start] = useTransition();
  const log = (outcome: "printed" | "switched_to_hand") =>
    (reprint && outcome === "printed" ? actions.reprintLabels : actions.printLabels)({
      clientKey: crypto.randomUUID(),
      handoverId,
      outcome,
      attested: outcome === "switched_to_hand" ? true : undefined,
    });
  return (
    <div className="flex flex-col gap-3">
      <span className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className={TARGET}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await log("printed");
              setError(r.ok ? null : r.error);
              window.print();
            })
          }
        >
          {reprint ? SUPPLY.labels.reprint : SUPPLY.labels.print}
        </Button>
      </span>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-s text-muted-foreground">{H.printFailed}</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={byHand} onChange={(e) => setByHand(e.target.checked)} />
          <span className="text-body-s">{H.byHand}</span>
        </label>
        <span>
          <Button
            type="button"
            variant="secondary"
            className={TARGET}
            disabled={!byHand || switched || pending}
            onClick={() =>
              start(async () => {
                const r = await log("switched_to_hand");
                if (r.ok) setSwitched(true);
                else setError(r.error);
              })
            }
          >
            {H.writeByHand}
          </Button>
        </span>
        {switched ? (
          <p role="status" className="text-body-s">
            {H.switched}
          </p>
        ) : null}
      </fieldset>
      <Refusal error={error} />
    </div>
  );
}
