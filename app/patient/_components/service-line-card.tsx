import type { ServiceLineCard as Line } from "@/lib/patient/discover";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";

import { formatShortDate } from "@/lib/patient/booking-format";
import { cn } from "@/lib/utils";
import { FEE_FOOTNOTE, WAIVER_NOTE } from "@/supabase/functions/_shared/fees";

/**
 * A clinic, as a category tile — the reference design's "General Visits" grid,
 * in MedSync's palette. One tile is filled (the brand's deepest teal) the way
 * the reference fills one: it is the clinic with something open soonest, so the
 * emphasis carries a fact rather than a decoration.
 *
 * The reference puts a price on each tile ("~$89 Per session"). This tile
 * does too, honestly: the amount the hospital will ask for at the desk, in
 * UGX — a single number where the line charges one, a range over its cadre
 * overrides where it does not (ADR 0092). MoH §3.4.2 obliges a displayed
 * price list; UMDPC §5(f) forbids a promotional one, so it is a plain current
 * amount and never a teaser. Nothing is charged in the app (PRD §0, C2).
 *
 * The mode word matters more than a price would: a clinic day gives a position
 * and an arrival window, a slot gives a time, and a patient should know which
 * they are about to get before they tap (ADR 0088).
 */

const MODE_WORD: Record<string, string> = {
  session: "Clinic day — you get a position and a time to arrive by",
  slot: "Appointment time",
  open_queue: "Same-day queue",
};

export function ServiceLineCard({ line, emphasis = false }: { line: Line; emphasis?: boolean }) {
  return (
    <Link
      href={`/patient/book?line=${line.id}`}
      className={cn(
        "group ease-expo-out duration-fast flex flex-col gap-3 rounded-xl p-4 shadow-xs transition-shadow focus-visible:ring-2 focus-visible:outline-none",
        emphasis
          ? "bg-brand-900 text-brand-50 focus-visible:ring-brand-300"
          : "bg-card dark:shadow-card hover:shadow-card focus-visible:ring-ring",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-body-m truncate font-medium",
            emphasis ? "text-brand-50" : "text-foreground",
          )}
        >
          {line.name}
        </span>
        <span
          className={cn(
            "text-body-s truncate",
            emphasis ? "text-brand-200" : "text-muted-foreground",
          )}
        >
          {line.departmentName}
        </span>
      </div>

      <p
        className={cn(
          "text-body-s leading-snug",
          emphasis ? "text-brand-100" : "text-muted-foreground",
        )}
      >
        {MODE_WORD[line.capacityMode] ?? line.capacityMode}
      </p>

      {/* The reference's price slot. A plain current amount (or an honest
          range over the line's cadre fees), paid at the hospital — never a
          lure, never "from" as a teaser (UMDPC 2019 §5(f)). */}
      {line.feeLine ? (
        <p
          className={cn(
            "text-body-m font-mono font-medium tabular-nums",
            emphasis ? "text-brand-50" : "text-foreground",
          )}
        >
          {line.feeLine}
        </p>
      ) : null}
      {line.feeLine ? (
        // Both sentences ride with every fee (ADR 0092): no payment happens
        // here, and MoH §2.2(J) makes the waiver a duty — a price without
        // it deters exactly the patient the waiver exists for.
        <p
          className={cn(
            "text-caption leading-snug",
            emphasis ? "text-brand-200" : "text-muted-foreground",
          )}
        >
          {FEE_FOOTNOTE} {WAIVER_NOTE}
        </p>
      ) : null}

      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <span className={cn("text-body-s", emphasis ? "text-brand-100" : "text-muted-foreground")}>
          {line.soonest ? (
            <>
              Soonest{" "}
              <span className={cn("font-medium", emphasis ? "text-brand-50" : "text-foreground")}>
                {formatShortDate(`${line.soonest.dateKey}T12:00:00Z`)}
              </span>
              {line.soonest.placesLeft !== null ? (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {line.soonest.placesLeft} {line.soonest.placesLeft === 1 ? "place" : "places"}{" "}
                    left
                  </span>
                </>
              ) : null}
            </>
          ) : (
            // PRD §2.4: never imply a day the facility has not opened.
            "Nothing open yet"
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            "ease-expo-out duration-fast grid size-9 shrink-0 place-items-center rounded-full transition-transform group-hover:-translate-y-0.5",
            emphasis ? "bg-brand-50 text-brand-900" : "bg-brand-900 text-brand-50",
          )}
        >
          <ArrowUpRightIcon className="size-4" strokeWidth={2} />
        </span>
      </div>
    </Link>
  );
}
