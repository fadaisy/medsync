"use client";

import type { ActionState } from "../actions";
import type { AvailabilityRow } from "../page";
import type { AvailabilityKind } from "@/db/schema/scheduling";
import type { ChangeEvent } from "react";
import { useActionState, useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cancelAvailabilityBlockAction, setAvailabilityBlockAction } from "../actions";

const KIND_OPTIONS: ReadonlyArray<{ value: AvailabilityKind; label: string; hint: string }> = [
  { value: "bookable", label: "Bookable", hint: "Patients can book this." },
  { value: "teaching", label: "Teaching", hint: "Non-bookable." },
  { value: "ward_round", label: "Ward round", hint: "Non-bookable." },
  { value: "admin", label: "Admin", hint: "Non-bookable." },
  { value: "leave", label: "Leave", hint: "Non-bookable." },
  { value: "unavailable", label: "Unavailable", hint: "Non-bookable." },
];

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

interface FormSheetProps {
  open: boolean;
  block: AvailabilityRow | null;
  onOpenChange: (open: boolean) => void;
}

export function AvailabilityFormSheet({ open, block, onOpenChange }: FormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent widthClassName="w-full sm:max-w-[520px]">
        {open ? (
          <FormContent key={block?.id ?? "new"} block={block} onClose={() => onOpenChange(false)} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function FormContent({ block, onClose }: { block: AvailabilityRow | null; onClose: () => void }) {
  const isEdit = !!block;
  const [kind, setKind] = useState<AvailabilityKind>(block?.kind ?? "bookable");
  const [recurrence, setRecurrence] = useState<"none" | "weekly">(
    (block?.recurrence as "none" | "weekly" | undefined) ?? "none",
  );
  const [weekday, setWeekday] = useState<number>(
    block?.recurrenceWeekday ?? (new Date().getDay() || 7),
  );

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setAvailabilityBlockAction,
    {},
  );
  const [cancelState, cancelAction, cancelPending] = useActionState<ActionState, FormData>(
    cancelAvailabilityBlockAction,
    {},
  );
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    if (state.ok || cancelState.ok) onClose();
  }, [state.ok, cancelState.ok, onClose]);

  // datetime-local needs YYYY-MM-DDTHH:mm in LOCAL time (no offset).
  const defaultStarts = block
    ? toDatetimeLocal(new Date(block.startsAtIso))
    : toDatetimeLocal(roundToNextHour(new Date()));
  const defaultEnds = block
    ? toDatetimeLocal(new Date(block.endsAtIso))
    : toDatetimeLocal(addHours(roundToNextHour(new Date()), 1));

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? "Edit block" : "Add availability"}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? "Update the block, then save. Cancelling a bookable block with live appointments is refused — reschedule those first."
            : "Declare a time window. Bookable blocks become slots patients can book; the rest carve gaps out of your bookable hours."}
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <form action={formAction} className="flex flex-col gap-5" id="availability-form">
          {isEdit ? <input type="hidden" name="block_id" value={block.id} /> : null}

          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((k) => (
                <label
                  key={k.value}
                  className={
                    "border-border hover:bg-muted/30 tap flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors " +
                    (kind === k.value
                      ? "select-flare border-teal-500/60 bg-teal-50/50 ring-1 ring-teal-500/15 dark:bg-teal-950/20"
                      : "")
                  }
                >
                  <input
                    type="radio"
                    name="kind"
                    value={k.value}
                    checked={kind === k.value}
                    onChange={() => setKind(k.value)}
                    className="mt-0.5 size-4 accent-teal-600"
                  />
                  <div className="flex flex-col">
                    <span className="text-foreground text-[12.5px] font-medium">{k.label}</span>
                    <span className="text-muted-foreground text-[10.5px] leading-tight">
                      {k.hint}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="starts_at_local">Starts</Label>
              <input
                id="starts_at_local"
                name="starts_at_local"
                type="datetime-local"
                required
                defaultValue={defaultStarts}
                className="border-border text-foreground rounded-md border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                onChange={syncIsoHidden("starts_at")}
              />
              <input type="hidden" name="starts_at" defaultValue={toIso(defaultStarts)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ends_at_local">Ends</Label>
              <input
                id="ends_at_local"
                name="ends_at_local"
                type="datetime-local"
                required
                defaultValue={defaultEnds}
                className="border-border text-foreground rounded-md border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                onChange={syncIsoHidden("ends_at")}
              />
              <input type="hidden" name="ends_at" defaultValue={toIso(defaultEnds)} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Recurrence</Label>
            <div className="flex items-center gap-2">
              <select
                name="recurrence"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as "none" | "weekly")}
                className="border-border text-foreground rounded-md border bg-transparent px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
              >
                <option value="none">One-off</option>
                <option value="weekly">Repeat weekly</option>
              </select>
              {recurrence === "weekly" ? (
                <select
                  name="recurrence_weekday"
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  className="border-border text-foreground rounded-md border bg-transparent px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      every {d.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="location">Location (optional)</Label>
            <Input
              id="location"
              name="location"
              placeholder="e.g. IM Clinic Room 3"
              defaultValue={block?.location ?? ""}
              maxLength={160}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={block?.notes ?? ""}
              maxLength={1000}
              className="border-border text-foreground placeholder:text-muted-foreground min-h-[60px] resize-y rounded-md border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
              placeholder="Visible only to you + your admins."
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="reason">
              Reason <span className="text-muted-foreground font-normal">(≥ 8 chars, audited)</span>
            </Label>
            <Input
              id="reason"
              name="reason"
              required
              minLength={8}
              placeholder={
                isEdit
                  ? "e.g. Moving start time to align with new clinic."
                  : "e.g. Adding Friday IM clinic."
              }
              aria-invalid={!!state.error}
            />
            {state.error ? (
              <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">
                {state.error}
              </p>
            ) : null}
          </div>
        </form>

        {isEdit && confirmingCancel ? (
          <form
            action={cancelAction}
            className="reveal-up mt-5 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-800/40 dark:bg-amber-950/20"
          >
            <input type="hidden" name="block_id" value={block.id} />
            <p className="text-[12.5px] font-medium text-amber-900 dark:text-amber-200">
              Cancel this block?
            </p>
            <p className="text-[11.5px] leading-relaxed text-amber-900/80 dark:text-amber-100/80">
              Bookable blocks with live appointments can&apos;t be cancelled — reschedule those
              first. Non-bookable blocks (teaching, ward rounds, leave) cancel unconditionally.
            </p>
            <Input
              name="reason"
              required
              minLength={8}
              autoFocus
              placeholder="Reason for cancelling (≥ 8 chars)"
              aria-invalid={!!cancelState.error}
            />
            {cancelState.error ? (
              <p role="alert" className="text-[11.5px] text-red-700 dark:text-red-300">
                {cancelState.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelPending}
              >
                Keep block
              </Button>
              <Button type="submit" variant="secondary" size="sm" disabled={cancelPending}>
                {cancelPending ? "Cancelling…" : "Confirm cancel"}
              </Button>
            </div>
          </form>
        ) : null}
      </SheetBody>

      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
        {isEdit ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirmingCancel(true)}
            disabled={confirmingCancel}
          >
            <Trash2Icon className="size-3.5" />
            Cancel block…
          </Button>
        ) : null}
        <Button type="submit" form="availability-form" variant="primary" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add block"}
        </Button>
      </SheetFooter>
    </>
  );
}

/* ─── helpers ─────────────────────────────────────────────────────── */

function toDatetimeLocal(d: Date): string {
  // YYYY-MM-DDTHH:mm in the browser's local timezone.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local: string): string {
  // Treat local string as the user's local time → UTC ISO.
  return new Date(local).toISOString();
}

function roundToNextHour(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(0, 0, 0);
  out.setHours(out.getHours() + 1);
  return out;
}

function addHours(d: Date, h: number): Date {
  const out = new Date(d);
  out.setHours(out.getHours() + h);
  return out;
}

/** Mirror the visible datetime-local input into a hidden ISO input. */
function syncIsoHidden(name: "starts_at" | "ends_at") {
  return (e: ChangeEvent<HTMLInputElement>) => {
    const form = e.currentTarget.form;
    if (!form) return;
    const hidden = form.querySelector(
      `input[type="hidden"][name="${name}"]`,
    ) as HTMLInputElement | null;
    if (hidden && e.currentTarget.value) {
      hidden.value = toIso(e.currentTarget.value);
    }
  };
}
