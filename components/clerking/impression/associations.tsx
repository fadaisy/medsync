import type { Association } from "@/lib/clerking/impression/associations";
import type { BoardRow } from "@/lib/clerking/impression/board";
import type { Finding } from "@/lib/clerking/impression/facts";
import type { ReactNode } from "react";
import { ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";

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
  title,
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
  title?: string;
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
        {`${title ?? `Associated with ${parent}`} (${items.length})`}
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

/**
 * The leading diagnosis's associations (owner, 2026-10-08): the ones the clinician chose, in their
 * own container under the leading diagnosis's supports. Each keeps its own supports, picked from
 * the same bucket as the leading diagnosis's ("Not yet explained by any diagnosis"): "Add findings
 * here" makes it the bucket's target. The candidates to choose from sit below ("Add an association").
 */
export function AssociatedContainer({
  parent,
  chosen,
  active,
  onActivate,
  candidates,
  canWrite,
  finding,
  findingText,
  testName,
  onUnsupport,
  onAdd,
  actions,
}: {
  parent: string;
  chosen: readonly {
    row: BoardRow;
    type: "complication" | "goes_with" | null;
    supports: Finding[];
  }[];
  /** The chosen association the bucket's findings go to (its logical id), or null (the leading). */
  active: string | null;
  onActivate: (row: BoardRow | null) => void;
  candidates: readonly Association[];
  canWrite: boolean;
  /** A finding's words as the step writes them (with its NEWS2 number where it has one). */
  finding: (f: Finding) => ReactNode;
  findingText: (ref: string) => string | null;
  testName: (id: string) => string;
  onUnsupport: (row: BoardRow, f: Finding) => void;
  onAdd: (a: Association) => void;
  /** Status, Details and Remove for a chosen one (the step's own controls). */
  actions: (row: BoardRow) => ReactNode;
}) {
  if (!chosen.length && !candidates.length) return null;
  return (
    <section
      aria-label={`Associated with ${parent}`}
      className="border-border bg-muted/30 flex flex-col gap-3 rounded-md border px-3 py-3"
    >
      <span className="text-caption text-muted-foreground font-medium tracking-[0.06em] uppercase">
        {`Associated with ${parent}${chosen.length ? ` (${chosen.length})` : ""}`}
      </span>
      {chosen.length ? (
        <ul className="flex flex-col gap-2">
          {chosen.map(({ row, type, supports }) => {
            const on = active === row.dx.logicalId;
            return (
              <li
                key={row.dx.logicalId}
                data-active={on || undefined}
                className={cn(
                  "border-border bg-card flex flex-col gap-2 rounded-md border px-3 py-2.5",
                  on && "bg-iris-tint ring-iris-edge ring-1",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body-s text-foreground font-medium">
                    {row.dx.display}
                    <span className="text-caption text-muted-foreground font-normal">
                      {type === "complication" ? " · complication" : type ? " · goes with it" : ""}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1">{actions(row)}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-caption text-muted-foreground">Supports it</span>
                  {supports.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {supports.map((f) => (
                        <li key={f.ref}>
                          <span className="bg-ink-100 dark:bg-ink-700 text-caption inline-flex min-h-7 items-center gap-1 rounded-sm pr-0.5 pl-2">
                            <span className="font-mono">+</span>
                            {finding(f)}
                            {canWrite ? (
                              <button
                                type="button"
                                aria-label={`Remove ${f.text} from the support of ${row.dx.display}`}
                                onClick={() => onUnsupport(row, f)}
                                className="hover:bg-card focus-visible:shadow-focus inline-flex size-6 items-center justify-center rounded-xs outline-none pointer-coarse:size-11"
                              >
                                <XIcon aria-hidden className="size-3" />
                              </button>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-caption text-muted-foreground">Nothing selected yet.</p>
                  )}
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onActivate(on ? null : row)}
                    className="text-caption focus-visible:shadow-focus self-start rounded-xs font-medium text-teal-700 outline-none hover:underline dark:text-teal-300"
                  >
                    {on
                      ? "Adding findings here: done"
                      : "Add findings here, from the list on the right"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">
          None chosen yet. Choose from the list below.
        </p>
      )}
      <AssociationsFold
        parent={parent}
        items={candidates}
        findingText={findingText}
        testName={testName}
        canWrite={canWrite}
        onAdd={onAdd}
        title="Add an association"
      />
    </section>
  );
}
