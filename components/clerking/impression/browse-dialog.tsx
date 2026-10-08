"use client";

import type { DxData } from "../use-catalogue";
import type { DxTerm } from "@/components/emr/desk/search";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { CheckIcon, LockIcon, PlusIcon, SearchIcon } from "lucide-react";

import { cachedLoad } from "@/components/emr/desk/pickers";
import { score } from "@/components/emr/desk/search";
import { EmrDialog } from "@/components/emr/emr-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dxBrowseGroups } from "./model";

/**
 * "Show all" diagnoses on step 09: every term in the index in a centred pop-up (ADR 0161), grouped
 * by the signed diagnosis catalogue's categories. A tap adds the term the way the "Add as" choice
 * shows, and the list stays open so a differential can be built in one go; a term already on this
 * visit is ticked and disabled (S-3). The filter matches names, synonyms and codes as the search
 * does. Each row carries its ICD-11 code, or "Not coded", and a lock when the term is restricted.
 */

const ROW = cn(
  "text-body-s flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none pointer-coarse:min-h-11",
  "hover:bg-muted focus-visible:shadow-focus disabled:cursor-default disabled:hover:bg-transparent",
);

function Code({ term }: { term: DxTerm }) {
  if (!term.icd11) return <span className="text-caption text-muted-foreground">Not coded</span>;
  return (
    <span className="text-caption text-muted-foreground font-mono tabular-nums">
      <span className="sr-only">ICD-11 </span>
      {term.icd11}
      {term.verified ? null : <span className="font-sans"> unverified</span>}
    </span>
  );
}

export function DiagnosisBrowseDialog({
  open,
  onOpenChange,
  load,
  dx,
  addAs,
  already,
  disabled,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The same loader as the search, so the index is fetched once per tab. */
  load: () => Promise<DxTerm[]>;
  /** The catalogue that classifies the terms; without it, one A-to-Z list. */
  dx: DxData | null;
  /** The step's "Add as" choice, shown above the list. */
  addAs: ReactNode;
  already: (t: DxTerm) => boolean;
  /** A diagnosis is being written: rows wait. */
  disabled?: boolean;
  onPick: (t: DxTerm) => void;
}) {
  const [terms, setTerms] = useState<DxTerm[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState("");
  useEffect(() => {
    if (!open || terms) return;
    let live = true;
    cachedLoad(load).then(
      (t) => live && setTerms(t),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [open, terms, load, attempt]);

  const groups = useMemo(() => dxBrowseGroups(terms ?? [], dx), [terms, dx]);
  const f = filter.trim();
  const shown = f
    ? groups
        .map((g) => ({ ...g, terms: g.terms.filter((t) => score(t, f) !== null) }))
        .filter((g) => g.terms.length)
    : groups;
  const total = terms?.length ?? 0;

  return (
    <EmrDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setFilter("");
          setAdding("");
        }
      }}
      width="wide"
      sheet="tall"
      kicker="Impression"
      title="All diagnoses"
      description={
        terms
          ? `${total} diagnoses in ${groups.length} groups. Tap to add; the list stays open.`
          : "Every diagnosis in the catalogue, by group."
      }
      footer={
        <Button type="button" variant="primary" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      {/* A floor under the body, so filtering never shrinks and re-centres the card. */}
      <div className="flex flex-col gap-5 sm:min-h-[min(60svh,36rem)]">
        <div className="flex flex-wrap items-center gap-3">
          <label className="border-input bg-card focus-within:shadow-focus flex min-h-9 min-w-56 flex-1 items-center gap-2 rounded-sm border px-2.5 max-sm:basis-full pointer-coarse:min-h-11">
            <SearchIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
            <span className="sr-only">Filter diagnoses</span>
            <input
              value={filter}
              autoComplete="off"
              placeholder="Filter by name, synonym or code"
              onChange={(e) => setFilter(e.target.value)}
              className="text-body-s text-foreground min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          {addAs}
        </div>
        <p aria-live="polite" className="sr-only">
          {adding}
        </p>
        {failed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-body-s text-muted-foreground">
              The list did not load. Try again, or close this and use the search.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : !terms ? (
          <p className="text-body-s text-muted-foreground">Loading the diagnosis list…</p>
        ) : shown.length === 0 ? (
          <p className="text-body-s text-muted-foreground">
            Nothing matches. Close this and add it as typed from the search.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* A group keeps its heading over all its rows; only its rows flow into two columns. */}
            {shown.map((g) => (
              <section key={g.id} aria-labelledby={`dx-all-${g.id}`}>
                <h3
                  id={`dx-all-${g.id}`}
                  className="text-label text-foreground mb-1 flex items-baseline gap-2 px-2"
                >
                  {g.label}
                  <span className="text-caption text-muted-foreground font-mono tabular-nums">
                    {g.terms.length}
                    <span className="sr-only"> diagnoses</span>
                  </span>
                </h3>
                <ul className="gap-x-8 md:columns-2">
                  {g.terms.map((t) => {
                    const on = already(t);
                    return (
                      <li key={t.id} className="break-inside-avoid">
                        <button
                          type="button"
                          disabled={disabled || on}
                          onClick={() => {
                            setAdding(`Adding ${t.display}`);
                            onPick(t);
                          }}
                          className={cn(ROW, on ? "text-muted-foreground" : "text-foreground")}
                        >
                          {on ? (
                            <CheckIcon aria-hidden className="size-3.5 shrink-0" />
                          ) : (
                            <PlusIcon
                              aria-hidden
                              className="text-muted-foreground size-3.5 shrink-0"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            {t.display}
                            {t.restricted ? (
                              <LockIcon
                                aria-label="Restricted"
                                role="img"
                                className="text-muted-foreground ml-1.5 inline size-3 align-[-1px]"
                              />
                            ) : null}
                          </span>
                          {on ? (
                            <span className="text-caption">Already on this visit</span>
                          ) : (
                            <Code term={t} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </EmrDialog>
  );
}
