"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { reportBoughtOutside, reportCouldNotGet } from "../actions";

/** ML-4: the patient's two taps on a medicine they were sent to buy outside. */
export function PharmacyReport({
  lineId,
  labels,
}: {
  lineId: string;
  /** The signed patient words, passed in so the copy module stays on the server. */
  labels: { boughtIt: string; couldNotGet: string };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (act: typeof reportBoughtOutside) =>
    start(async () => {
      const r = await act({ clientKey: crypto.randomUUID(), lineId });
      setError(r.ok ? null : (r.error ?? null));
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => run(reportBoughtOutside)}>
          {labels.boughtIt}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => run(reportCouldNotGet)}
        >
          {labels.couldNotGet}
        </Button>
      </div>
      <p role="status" className="text-body-s text-muted-foreground empty:hidden">
        {error}
      </p>
    </div>
  );
}
