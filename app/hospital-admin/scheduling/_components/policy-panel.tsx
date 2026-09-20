"use client";

import type { DepartmentPolicyOption } from "./policy-form";
import { useState } from "react";
import { PencilLineIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/data-table";
import { EditorDialog } from "./editor-dialog";
import { Panel } from "./panel";
import { PolicyForm, timeFromMinutes, WEEKDAYS } from "./policy-form";

/**
 * Booking policy as a panel: one row per department, its policy in a
 * sentence, and one Edit that opens the full editor in a sheet. The editor
 * is long by nature (days, hours, slot mechanics, reminders); it no longer
 * sits on the page.
 */
export function PolicyPanel({
  departments,
}: {
  departments: ReadonlyArray<DepartmentPolicyOption>;
}) {
  const [open, setOpen] = useState(false);
  const unset = departments.filter((d) => !d.policy).length;

  return (
    <Panel
      title="Booking policy"
      count={unset > 0 ? unset : undefined}
      action={
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          disabled={departments.length === 0}
        >
          <PencilLineIcon className="size-3.5" />
          Edit
        </Button>
      }
    >
      {departments.length === 0 ? (
        <p className="text-muted-foreground text-body-s px-5 py-4">No departments yet.</p>
      ) : (
        <ul className="grid min-h-0 flex-1 gap-x-6 overflow-auto sm:grid-cols-2 xl:grid-cols-1">
          {departments.map((d) => (
            <li
              key={d.departmentId}
              className="border-border flex min-h-11 items-center justify-between gap-3 border-b px-5 py-2 last:border-b-0"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-foreground text-body-s truncate font-medium">
                  {d.departmentName}
                </span>
                <span className="text-muted-foreground text-caption truncate">
                  {d.policy ? summarise(d.policy) : "Any day, any hour"}
                </span>
              </span>
              {d.policy ? null : <Pill tone="neutral">Unrestricted</Pill>}
            </li>
          ))}
        </ul>
      )}

      <EditorDialog open={open} onOpenChange={setOpen}>
        <PolicyForm departments={departments} onClose={() => setOpen(false)} />
      </EditorDialog>
    </Panel>
  );
}

/** "Mon–Fri · 08:00–17:00 · 15 min" — the three facts a desk asks about. */
function summarise(p: NonNullable<DepartmentPolicyOption["policy"]>): string {
  const days = WEEKDAYS.filter((w) => p.bookableWeekdays.includes(w.value)).map((w) => w.label);
  const dayText =
    days.length === 0
      ? "No days"
      : days.length === 7
        ? "Every day"
        : isRun(p.bookableWeekdays)
          ? `${days[0]}–${days[days.length - 1]}`
          : days.join(" ");
  return `${dayText} · ${timeFromMinutes(p.bookableStartMinutesLocal)}–${timeFromMinutes(p.bookableEndMinutesLocal)} · ${p.defaultSlotMinutes} min`;
}

/** Consecutive weekdays read as a range; anything else is listed. */
function isRun(days: number[]): boolean {
  const s = [...days].sort((a, b) => a - b);
  return s.length > 1 && s[s.length - 1]! - s[0]! === s.length - 1;
}
