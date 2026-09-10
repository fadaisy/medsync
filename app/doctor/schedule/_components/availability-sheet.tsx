"use client";

import type { AvailabilityRow as ClinicianAvailabilityRow } from "@/app/clinician/availability/page";
import type { PillTone } from "@/components/ui/data-table";
import type { AvailabilityKind } from "@/db/schema/scheduling";
import type { AvailabilityRow as DoctorAvailabilityRow } from "@/lib/scheduling/doctor";
import { useState } from "react";
import { CalendarClockIcon, CalendarPlusIcon, PencilIcon } from "lucide-react";

import { AvailabilityFormSheet } from "@/app/clinician/availability/_components/availability-form-sheet";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Inline availability editor for the doctor's schedule.
 *
 * Wraps a sheet (the "Availability" button on the calendar top bar)
 * that lists upcoming blocks + an "Add block" / "Edit" entry into
 * the existing AvailabilityFormSheet. The form sheet handles its own
 * save / cancel via the existing clinician/availability actions; on
 * success those actions revalidate /doctor/schedule so this list
 * updates without a navigation.
 *
 * The form is presented as a second, nested sheet on top of this
 * one — base-ui handles the focus + escape correctly for stacked
 * dialogs, and the two roles (browse the list vs author one block)
 * are distinct enough to deserve separate surfaces.
 */

const KIND_TONES: Record<string, PillTone> = {
  bookable: "stable",
  teaching: "admitted",
  ward_round: "pending",
  admin: "neutral",
  leave: "caution",
  unavailable: "critical",
};

const KIND_LABEL: Record<string, string> = {
  bookable: "Bookable",
  teaching: "Teaching",
  ward_round: "Ward round",
  admin: "Admin",
  leave: "Leave",
  unavailable: "Unavailable",
};

const WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AvailabilitySheetButton({
  blocks,
}: {
  blocks: ReadonlyArray<DoctorAvailabilityRow>;
}) {
  const [listOpen, setListOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicianAvailabilityRow | null>(null);

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(block: DoctorAvailabilityRow): void {
    // Shape-match the clinician AvailabilityRow (same fields, narrower
    // kind type — cast is safe because the values come from the same
    // CHECK constraint).
    setEditing({
      id: block.id,
      kind: block.kind as AvailabilityKind,
      startsAtIso: block.startsAtIso,
      endsAtIso: block.endsAtIso,
      recurrence: block.recurrence,
      recurrenceWeekday: block.recurrenceWeekday,
      recurrenceUntilIso: block.recurrenceUntilIso,
      location: block.location,
      notes: block.notes,
    });
    setFormOpen(true);
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setListOpen(true)}>
        <CalendarClockIcon className="size-3.5" aria-hidden />
        Availability
      </Button>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent widthClassName="w-full sm:max-w-[520px]">
          <SheetHeader>
            <SheetTitle>Your availability</SheetTitle>
            <SheetDescription>
              Bookable blocks let patients request appointments. Mark teaching, ward rounds, and
              admin as non-bookable so they aren&rsquo;t double-booked. Changes are audited.
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
                Upcoming · {blocks.length}
              </span>
              <Button type="button" size="sm" onClick={openCreate}>
                <CalendarPlusIcon className="size-3.5" aria-hidden />
                Add block
              </Button>
            </div>

            {blocks.length === 0 ? (
              <div className="border-border bg-card flex flex-col items-start gap-3 rounded-xl border p-5">
                <span
                  aria-hidden
                  className="bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-9 items-center justify-center rounded-full ring-1"
                >
                  <CalendarClockIcon className="size-4" />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-foreground text-[14px] font-medium">
                    Nothing on your schedule yet
                  </span>
                  <p className="text-muted-foreground max-w-[48ch] text-[12.5px] leading-relaxed">
                    Add bookable hours so patients can book you. Mark teaching / ward rounds / admin
                    as non-bookable so the system doesn&rsquo;t double-book over them.
                  </p>
                </div>
                <Button type="button" size="sm" onClick={openCreate}>
                  <CalendarPlusIcon className="size-3.5" aria-hidden />
                  Add your first block
                </Button>
              </div>
            ) : (
              <ul className="border-border bg-card divide-border/60 stagger-children flex flex-col divide-y overflow-hidden rounded-xl border">
                {blocks.map((b) => (
                  <li key={b.id}>
                    <BlockRow block={b} onEdit={() => openEdit(b)} />
                  </li>
                ))}
              </ul>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <AvailabilityFormSheet
        open={formOpen}
        block={editing}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}

function BlockRow({ block, onEdit }: { block: DoctorAvailabilityRow; onEdit: () => void }) {
  const starts = new Date(block.startsAtIso);
  const ends = new Date(block.endsAtIso);
  const sameDay = starts.toDateString() === ends.toDateString();

  const dateLabel = starts.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = sameDay
    ? `${formatTime(starts)} – ${formatTime(ends)}`
    : `${formatTime(starts)} → ${ends.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`;

  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "hover:bg-muted/40 active:bg-muted/60 group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 outline-none",
        "focus-visible:ring-brand-500/40 focus-visible:ring-2 focus-visible:ring-inset",
      )}
    >
      <div className="flex w-28 shrink-0 flex-col">
        <span className="text-foreground text-[12.5px] font-medium tabular-nums">{dateLabel}</span>
        <span className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
          {timeLabel}
        </span>
      </div>

      <Pill tone={KIND_TONES[block.kind] ?? "neutral"}>{KIND_LABEL[block.kind] ?? block.kind}</Pill>

      {block.recurrence === "weekly" && block.recurrenceWeekday ? (
        <span className="text-muted-foreground text-caption">
          Every {WEEKDAY_LABEL[block.recurrenceWeekday - 1]}
        </span>
      ) : null}

      {block.location ? (
        <span className="text-muted-foreground hidden truncate text-[11.5px] sm:inline">
          {block.location}
        </span>
      ) : null}

      <span
        aria-hidden
        className="text-muted-foreground text-caption ml-auto inline-flex items-center gap-1 opacity-60 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <PencilIcon className="size-3" />
        Edit
      </span>
    </button>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
