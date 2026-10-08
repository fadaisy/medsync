import type { Association } from "@/lib/clerking/impression/associations";
import { ChevronDownIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Associated" under a diagnosis on step 09 (owner, 2026-10-08): its complications and the
 * conditions that go with it. Each says what the record already supports, or what would check for
 * it, and comes onto the visit only when the clinician adds it, linked to this diagnosis ("with" in
 * the note). Folded unless something is supported. Native <details>: no state of ours.
 */
export function AssociationsFold({
  parent,
  items,
  findingText,
  testName,
  canWrite,
  onAdd,
}: {
  parent: string;
  items: readonly Association[];
  findingText: (ref: string) => string | null;
  testName: (id: string) => string;
  canWrite: boolean;
  /** Add it to the visit (or, when already there, link it) as associated with the parent. */
  onAdd: (a: Association) => void;
}) {
  if (!items.length) return null;
  const supported = items.filter((a) => a.supportedBy.length).length;
  return (
    <details open={supported > 0} className="group/assoc">
      <summary className="text-caption text-muted-foreground focus-visible:shadow-focus flex w-fit cursor-pointer list-none items-center gap-1 rounded-xs outline-none [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          aria-hidden
          className="ease-expo-out size-3.5 -rotate-90 transition-transform duration-150 group-open/assoc:rotate-0 motion-reduce:transition-none"
        />
        {`Associated with ${parent} (${items.length})`}
        {supported ? <span className="text-teal-text">{` · ${supported} supported`}</span> : null}
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {items.map((a) => {
          const why = a.supportedBy.map(findingText).filter((t): t is string => !!t);
          return (
            <li
              key={a.dxId}
              className="border-border flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-md border px-2.5 py-1.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body-s text-foreground">
                  {a.display}
                  <span className="text-caption text-muted-foreground">
                    {a.type === "complication" ? " · complication" : " · goes with it"}
                    {a.mustNotMiss ? " · must not miss" : ""}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-caption",
                    why.length ? "text-teal-text" : "text-muted-foreground",
                  )}
                >
                  {why.length
                    ? `Supported by: ${why.join(", ")}`
                    : a.checkFor.length
                      ? `Check for: ${a.checkFor.map(testName).join(", ")}`
                      : "Nothing recorded for it yet"}
                </span>
              </div>
              {a.onVisit && a.linked ? (
                <span className="text-caption text-muted-foreground shrink-0">
                  On this visit, linked
                </span>
              ) : canWrite ? (
                <Button size="sm" variant="ghost" onClick={() => onAdd(a)}>
                  <PlusIcon aria-hidden />
                  {a.onVisit ? "Link" : "Add"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
