import Link from "next/link";
import { CalendarDaysIcon } from "lucide-react";

export interface ComingDay {
  /** `YYYY-MM-DD`, the hospital's day. */
  dateKey: string;
  booked: number;
  /** Requests still waiting for the clinician's yes (doctor only). */
  toApprove?: number;
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * "Coming days" on the staff home dashboards (ADR 0410): the next seven days
 * with how many bookings each holds, each day a link to where they are listed
 * (reception's Expected for that date, the doctor's Schedule). The home
 * counts are today's only, so a booking made for tomorrow showed nowhere a
 * person lands; this is where it shows. Counts and dates only, no names.
 */
export function ComingDays({
  days,
  hrefOf,
  title = "Coming days",
}: {
  days: ReadonlyArray<ComingDay>;
  hrefOf: (dateKey: string) => string;
  title?: string;
}) {
  const total = days.reduce((n, d) => n + d.booked, 0);
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-heading-m text-foreground inline-flex items-center gap-2">
        <CalendarDaysIcon className="text-muted-foreground size-4" aria-hidden />
        {title}
        <span className="text-muted-foreground text-body-s font-normal tabular-nums">
          {total === 0 ? "· nothing booked yet" : `· ${total} booked`}
        </span>
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => (
          <Link
            key={d.dateKey}
            href={hrefOf(d.dateKey)}
            className="border-border bg-card hover:bg-ink-25 ease-expo-out flex flex-col gap-1 rounded-lg border p-3 transition-colors duration-150"
          >
            <span className="text-muted-foreground text-overline font-mono uppercase">
              {DAY.format(new Date(`${d.dateKey}T12:00:00Z`))}
            </span>
            <span
              className={`font-display text-heading-l leading-none tabular-nums ${d.booked ? "text-foreground" : "text-muted-foreground"}`}
            >
              {d.booked}
            </span>
            <span className="text-muted-foreground text-caption">
              {d.booked === 1 ? "booking" : "bookings"}
              {d.toApprove ? ` · ${d.toApprove} to approve` : ""}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
