import type { CutoffConcept } from "@/lib/lab/cutoffs-read";

import { StatusWord } from "@/components/emr/status-word";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { FlagBasis } from "./flag-basis";
import { SchemeEditor } from "./scheme-editor";
import { SchemeTable } from "./scheme-table";

const date = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: LAB_TIME_ZONE,
});

/**
 * Decision cut-offs (Lab Phase 2 §5.12, artboard 12), below the reference intervals: per result, what flags
 * it, the scheme in force and its drafts, and the editor. Shown only with labCatalogueV2 on.
 */
export function SchemeSection({
  concepts,
  elevation,
  userId,
}: {
  concepts: CutoffConcept[];
  elevation: { metres: number; inForceFrom: Date } | null;
  userId: string;
}) {
  const elevationWords = elevation
    ? `Signed elevation: ${elevation.metres} m (signed ${date.format(elevation.inForceFrom)}).`
    : "No elevation is signed yet: cut-offs are not adjusted for altitude.";
  return (
    <section aria-labelledby="cutoffs-heading" className="flex flex-col gap-4">
      <h2 id="cutoffs-heading" className="text-heading-m">
        Decision cut-offs
      </h2>
      <p className="text-body-s text-muted-foreground max-w-[75ch]">
        A scheme sorts a result into categories (for example a diagnostic threshold) instead of
        flagging it against the reference interval. A scheme and the choice of what flags a result
        are used only once the laboratory lead and the CSO have signed them; until then the version
        in force stays in force.
      </p>
      {concepts.length === 0 ? (
        <p className="text-body-s">No decision scheme has been drafted at this hospital yet.</p>
      ) : null}
      {concepts.map((c) => {
        const open = c.drafts.find((d) => !d.leadSigned) ?? null;
        const latest = open ?? c.drafts[0] ?? null;
        const editFrom = latest?.payload ?? c.signed!.payload;
        const headingId = `cutoffs-${c.conceptId}`;
        return (
          <section
            key={c.conceptId}
            aria-labelledby={headingId}
            className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={headingId} className="text-heading-s">
                {c.display}
              </h3>
              <SchemeEditor
                conceptId={c.conceptId}
                display={c.display}
                initial={editFrom}
                draftId={open?.id ?? null}
                authoredByMe={open?.authoredBy === userId}
              />
            </div>
            <FlagBasis
              conceptId={c.conceptId}
              display={c.display}
              schemeLabel={(c.signed?.payload ?? editFrom).label}
              basis={c.basis}
              inForceFrom={c.basis.signed ? date.format(c.basis.signed.inForceFrom) : null}
              userId={userId}
            />
            {c.signed ? (
              <div className="flex flex-col gap-2">
                <p className="text-body-s">
                  <StatusWord>
                    In force: version {c.signed.version}, signed {date.format(c.signed.inForceFrom)}
                  </StatusWord>
                </p>
                <SchemeTable scheme={c.signed.payload} elevationWords={elevationWords} />
              </div>
            ) : (
              <p className="text-body-s">
                <StatusWord tone="caution">No scheme signed</StatusWord>
              </p>
            )}
            {c.drafts.map((d) => (
              <details key={d.id} open={!c.signed} className="flex flex-col gap-2">
                <summary className="text-body-s cursor-pointer">
                  <StatusWord tone="caution">
                    {d.leadSigned ? "Waiting for the CSO" : "Draft"}
                  </StatusWord>{" "}
                  Version {d.version}
                </summary>
                <div className="pt-2">
                  <SchemeTable scheme={d.payload} elevationWords={elevationWords} />
                </div>
              </details>
            ))}
          </section>
        );
      })}
    </section>
  );
}
