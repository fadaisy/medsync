"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LabButton } from "@/components/tide/work/button";
import { fillCatalogueFromResearchAction } from "@/lib/lab/measures-actions";

/**
 * Fill every component that has no unit yet from the MedSync catalogue research: the standard UCUM unit, its
 * decimals, and the LOINC code where it was checked against loinc.org. Nothing already set is changed.
 */
export function FillFromResearch() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ test: string; concept: string; reason: string }[]>([]);
  return (
    <section className="border-border bg-card flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-heading-s">Fill from the catalogue research</h2>
      <p className="text-body-s text-muted-foreground max-w-3xl">
        Sets the standard unit (UCUM), the decimals and the LOINC code for every component that has
        none yet, from MedSync&apos;s catalogue research. LOINC codes are added only where they were
        checked against loinc.org and are active. Components you have already set are not changed.
        Check the result before using it, as you would your own entries.
      </p>
      <LabButton
        type="button"
        variant="primary"
        className="w-fit"
        busy={pending}
        onClick={() =>
          start(async () => {
            const r = await fillCatalogueFromResearchAction();
            if (!r.ok) {
              setSaid(r.error);
              return;
            }
            const d = r.data!;
            setSkipped(d.skipped);
            setSaid(
              d.filled === 0
                ? `Nothing to fill: ${d.kept} components already set.`
                : `Filled ${d.filled} components (${d.withoutLoinc} without a LOINC code). ${d.kept} already set and kept.${d.skipped.length ? ` ${d.skipped.length} skipped.` : ""}`,
            );
            router.refresh();
          })
        }
      >
        {pending ? "Filling…" : "Fill missing units and codes"}
      </LabButton>
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {said}
      </p>
      {skipped.length ? (
        <ul className="text-body-s text-muted-foreground list-disc pl-5">
          {skipped.map((s) => (
            <li key={`${s.test}:${s.concept}`}>
              {s.test}, <span className="font-mono">{s.concept}</span>: {s.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
