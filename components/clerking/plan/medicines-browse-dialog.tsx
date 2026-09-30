"use client";

import type { Drug } from "@/lib/prescribing/reference/formulary-types";
import { useMemo, useState } from "react";
import { CheckIcon, SearchIcon } from "lucide-react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { Button } from "@/components/ui/button";
import { formularyBrowse, offersRegimens } from "@/lib/prescribing/formulary";
import { ROUTE_WORD } from "@/lib/prescribing/plan-rx";
import { cn } from "@/lib/utils";

/**
 * "Show all" medicines in the prescribing dialog: every medicine in the general formulary
 * MS-RX-CAT-001 in a centred pop-up (ADR 0161), by body system and class, as the catalogue
 * classifies them. Choosing one prescribes it: the pop-up closes and the dialog's How column
 * opens on it. Medicines are A to Z within a class, never ranked; the filter matches the generic
 * name, the class or the system, as the search does. A medicine with a signed regimen says so; every
 * other dose is typed (ADR 0186).
 */

const ROW = cn(
  "text-body-s flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none pointer-coarse:min-h-11",
  "hover:bg-muted focus-visible:shadow-focus",
);

const ALL = formularyBrowse();
const TOTAL = ALL.reduce((n, s) => n + s.count, 0);
const CLASSES = ALL.reduce((n, s) => n + s.classes.length, 0);
const SIGNED = ALL.flatMap((s) => s.classes.flatMap((c) => c.drugs)).filter((d) =>
  offersRegimens(d.dose),
).length;

const routes = (d: Drug) => d.routes.map((r) => ROUTE_WORD[r] ?? r).join(", ");

export function MedicinesBrowseDialog({
  open,
  onOpenChange,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The medicine the dialog is on, ticked. */
  current: string | null;
  onPick: (d: Drug) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => (filter.trim() ? formularyBrowse(filter) : ALL), [filter]);
  const matched = shown.reduce((n, s) => n + s.count, 0);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setFilter("");
  };
  /** Jump to a system: its heading scrolls to the top of the list and takes focus. */
  const jump = (id: string) => {
    const el = document.getElementById(`rx-all-${id}`);
    el?.scrollIntoView({ block: "start" });
    el?.focus({ preventScroll: true });
  };

  return (
    <EmrDialog
      open={open}
      onOpenChange={close}
      width="xl"
      sheet="tall"
      kicker="Prescribe"
      title="All medicines"
      description={`${TOTAL} medicines in ${CLASSES} classes, by body system (general formulary MS-RX-CAT-001). ${SIGNED} have a signed regimen; for the rest you type the dose.`}
      footer={
        <Button type="button" variant="secondary" onClick={() => close(false)}>
          Close
        </Button>
      }
    >
      {/* A floor under the body, so filtering never shrinks and re-centres the card. */}
      <div className="flex flex-col gap-5 sm:min-h-[min(60svh,36rem)]">
        <label className="border-input bg-card focus-within:shadow-focus flex min-h-9 items-center gap-2 rounded-sm border px-2.5 pointer-coarse:min-h-11">
          <SearchIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <span className="sr-only">Filter medicines</span>
          <input
            value={filter}
            autoComplete="off"
            placeholder="Name, class or body system"
            onChange={(e) => setFilter(e.target.value)}
            className="text-body-s text-foreground min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <p aria-live="polite" className="sr-only">
          {filter.trim()
            ? `${matched} ${matched === 1 ? "medicine matches" : "medicines match"}`
            : ""}
        </p>

        {shown.length > 1 ? (
          <nav
            aria-label="Body systems"
            className="flex flex-wrap gap-1.5 max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4 max-sm:pb-1"
          >
            {shown.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                className="border-border text-caption text-ink-700 hover:bg-muted focus-visible:shadow-focus min-h-8 shrink-0 rounded-sm border px-2 whitespace-nowrap outline-none pointer-coarse:min-h-10"
              >
                {s.name}
                <span className="text-muted-foreground ml-1.5 font-mono tabular-nums">
                  {s.count}
                </span>
              </button>
            ))}
          </nav>
        ) : null}

        {shown.length === 0 ? (
          <p className="text-body-s text-muted-foreground">
            Nothing matches. Try the generic name, the class (&ldquo;penicillin&rdquo;) or the body
            system (&ldquo;cardiovascular&rdquo;).
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {shown.map((s) => (
              <section key={s.id} aria-labelledby={`rx-all-${s.id}`}>
                <h3
                  id={`rx-all-${s.id}`}
                  tabIndex={-1}
                  className="text-overline text-muted-foreground mb-2 flex scroll-mt-2 items-baseline gap-2 px-2 uppercase outline-none"
                >
                  {s.name}
                  <span className="font-mono tabular-nums">
                    {s.count}
                    <span className="sr-only"> medicines</span>
                  </span>
                </h3>
                {/* A class keeps its heading over its medicines; only whole classes flow into two columns. */}
                <div className="gap-x-8 md:columns-2">
                  {s.classes.map((c) => (
                    <div key={c.id} className="mb-3 break-inside-avoid">
                      <h4 className="text-label text-foreground flex items-baseline gap-2 px-2 pb-0.5">
                        {c.name}
                        <span className="text-caption text-muted-foreground font-mono tabular-nums">
                          {c.drugs.length}
                        </span>
                      </h4>
                      <ul>
                        {c.drugs.map((d) => {
                          const on = d.id === current;
                          return (
                            <li key={d.id}>
                              <button
                                type="button"
                                aria-pressed={on}
                                onClick={() => {
                                  onPick(d);
                                  close(false);
                                }}
                                className={cn(
                                  ROW,
                                  on ? "bg-teal-50 text-teal-800" : "text-foreground",
                                )}
                              >
                                {on ? (
                                  <CheckIcon aria-hidden className="size-3.5 shrink-0" />
                                ) : null}
                                <span className="min-w-0 flex-1">{d.generic}</span>
                                {offersRegimens(d.dose) ? (
                                  <span className="text-caption text-teal-text shrink-0">
                                    Signed regimen
                                  </span>
                                ) : null}
                                <span className="text-caption text-muted-foreground shrink-0">
                                  {routes(d)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </EmrDialog>
  );
}
