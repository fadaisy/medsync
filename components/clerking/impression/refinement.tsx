import type { SubtypeParent } from "@/lib/clerking/impression/relations-catalogue";
import type { Stage } from "@/lib/clerking/impression/stages";
import { useState } from "react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Refinement and Replace (R3, D-REL-05, build ruling REF-01): a broad diagnosis is refined to one of
 * its signed subtypes as a new version of the same condition; a diagnosis that turns out to be
 * something else is replaced (refuted with a reason, the new one added). The desk shows each
 * subtype's criteria beside the deciding tests' status and never picks: the record holds no
 * structured ECG reading, so the clinician judges the criterion. Centred dialog (ADR 0161).
 */

export interface DecidingTest {
  id: string;
  name: string;
  /** In words: "not ordered", "ordered, result pending", "result 10:10". */
  status: string;
}

/** The deciding tests of a parent's subtypes, with where each stands at this visit. */
export function decidingTests(
  parent: SubtypeParent,
  i: {
    testName: (id: string) => string;
    orders: readonly { testId: string | null; open: boolean; statusText: string }[];
  },
): DecidingTest[] {
  const ids = [...new Set(parent.subtypes.flatMap((s) => s.decided_by ?? []))];
  return ids.map((id) => {
    const o = i.orders.find((x) => x.testId === id);
    return {
      id,
      name: i.testName(id),
      status: !o ? "not ordered" : o.open ? `ordered, ${o.statusText.toLowerCase()}` : o.statusText,
    };
  });
}

/** "Type to be decided by: ECG (ordered, result pending) · troponin (not ordered)". */
export function DecidingLine({ tests }: { tests: readonly DecidingTest[] }) {
  if (!tests.length) return null;
  return (
    <p className="text-caption text-muted-foreground">
      {`Type to be decided by: ${tests.map((t) => `${t.name} (${t.status})`).join(" · ")}`}
    </p>
  );
}

/** A diagnosis's severity stage in words, or what would settle it (blank is never negative). */
export function StageLine({ stage }: { stage: Stage | null }) {
  if (!stage) return null;
  return "insufficient" in stage ? (
    <span className="text-caption text-muted-foreground">
      {`${stage.scale}: needs ${stage.insufficient.join(", ")}`}
    </span>
  ) : (
    <span className="text-caption text-foreground" title={stage.source}>
      {`${stage.scale}: ${stage.words}`}
    </span>
  );
}

export function RefineDialog({
  open,
  onOpenChange,
  display,
  parent,
  names,
  deciding,
  onRefine,
  onReplace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The diagnosis being refined or replaced. */
  display: string;
  parent: SubtypeParent | null;
  names: Readonly<Record<string, { display: string }>>;
  deciding: readonly DecidingTest[];
  onRefine: (dxId: string) => void;
  /** Replace with a catalogue alternative (dx id), with the reason it was ruled out. */
  onReplace: (dxId: string, reason: string) => void;
}) {
  const [replacing, setReplacing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const name = (id: string) => names[id]?.display ?? id;
  const alternatives = parent?.alternatives_if_ruled_out ?? [];
  const okReason = reason.trim().split(/\s+/).filter(Boolean).length >= 3;
  return (
    <EmrDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReplacing(null);
          setReason("");
        }
        onOpenChange(o);
      }}
      width="wide"
      title={`Refine or replace ${display}`}
      description="Refine keeps the same diagnosis, made more exact. Replace rules it out and adds another."
    >
      <div className="flex flex-col gap-5">
        {parent?.subtypes.length ? (
          <section aria-labelledby="refine-to" className="flex flex-col gap-2">
            <h3 id="refine-to" className="text-label text-foreground">
              Refine to
            </h3>
            <DecidingLine tests={deciding} />
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {parent.subtypes.map((s) => (
                <li
                  key={s.id}
                  className="border-border flex flex-col gap-1.5 rounded-md border px-3 py-2.5"
                >
                  <span className="text-body-s text-foreground font-medium">
                    {names[s.id]?.display ?? s.display}
                  </span>
                  {s.criteria ? (
                    <p className="text-caption text-muted-foreground leading-relaxed">
                      {s.criteria}
                    </p>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="self-start"
                    onClick={() => onRefine(s.id)}
                  >
                    {`Refine to ${names[s.id]?.display ?? s.display}`}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="replace-with" className="flex flex-col gap-2">
          <h3 id="replace-with" className="text-label text-foreground">
            Replace: it is something else
          </h3>
          {alternatives.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {alternatives.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={replacing === id}
                    onClick={() => setReplacing(replacing === id ? null : id)}
                    className={cn(
                      "text-caption border-border hover:bg-muted focus-visible:shadow-focus inline-flex min-h-8 items-center rounded-sm border px-2.5 outline-none pointer-coarse:min-h-11",
                      replacing === id && "bg-iris-tint ring-iris-edge ring-1",
                    )}
                  >
                    {name(id)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-muted-foreground">
              Add the other diagnosis from the search, then remove this one with its reason.
            </p>
          )}
          {replacing ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="replace-reason" className="text-caption text-muted-foreground">
                {`Why is ${display} ruled out? (at least three words; it stays in the note as ruled out)`}
              </label>
              <input
                id="replace-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                className="border-input bg-card text-body-s focus-visible:shadow-focus min-h-9 rounded-sm border px-2.5 outline-none"
              />
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                disabled={!okReason}
                onClick={() => onReplace(replacing, reason.trim())}
              >
                {`Replace with ${name(replacing)}`}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </EmrDialog>
  );
}
