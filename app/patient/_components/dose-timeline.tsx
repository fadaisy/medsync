import type { DoseSlot } from "@/lib/patient/doses";

import { isRecordableDay, slotStateLabel } from "@/lib/patient/doses";
import { cn } from "@/lib/utils";
// The mark-taken control is route-private to /patient/track because that is
// where its server action lives. The timeline is the second surface that
// needs it, and moving it would drag `actions.ts`'s only client caller out of
// the route that owns the action.
import { MarkTakenButton } from "../track/_components/mark-taken-button";
import { DoseStatus } from "./dose-status";
import { TintedRow } from "./tinted-row";

/**
 * A day on one clock.
 *
 * Every scheduled dose, and anything else that happened at a time, is a row
 * in one ordered list: a mono time in the gutter, a hairline rail with a dot,
 * and the cards for that minute beside it. Doses, readings and visits are
 * told apart by their glyph and their word — never by which column they sit
 * in. Several medicines at 08:00 share one label and one dot, because the
 * patient took them as one act.
 *
 * The `<li>` owns its own three-column grid rather than spanning lanes of a
 * parent grid. That is the whole reason this component is buildable: the
 * multi-lane version needs `display: contents` (which strips list semantics
 * on several screen-reader/browser pairs) or `grid-template-rows: subgrid`,
 * and one lane is the better phone design anyway. The list reads as "list, N
 * items" at every width from 320px to 2560px.
 *
 * Widths are handled by flow, not by a second tree: the cards wrap their
 * status block onto its own line when the column is narrow and pull it back
 * inline when there is room.
 */

export interface DoseTimelineGroup {
  /** 24-hour "08:00" — the group key, and the only time the row prints. */
  timeLabel: string;
  /** The next dose still ahead of the patient. At most one group is true. */
  isNext: boolean;
  slots: DoseSlot[];
}

/** Anything on the same clock that is not a dose. Carries its own word. */
export interface DoseTimelineEvent {
  timeLabel: string;
  kind: "reading" | "visit";
  title: string;
  detail?: string;
  href?: string;
}

export interface DoseTimelineProps {
  groups: ReadonlyArray<DoseTimelineGroup>;
  events?: ReadonlyArray<DoseTimelineEvent>;
  /** The day on show — `slotStateLabel` needs it to tell "Scheduled" from "No entry". */
  day: Date;
  now: Date;
  className?: string;
}

const EVENT_WORD: Record<DoseTimelineEvent["kind"], string> = {
  reading: "Reading",
  visit: "Visit",
};

export function DoseTimeline({ groups, events, day, now, className }: DoseTimelineProps) {
  const rows = mergeRows(groups, events);
  if (rows.length === 0) return null;

  // Today and yesterday — see `isRecordableDay`. The page's own summary
  // line reads the same rule, so the button and the sentence promising you
  // can still record a dose never disagree.
  const recordable = isRecordableDay(day, now);

  return (
    <ol className={cn("stagger-children relative flex flex-col gap-4", className)}>
      {/* One rail for the whole list, sitting in the 1px column the rows
          reserve for it (56px gutter + 20px gap = 76px). */}
      <span aria-hidden className="bg-border absolute inset-y-3 left-19 w-px" />

      {rows.map((row) => (
        <li
          key={row.timeLabel}
          aria-current={row.isNext ? "time" : undefined}
          className={cn(
            "relative grid grid-cols-[3.5rem_1px_minmax(0,1fr)] gap-x-5",
            // Three signals for one state: the band, the brand time label and
            // aria-current. No left-edge bar.
            row.isNext && "bg-accent -mx-2 rounded-lg px-2 py-2",
          )}
        >
          <span
            className={cn(
              "text-caption tabular pt-3 text-right font-mono",
              row.isNext ? "text-primary" : "text-muted-foreground",
            )}
          >
            {row.timeLabel}
          </span>

          {/* The dot is a grid child, not an absolutely-placed offset from
              the row's edge: the `isNext` band shifts that edge by 8px and an
              offset dot would drift out of the rail with it. */}
          <span aria-hidden className="relative col-start-2">
            <span
              className={cn(
                "absolute top-5 left-1/2 size-2 -translate-x-1/2 rounded-full ring-4",
                row.isNext ? "bg-primary ring-accent" : "bg-border ring-muted",
              )}
            />
          </span>

          <ul className="col-start-3 flex flex-col gap-2">
            {row.slots.map((slot) => (
              <DoseCard key={slot.key} slot={slot} day={day} now={now} recordable={recordable} />
            ))}
            {row.events.map((event) => (
              <TintedRow
                key={`${event.kind}@${event.timeLabel}@${event.title}`}
                tint="neutral"
                iconKey={event.kind === "reading" ? "activity" : "calendar"}
                title={event.title}
                subtitle={
                  event.detail
                    ? `${EVENT_WORD[event.kind]} · ${event.detail}`
                    : EVENT_WORD[event.kind]
                }
                href={event.href}
              />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/**
 * One medicine at one time — a `TintedRow` in its wrapped form, which exists
 * for exactly this column: ~190px on a 320px phone, where a name, a state
 * word and a 44px control cannot share one line, so the status block drops
 * under the name instead of squeezing it away.
 */
function DoseCard({
  slot,
  day,
  now,
  recordable,
}: {
  slot: DoseSlot;
  day: Date;
  now: Date;
  recordable: boolean;
}) {
  const taken = slot.state === "taken";

  return (
    <TintedRow
      tint={slot.tint}
      iconKey="pill"
      title={slot.name}
      subtitle={[slot.dose, slot.instructions].filter(Boolean).join(" · ")}
      // Say so plainly. We guessed this time from the pattern, and a guessed
      // time is never allowed to become a "Missed".
      note={slot.presumed ? "Suggested time — set yours in Medicines" : undefined}
      wrap
      trailing={
        <>
          {/* Taken shows the 44px status; anything still open shows the 24px
              status beside the 44px control, so the block keeps its height
              either way. */}
          <DoseStatus
            state={slot.state}
            label={slotStateLabel(slot, day, now)}
            size={taken ? "control" : "indicator"}
          />
          {!taken && recordable ? (
            <MarkTakenButton
              medicationId={slot.medicationId}
              scheduledForIso={slot.at.toISOString()}
              label={`Mark ${slot.name} taken at ${slot.timeLabel}`}
              size="iconLg"
            />
          ) : null}
        </>
      }
    />
  );
}

interface TimelineRow {
  timeLabel: string;
  isNext: boolean;
  slots: DoseSlot[];
  events: DoseTimelineEvent[];
}

/** Doses and events collapse onto a shared clock time; "HH:MM" sorts as text. */
function mergeRows(
  groups: ReadonlyArray<DoseTimelineGroup>,
  events: ReadonlyArray<DoseTimelineEvent> | undefined,
): TimelineRow[] {
  const byTime = new Map<string, TimelineRow>();

  for (const group of groups) {
    byTime.set(group.timeLabel, {
      timeLabel: group.timeLabel,
      isNext: group.isNext,
      slots: [...group.slots],
      events: [],
    });
  }

  for (const event of events ?? []) {
    const row = byTime.get(event.timeLabel);
    if (row) {
      row.events.push(event);
      continue;
    }
    byTime.set(event.timeLabel, {
      timeLabel: event.timeLabel,
      isNext: false,
      slots: [],
      events: [event],
    });
  }

  return [...byTime.values()].sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
}
