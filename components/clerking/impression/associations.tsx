import type { Association } from "@/lib/clerking/impression/associations";
import type { BoardRow } from "@/lib/clerking/impression/board";
import type { Finding } from "@/lib/clerking/impression/facts";
import type { DueLabel } from "@/lib/clerking/impression/relations-catalogue";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  FlagIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COLLAPSE_AFTER = 3;

/** A link's own links sit indented under it (the 4 levels a cause chain may have). */
const INDENT = ["", "ml-6", "ml-12", "ml-18"];

const CANDIDATE_WORDS: Record<DueLabel | "associated", string> = {
  complication: "complication",
  secondary: "secondary to it",
  precipitated_by: "precipitated by it",
  associated: "goes with it",
};

/**
 * The diagnoses linked under one (owner, 2026-10-08; dx-relations-design §2.1 "Linked"): relation
 * rows from the record, in their own container under the parent, depth first (a link's own links
 * indented). Each keeps its own supports, picked from the same bucket as the leading diagnosis's
 * ("Not yet explained by any diagnosis"): "Add findings here" makes it the bucket's target. Move up
 * and down set its place among its siblings (the note follows it); flag is the diagnosis's own.
 * Under the leading diagnosis the candidates sit below ("Add a linked diagnosis").
 */
/** A diagnosis's accepted findings, each removable (linked and co-existing cards). */
export function Supports({
  row,
  supports,
  canWrite,
  finding,
  onUnsupport,
}: {
  row: BoardRow;
  supports: readonly Finding[];
  canWrite: boolean;
  finding: (f: Finding) => ReactNode;
  onUnsupport: (row: BoardRow, f: Finding) => void;
}) {
  return (
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
  );
}

/** Points "Not yet explained" at this diagnosis: its chips then add findings here. */
export function AddFindingsHere({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="text-caption focus-visible:shadow-focus self-start rounded-xs font-medium text-teal-700 outline-none hover:underline dark:text-teal-300 pointer-coarse:min-h-11"
    >
      {on ? "Adding findings here: done" : "Add findings here, from \u201cNot yet explained\u201d"}
    </button>
  );
}

/** Folds a diagnosis card to its name (owner, 2026-10-09); the card's own buttons stay outside it. */
export function CollapseButton({
  open,
  name,
  onToggle,
}: {
  open: boolean;
  name: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
      onClick={onToggle}
      className="text-muted-foreground hover:bg-muted focus-visible:shadow-focus inline-flex size-6 shrink-0 items-center justify-center rounded-sm outline-none pointer-coarse:size-11"
    >
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "ease-expo-out size-3.5 transition-transform duration-150 motion-reduce:transition-none",
          !open && "-rotate-90",
        )}
      />
    </button>
  );
}

export function AssociatedContainer({
  parent,
  chosen,
  active,
  onActivate,
  candidates,
  canWrite,
  finding,
  onUnsupport,
  onMove,
  onFlag,
  actions,
  grip,
  stage,
  card,
  below,
}: {
  parent: string;
  chosen: readonly {
    row: BoardRow;
    /** Its link, in words: "secondary to Malaria", "with Type 2 diabetes". */
    words: string;
    supports: Finding[];
    flagged: boolean;
    /** 1 under the parent, 2 under one of its links… */
    depth: number;
    /** First or last among its siblings (move up or down is off). */
    first: boolean;
    last: boolean;
  }[];
  /** The chosen association the bucket's findings go to (its logical id), or null (the leading). */
  active: string | null;
  onActivate: (row: BoardRow | null) => void;
  /** Only to know whether to show the box at all (the list is its own section). */
  candidates: readonly Association[];
  canWrite: boolean;
  /** A finding's words as the step writes them (with its NEWS2 number where it has one). */
  finding: (f: Finding) => ReactNode;
  onUnsupport: (row: BoardRow, f: Finding) => void;
  /** Arrange (its place in the note) and flag a chosen one. */
  onMove: (row: BoardRow, by: -1 | 1) => void;
  onFlag: (row: BoardRow) => void;
  /** Status, Details, Remove and Relate to… for a linked one (the step's own controls). */
  actions: (row: BoardRow) => ReactNode;
  /** Its drag grip, its stage (Phase 4), its drop-target attributes and what goes under it. */
  grip?: (row: BoardRow) => ReactNode;
  stage?: (row: BoardRow) => ReactNode;
  card?: (row: BoardRow) => Record<string, string>;
  below?: (row: BoardRow) => ReactNode;
}) {
  // Linked lists collapse after 3 under a parent (design §6): the rest behind "Show 2 more".
  const [all, setAll] = useState(false);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const fold = (id: string) =>
    setFolded((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const more = chosen.filter((c) => c.depth === 1).length - COLLAPSE_AFTER;
  let top = 0;
  const shown = all
    ? chosen
    : chosen.filter((c) => (c.depth === 1 ? ++top : top) <= COLLAPSE_AFTER);
  if (!chosen.length && !candidates.length) return null;
  return (
    <section
      aria-label={`Linked to ${parent}`}
      className="border-border bg-muted/30 flex flex-col gap-3 rounded-md border px-3 py-3"
    >
      <span className="text-caption text-muted-foreground font-medium tracking-[0.06em] uppercase">
        {`Linked to ${parent}${chosen.length ? ` (${chosen.length})` : ""}`}
      </span>
      {chosen.length ? (
        <ul className="flex flex-col gap-2">
          {shown.map(({ row, words, supports, flagged, depth, first, last }) => {
            const on = active === row.dx.logicalId;
            const open = !folded.has(row.dx.logicalId);
            return (
              <li
                key={row.dx.logicalId}
                data-active={on || undefined}
                data-card=""
                {...card?.(row)}
                className={cn(
                  "border-border bg-card flex flex-col gap-2 rounded-md border px-3 py-2.5 data-[dragging=true]:opacity-60 data-[over=true]:ring-2 data-[over=true]:ring-teal-600",
                  on && "bg-iris-tint ring-iris-edge ring-1",
                  INDENT[Math.min(depth, 4) - 1],
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body-s text-foreground inline-flex flex-wrap items-center gap-x-1.5 font-medium">
                    <CollapseButton
                      open={open}
                      name={row.dx.display}
                      onToggle={() => fold(row.dx.logicalId)}
                    />
                    {grip?.(row)}
                    {row.dx.display}
                    {stage?.(row)}
                    <span className="text-caption text-muted-foreground font-normal">{`· ${words}`}</span>
                    {flagged ? (
                      <span className="text-caption bg-status-caution-bg dark:text-status-caution-fg ml-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 font-medium text-amber-800">
                        <FlagIcon aria-hidden className="size-3" />
                        Flagged
                      </span>
                    ) : null}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {canWrite ? (
                      <>
                        <button
                          type="button"
                          aria-label={`Move ${row.dx.display} up`}
                          disabled={first}
                          onClick={() => onMove(row, -1)}
                          className="text-muted-foreground hover:bg-muted focus-visible:shadow-focus inline-flex size-7 items-center justify-center rounded-sm outline-none disabled:opacity-40 pointer-coarse:size-11"
                        >
                          <ArrowUpIcon aria-hidden className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${row.dx.display} down`}
                          disabled={last}
                          onClick={() => onMove(row, 1)}
                          className="text-muted-foreground hover:bg-muted focus-visible:shadow-focus inline-flex size-7 items-center justify-center rounded-sm outline-none disabled:opacity-40 pointer-coarse:size-11"
                        >
                          <ArrowDownIcon aria-hidden className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-pressed={flagged}
                          aria-label={
                            flagged ? `Unflag ${row.dx.display}` : `Flag ${row.dx.display}`
                          }
                          title={flagged ? "Unflag" : "Flag"}
                          onClick={() => onFlag(row)}
                          className={cn(
                            "hover:bg-muted focus-visible:shadow-focus inline-flex size-7 items-center justify-center rounded-sm outline-none pointer-coarse:size-11",
                            flagged
                              ? "dark:text-status-caution-fg text-amber-700"
                              : "text-muted-foreground",
                          )}
                        >
                          <FlagIcon
                            aria-hidden
                            className={cn("size-3.5", flagged && "fill-current")}
                          />
                        </button>
                      </>
                    ) : null}
                    {actions(row)}
                  </div>
                </div>
                {open ? (
                  <>
                    <Supports
                      row={row}
                      supports={supports}
                      canWrite={canWrite}
                      finding={finding}
                      onUnsupport={onUnsupport}
                    />
                    {below?.(row)}
                    {canWrite ? (
                      <AddFindingsHere on={on} onToggle={() => onActivate(on ? null : row)} />
                    ) : null}
                  </>
                ) : null}
              </li>
            );
          })}
          {more > 0 ? (
            <li>
              <button
                type="button"
                aria-expanded={all}
                onClick={() => setAll(!all)}
                className="text-caption focus-visible:shadow-focus rounded-xs font-medium text-teal-700 outline-none hover:underline dark:text-teal-300 pointer-coarse:min-h-11"
              >
                {all ? "Show fewer" : `Show ${more} more`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">
          None linked yet. Choose from &ldquo;Add a linked diagnosis&rdquo; below, or drag a
          co-existing diagnosis onto this one.
        </p>
      )}
    </section>
  );
}

/**
 * "Add a linked diagnosis" (owner, 2026-10-08; dx-relations-design §2.4): its own full-width
 * section under the leading diagnosis, the candidates side by side: its complications, what it can
 * cause (with the catalogue's "suggest when") and what goes with it. Supported first; each says
 * what supports it or what would check for it; Add puts it on the visit and links it, in one write.
 */
export function AssociationCandidates({
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
  onAdd: (a: Association) => void;
}) {
  if (!items.length) return null;
  return (
    // Collapsible (owner, 2026-10-09): the native <details>, as the side panel's Fold.
    <details open className="group/assoc">
      <summary className="focus-visible:shadow-focus flex cursor-pointer list-none flex-wrap items-baseline gap-x-1.5 gap-y-1 rounded-xs outline-none [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground ease-expo-out size-3.5 shrink-0 -rotate-90 self-center transition-transform duration-150 group-open/assoc:rotate-0 motion-reduce:transition-none"
        />
        <h3 id="impression-add-association" className="text-label text-foreground flex-1">
          {`Add a linked diagnosis to ${parent}`}
        </h3>
        <span className="text-caption text-muted-foreground">
          {`${items.filter((a) => a.supportedBy.length).length} of ${items.length} supported by the record`}
        </span>
      </summary>
      <ul className="grid grid-cols-1 gap-2 pt-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((a) => {
          const why = a.supportedBy.map(findingText).filter((t): t is string => !!t);
          return (
            <li
              key={a.dxId}
              className="border-border flex items-start justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body-s text-foreground">
                  {a.display}
                  <span className="text-caption text-muted-foreground">
                    {` · ${CANDIDATE_WORDS[a.label ?? "associated"]}`}
                    {a.mustNotMiss ? " · must not miss" : ""}
                  </span>
                </span>
                {a.suggestWhen ? (
                  <span className="text-caption text-muted-foreground">{`Suggest when: ${a.suggestWhen}`}</span>
                ) : null}
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
              {canWrite ? (
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
