"use client";

import type { DoctorScheduleActionState } from "../actions";
import { useActionState, useState } from "react";
import { SettingsIcon } from "lucide-react";

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
import { updateSchedulingSettingsAction } from "../actions";

interface SettingsRow {
  autoConfirm: boolean;
  defaultSlotMinutes: number;
  bufferMinutes: number;
  allowVirtual: boolean;
  allowOutOfHoursOverride: boolean;
  usingDefaults: {
    autoConfirm: boolean;
    defaultSlotMinutes: boolean;
    bufferMinutes: boolean;
    allowVirtual: boolean;
  };
}

/**
 * Settings sheet — opens from the calendar top bar. Reads the
 * effective settings (clinician override → dept policy → hard
 * default) and writes the doctor's own clinician_scheduling_settings
 * row via the existing ha-set-clinician-settings Edge Function.
 *
 * "(department default)" hint shows next to fields the doctor hasn't
 * overridden — so the doctor knows they can leave them alone.
 */
export function SchedulingSettingsSheet({ defaults }: { defaults: SettingsRow }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<DoctorScheduleActionState, FormData>(
    updateSchedulingSettingsAction,
    {},
  );

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <SettingsIcon className="size-3.5" aria-hidden />
        Settings
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent widthClassName="w-full sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>Scheduling settings</SheetTitle>
            <SheetDescription>
              Override the department defaults for your own schedule. Each change is audited.
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <form action={formAction} className="flex flex-col gap-5">
              {/* Auto-confirm toggle */}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-foreground text-[12.5px] font-medium">
                  How are requests handled?
                </legend>
                <ToggleRow
                  name="auto_confirm"
                  defaultChecked={defaults.autoConfirm}
                  onLabel="Auto-confirm — patient requests confirm immediately"
                  offLabel="Manual approval — requests land in your pending rail"
                  isDefault={defaults.usingDefaults.autoConfirm}
                />
              </fieldset>

              {/* Slot length + buffer */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="default_slot_minutes" className="text-[11px] tracking-tight">
                    Slot length (min)
                    {defaults.usingDefaults.defaultSlotMinutes ? (
                      <span className="text-muted-foreground/80 ml-1 font-normal">
                        (dept default)
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="default_slot_minutes"
                    name="default_slot_minutes"
                    type="number"
                    min={5}
                    max={240}
                    defaultValue={defaults.defaultSlotMinutes}
                    className="font-mono tabular-nums"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="buffer_minutes" className="text-[11px] tracking-tight">
                    Buffer between (min)
                    {defaults.usingDefaults.bufferMinutes ? (
                      <span className="text-muted-foreground/80 ml-1 font-normal">
                        (dept default)
                      </span>
                    ) : null}
                  </Label>
                  <Input
                    id="buffer_minutes"
                    name="buffer_minutes"
                    type="number"
                    min={0}
                    max={60}
                    defaultValue={defaults.bufferMinutes}
                    className="font-mono tabular-nums"
                    required
                  />
                </div>
              </div>

              {/* Virtual + OOH override */}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-foreground text-[12.5px] font-medium">Options</legend>
                <ToggleRow
                  name="allow_virtual"
                  defaultChecked={defaults.allowVirtual}
                  onLabel="Allow virtual visits"
                  offLabel="In-person only"
                  isDefault={defaults.usingDefaults.allowVirtual}
                />
                <ToggleRow
                  name="allow_out_of_hours_override"
                  defaultChecked={defaults.allowOutOfHoursOverride}
                  onLabel="Allow me to accept out-of-hours bookings (logged + audited)"
                  offLabel="Block all out-of-hours bookings"
                  isDefault={false}
                />
              </fieldset>

              {/* Reason (audited) */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reason" className="text-[11px] tracking-tight">
                  Note for the audit trail (≥ 8 chars)
                </Label>
                <Input
                  id="reason"
                  name="reason"
                  type="text"
                  minLength={8}
                  maxLength={200}
                  defaultValue="Adjusted scheduling settings."
                  required
                />
              </div>

              {state.error ? (
                <p className="text-destructive border-destructive/30 bg-destructive/5 scale-in rounded-md border px-3 py-2 text-[12px] leading-relaxed">
                  {state.error}
                </p>
              ) : null}
              {state.ok ? (
                <p className="scale-in rounded-md border border-teal-500/30 bg-teal-50/50 px-3 py-2 text-[12.5px] text-teal-900 dark:bg-teal-950/30 dark:text-teal-200">
                  Saved.
                </p>
              ) : null}

              <SheetFooter className="px-0">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save settings"}
                </Button>
              </SheetFooter>
            </form>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ToggleRow({
  name,
  defaultChecked,
  onLabel,
  offLabel,
  isDefault,
}: {
  name: string;
  defaultChecked: boolean;
  onLabel: string;
  offLabel: string;
  isDefault: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="border-border bg-card hover:bg-muted/20 tap flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors hover:border-gray-300">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-teal-600"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
      />
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
      <span className="flex flex-1 flex-col">
        <span className="text-foreground text-[13px]">{checked ? onLabel : offLabel}</span>
        {isDefault ? (
          <span className="text-muted-foreground/80 text-[11px]">
            Using the department default.
          </span>
        ) : null}
      </span>
    </label>
  );
}
