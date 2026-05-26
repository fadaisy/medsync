"use client";

import type { ActionState } from "../actions";
import type { SettingsRow } from "../page";
import { useActionState, useState } from "react";
import { ChevronDownIcon, SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { setClinicianSettingsAction } from "../actions";

/**
 * Scheduling settings — clinician-controlled per (clinician, hospital).
 *
 * Collapsed by default. The headline is the most operationally-loaded
 * setting: auto-confirm. The rest (slot minutes, buffer, virtual,
 * out-of-hours override) live behind a chevron.
 */
export function SettingsPanel({
  settings,
  usingDefaults,
}: {
  settings: SettingsRow;
  usingDefaults: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setClinicianSettingsAction,
    {},
  );

  return (
    <section className="border-border bg-card rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
      >
        <SettingsIcon className="text-muted-foreground size-4" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground text-[13.5px] font-medium">Scheduling settings</span>
          <span className="text-muted-foreground truncate text-[11.5px]">
            {settings.autoConfirm
              ? "Auto-confirm — requests confirm immediately"
              : "Manual approval — you confirm each request"}{" "}
            · {settings.defaultSlotMinutes}-min slots
            {settings.bufferMinutes > 0 ? ` · ${settings.bufferMinutes}-min buffer` : ""}
            {settings.allowVirtual ? " · virtual on" : ""}
            {usingDefaults ? " · (defaults — not saved yet)" : ""}
          </span>
        </div>
        <ChevronDownIcon
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {expanded ? (
        <form
          action={formAction}
          className="border-border/70 flex flex-col gap-4 border-t px-5 py-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ToggleRow
              name="auto_confirm"
              label="Auto-confirm requests"
              hint="Requests confirm without you needing to approve."
              defaultChecked={settings.autoConfirm}
            />
            <ToggleRow
              name="allow_virtual"
              label="Allow virtual appointments"
              hint="Patients can request a video / phone appointment."
              defaultChecked={settings.allowVirtual}
            />
            <ToggleRow
              name="allow_out_of_hours_override"
              label="Allow out-of-hours override"
              hint="You can accept bookings outside your declared hours at your discretion."
              defaultChecked={settings.allowOutOfHoursOverride}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberRow
                name="default_slot_minutes"
                label="Slot length (min)"
                min={5}
                max={240}
                defaultValue={settings.defaultSlotMinutes}
              />
              <NumberRow
                name="buffer_minutes"
                label="Buffer between (min)"
                min={0}
                max={60}
                defaultValue={settings.bufferMinutes}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-reason">
              Reason for the change{" "}
              <span className="text-muted-foreground font-normal">(≥ 8 chars, audited)</span>
            </Label>
            <Input
              id="settings-reason"
              name="reason"
              required
              minLength={8}
              placeholder="e.g. Moving to manual approval after this week's no-show spike."
              aria-invalid={!!state.error}
            />
            {state.error ? (
              <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">
                {state.error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function ToggleRow({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="border-border hover:bg-muted/30 group flex items-start gap-3 rounded-md border p-3 transition-colors">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 accent-teal-600"
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-foreground text-[13px] font-medium">{label}</span>
        <span className="text-muted-foreground text-[11.5px] leading-snug">{hint}</span>
      </div>
    </label>
  );
}

function NumberRow({
  name,
  label,
  min,
  max,
  defaultValue,
}: {
  name: string;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`set-${name}`}>{label}</Label>
      <Input
        id={`set-${name}`}
        name={name}
        type="number"
        required
        min={min}
        max={max}
        defaultValue={defaultValue}
      />
    </div>
  );
}
