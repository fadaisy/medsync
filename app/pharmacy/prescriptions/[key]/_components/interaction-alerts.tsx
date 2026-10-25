import type { EmrDb } from "@/lib/emr/db";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CLINICAL_B, firedLine } from "@/content/pharmacy-clinical";
import { db } from "@/db";
import { checkInteractions, maskFor } from "@/lib/pharmacy/clinical/interactions";
import { interactionContextFor } from "@/lib/pharmacy/clinical/read";
import { drugById } from "@/lib/prescribing/formulary";

const name = (id: string) =>
  id === "restricted" ? "a medicine in a restricted class" : (drugById(id)?.generic ?? id);

/**
 * 5.3 at review (IX-6, IX-8, S19, S20): every signed pair that fires across what this patient takes now, with the
 * prescriber's stored answer or "Fired after prescribing". Behind `pharmacyInteractions`; never on the ward.
 * ponytail: restricted classes are masked for every viewer here until the review reads the viewer's class access.
 */
export async function InteractionAlerts({
  hospitalId,
  patientUserId,
}: {
  hospitalId: string;
  patientUserId: string;
}) {
  const now = new Date();
  const ix = await interactionContextFor(db as unknown as EmrDb, hospitalId, patientUserId, now);
  if (!ix.levels || !ix.pairs) return null;
  const taking = ix.current.map((c) => c.medicineId);
  const fired = checkInteractions({ ...ix, adding: taking, mode: "review", earlier: [], now }).map(
    (f) => maskFor(f, () => false),
  );
  if (!fired.length) return null;
  return (
    <section aria-label="Interactions" className="flex flex-col gap-2">
      {fired.map((f) => {
        const answered = ix.earlier.find((a) => a.entryId === f.entryId);
        return (
          <div
            key={f.entryId}
            role="region"
            aria-label={`${name(f.adding)} with ${name(f.other)}`}
            className="border-border flex flex-col gap-1 rounded-lg border p-3"
          >
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {f.level === "stop" ? "Stop" : f.level === "check" ? "Check" : "Note"}
            </StatusWord>
            <p className="text-body-s">
              {f.restricted && f.other === "restricted"
                ? CLINICAL_B.restrictedPair
                : firedLine({ ...f, adding: name(f.adding), other: name(f.other) })}
            </p>
            <p className="text-caption text-muted-foreground">
              {answered
                ? CLINICAL_B.suppressed(
                    answered.answeredAt.toISOString().slice(0, 10),
                    answered.cadre,
                    answered.reason,
                  )
                : CLINICAL_B.firedAfter}
            </p>
          </div>
        );
      })}
    </section>
  );
}
