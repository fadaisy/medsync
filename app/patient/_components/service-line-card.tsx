import type { ServiceLineCard as Line } from "@/lib/patient/discover";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";

import { formatShortDate } from "@/lib/patient/booking-format";
import { cn } from "@/lib/utils";

/**
 * A clinic, as a category tile — the reference design's "General Visits" grid,
 * in MedSync's palette. One tile is filled (the brand's deepest indigo) the way
 * the reference fills one: it is the clinic with something open soonest, so the
 * emphasis carries a fact rather than a decoration.
 *
 * What the reference puts on these tiles is a price ("~$89 Per session"). That
 * is deliberately absent here. PRD §0 is explicit that MedSync "does NOT sell
 * appointment times" (ruling C2), and no fee is charged in the app at all. When
 * the cadre-fee work lands, this tile is where the fee belongs — stated as what
 * the hospital will ask for at the desk, in UGX, and only once we can say it
 * honestly for a clinic day whose clinician is not named until T-12h.
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
