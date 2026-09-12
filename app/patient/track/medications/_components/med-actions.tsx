"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { MoreVerticalIcon } from "lucide-react";

import {
  ResponsiveSheet,
  ResponsiveSheetBody,
  ResponsiveSheetContent,
  ResponsiveSheetDescription,
  ResponsiveSheetFooter,
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
} from "@/components/responsive/responsive-sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setMedicationStateAction, setMedicationTimesAction } from "../../actions";
// The times field group lives with the add form because that form owns the
// pattern defaults it starts from; importing it the other way round would be
// a cycle.
import { AddMedicationForm, DoseTimesFields } from "./add-medication-form";

export interface MedActionsProps {
  medicationId: string;
  name: string;
  schedulePattern: string;
  /**
   * Already normalised to "HH:MM" by the page. Postgres hands `time[]` back
   * as "08:00:00", which neither `<input type="time">` nor the action accepts.
   */
  times: string[];
}

/**
 * The per-medication controls: set the dose times, and stop taking it.
 *
 * "Set times" is the reason this component exists. Every medication written
 * before dose times were a field has `schedule_times = NULL`, and a null-timed
 * medication is invisible to the dose timeline — without a backfill path the
 * timeline would only ever show rows added after the add form learned the
 * field. So the affordance is deliberately doubled: an explicit button on any
 * scheduled medicine that has no times yet, and a menu item always.
 *
 * Stopping opens a confirm dialog whose confirm is `variant="secondary"`, not
 * `variant="emergency"`. Stopping a vitamin is not a clinical emergency, and
 * red spent here is red the patient learns to ignore where it matters.
 */
export function MedActions({ medicationId, name, schedulePattern, times }: MedActionsProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<string[]>(times);
  const [timesOpen, setTimesOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An as-needed medicine never gets a dose slot — the derivation ignores its
  // times outright — so offering to set them would be offering a dead setting.
  const schedulable = schedulePattern !== "as_needed";

  const openTimes = () => {
    // Re-seed from the server's value each time, so a cancelled edit leaves
    // nothing behind. One blank input when there are none gives the patient
    // something to type into immediately.
    setDraft(times.length > 0 ? times : [""]);
    setError(null);
    setTimesOpen(true);
  };

  const saveTimes = () => {
    setError(null);
    startTransition(async () => {
      const entered = draft.map((t) => t.trim()).filter(Boolean);
      const res = await setMedicationTimesAction(medicationId, entered);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save those times — try again.");
        return;
      }
      setTimesOpen(false);
    });
  };

  const stopTaking = () => {
    setError(null);
    startTransition(async () => {
      const res = await setMedicationStateAction(medicationId, "ended");
      if (!res.ok) {
        setError(res.error ?? "Couldn't stop that medicine — try again.");
        return;
      }
      setStopOpen(false);
    });
  };

  return (
    // A span, not a div: `TintedRow` renders `trailing` inside a `<span>`.
    <span className="flex items-center gap-1">
      {schedulable && times.length === 0 ? (
        <Button type="button" variant="secondary" className="min-h-11" onClick={openTimes}>
          Set times
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="iconLg"
              aria-label={`Options for ${name}`}
            />
          }
        >
          <MoreVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {schedulable ? (
            <DropdownMenuItem className="text-body-s min-h-11 px-3" onClick={openTimes}>
              {times.length > 0 ? "Change dose times" : "Set dose times"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="text-body-s min-h-11 px-3"
            onClick={() => {
              setError(null);
              setStopOpen(true);
            }}
          >
            Stop taking it
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveSheet open={timesOpen} onOpenChange={setTimesOpen}>
        <ResponsiveSheetContent>
          <ResponsiveSheetHeader>
            <ResponsiveSheetTitle>Dose times for {name}</ResponsiveSheetTitle>
            <ResponsiveSheetDescription>
              These are the times {name} appears on your dose timeline. Leave them all blank if you
              would rather not have set times.
            </ResponsiveSheetDescription>
          </ResponsiveSheetHeader>

          <ResponsiveSheetBody className="flex flex-col gap-4">
            <DoseTimesFields times={draft} onChange={setDraft} idPrefix={`med-${medicationId}`} />
            {error ? (
              <p role="alert" className="text-destructive ncd-reveal text-body-s leading-relaxed">
                {error}
              </p>
            ) : null}
          </ResponsiveSheetBody>

          <ResponsiveSheetFooter>
            <Button type="button" variant="ghost" onClick={() => setTimesOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={saveTimes}>
              {pending ? "Saving…" : "Save times"}
            </Button>
          </ResponsiveSheetFooter>
        </ResponsiveSheetContent>
      </ResponsiveSheet>

      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop taking {name}?</DialogTitle>
            <DialogDescription>
              It moves out of your active list. Your record of the doses you already took stays
              exactly as it is.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p role="alert" className="text-destructive ncd-reveal text-body-s leading-relaxed">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Keep taking it
            </DialogClose>
            <Button type="button" variant="secondary" disabled={pending} onClick={stopTaking}>
              {pending ? "Stopping…" : "Stop taking it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}

/**
 * The add-a-medication sheet, opened by `?add=1`.
 *
 * URL state rather than client state, so both entry points — the "+" in the
 * page header and the empty state's own button — are plain server-rendered
 * `<Link>`s pointing at one sheet. That is what keeps the empty state a real
 * trigger: moving the form into a sheet would otherwise leave a patient with
 * no medications no way to add their first.
 */
export function AddMedicationSheet({ open }: { open: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  const close = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <ResponsiveSheetContent>
        <ResponsiveSheetHeader>
          <ResponsiveSheetTitle>Add a medication</ResponsiveSheetTitle>
          <ResponsiveSheetDescription>
            Give it the times you take it and it shows up on your dose timeline.
          </ResponsiveSheetDescription>
        </ResponsiveSheetHeader>
        <AddMedicationForm onAdded={close} />
      </ResponsiveSheetContent>
    </ResponsiveSheet>
  );
}
