"use client";

import type { RevealResult } from "@/lib/lab/bench-actions";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { LAB } from "@/content/lab";
import { LAB2 } from "@/content/lab-phase-2";
import { revealWorkingDiagnosisAction } from "@/lib/lab/bench-actions";

const B = LAB.bench;
const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

/**
 * The clinical question card (Lab Phase 2 §5.6, CX-1, CX-3..CX-5): the order's question and who asked,
 * then the working diagnosis on demand. Each reveal is an audited access event; the text lives only in
 * this component's state, never cached anywhere else.
 */
export function ClinicalQuestion({
  patientUserId,
  orderId,
  question,
  orderedBy,
}: {
  patientUserId: string;
  orderId: string;
  question: string | null;
  orderedBy: string | null;
}) {
  const [busy, start] = useTransition();
  const [shown, setShown] = useState<RevealResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="clinical-question"
      className="border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="clinical-question" className="text-heading-s text-foreground font-medium">
        {B.question}
      </h2>
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-caption text-muted-foreground">{B.fromOrder}</dt>
          <dd className="text-foreground">{question ?? B.noQuestion}</dd>
        </div>
        {orderedBy ? (
          <div>
            <dt className="text-caption text-muted-foreground">{B.orderedBy}</dt>
            <dd className="text-foreground">{orderedBy}</dd>
          </div>
        ) : null}
      </dl>
      {!shown ? (
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="min-h-11 self-start sm:min-h-0"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await revealWorkingDiagnosisAction({ patientUserId, orderId });
              setError(r.ok ? null : r.error);
              if (r.ok && r.data) setShown(r.data);
            })
          }
        >
          {LAB2.workingDiagnosis.button}
        </Button>
      ) : null}
      <div role="status" className="flex flex-col gap-1">
        {error ? <StatusWord tone="caution">{error}</StatusWord> : null}
        {shown?.kind === "shown" ? (
          <>
            <p className="text-foreground font-medium">{shown.text}</p>
            <p className="text-muted-foreground">
              {[shown.author, when.format(new Date(shown.at))].filter(Boolean).join(" · ")}
            </p>
            <p className="text-caption text-muted-foreground">{shown.recorded}</p>
          </>
        ) : shown?.kind === "masked" ? (
          <p className="text-muted-foreground">{shown.words}</p>
        ) : shown?.kind === "none" ? (
          <p className="text-muted-foreground">{B.noDiagnosis}</p>
        ) : null}
      </div>
    </section>
  );
}
