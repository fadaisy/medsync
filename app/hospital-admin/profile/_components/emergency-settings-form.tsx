"use client";

import type { EmergencySettingsState } from "../actions";
import type { EmergencySettings } from "@/lib/emergency/queries";
import { useActionState, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { setEmergencySettingsAction } from "../actions";

/**
 * The facility's emergency profile (PRD MS-PRD-SYM-001 §8.3 "Hospital",
 * Phase 5; ADR 0098 ruling 5). Every field is what a patient or a desk will
 * read from it, so each carries the sentence that says where it shows up.
 * No red anywhere: this is settings, not an emergency.
 */

const CAPABILITIES = [
  {
    value: "none",
    label: "None",
    hint: "No emergency receiving. The sheet lists this hospital as call only.",
  },
  { value: "daytime", label: "Daytime", hint: "Emergency receiving in working hours only." },
  { value: "24h", label: "24 h", hint: "Emergency receiving around the clock." },
] as const;

const TEXTAREA_CLASS =
  "border-input bg-card text-foreground text-body-s ease-expo-out w-full min-w-0 rounded-sm border px-2.5 py-2 transition-all duration-150 outline-none focus-visible:border-brand-500 focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.15)]";

export function EmergencySettingsForm({ settings }: { settings: EmergencySettings }) {
  const [state, formAction, pending] = useActionState<EmergencySettingsState, FormData>(
    setEmergencySettingsAction,
    {},
  );
  const [capability, setCapability] = useState<string>(settings.emergencyCapability);
  const [preAlert, setPreAlert] = useState(settings.preAlertEnabled);

  return (
    <form action={formAction} className="flex flex-col gap-5 p-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-caption text-foreground mb-1.5 font-medium tracking-tight">
          Emergency receiving
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {CAPABILITIES.map((c) => {
            const checked = capability === c.value;
            return (
              <label
                key={c.value}
                className={cn(
                  "text-body-s ease-expo-out flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-150",
                  "focus-within:border-brand-500",
                  checked
                    ? "border-brand-300 bg-accent"
                    : "border-input bg-background hover:border-gray-300",
                )}
              >
                <input
                  type="radio"
                  name="emergency_capability"
                  value={c.value}
                  checked={checked}
                  onChange={() => setCapability(c.value)}
                  className="accent-brand-600 mt-0.5 size-4"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-foreground font-medium">{c.label}</span>
                  <span className="text-muted-foreground text-caption leading-relaxed">
                    {c.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <label className="text-body-s flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="pre_alert_enabled"
            checked={preAlert}
            onChange={(e) => setPreAlert(e.target.checked)}
            className="accent-brand-600 mt-0.5 size-4"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-foreground font-medium">Accept pre-alerts</span>
            <span className="text-muted-foreground text-caption leading-relaxed">
              Patients and bystanders can tell the desk they are on their way. Each alert lands on
              the reception Incoming board and needs a person to acknowledge it.
            </span>
          </span>
        </label>

        {preAlert ? (
          <div className="flex flex-col gap-1.5 pl-7">
            <Label htmlFor="board_owner_note" className="text-caption tracking-tight">
              Board owner per shift
            </Label>
            <Input
              id="board_owner_note"
              name="board_owner_note"
              required
              minLength={3}
              maxLength={240}
              defaultValue={settings.boardOwnerNote ?? ""}
              placeholder="e.g. Day: reception lead. Night: the triage nurse on duty."
            />
            <span className="text-muted-foreground text-caption">
              A board nobody owns is a board nobody watches.
            </span>
          </div>
        ) : (
          <input type="hidden" name="board_owner_note" value={settings.boardOwnerNote ?? ""} />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="emergency_entrance_directions" className="text-caption tracking-tight">
          Emergency entrance directions
        </Label>
        <textarea
          id="emergency_entrance_directions"
          name="emergency_entrance_directions"
          rows={3}
          maxLength={500}
          defaultValue={settings.emergencyEntranceDirections ?? ""}
          placeholder="e.g. Use the gate on Kitante Road; the emergency entrance is the first door on the left."
          className={TEXTAREA_CLASS}
        />
        <span className="text-muted-foreground text-caption">
          What the patient&rsquo;s status screen prints once an alert is sent.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="emergency_sms_number" className="text-caption tracking-tight">
            Emergency SMS number
          </Label>
          <Input
            id="emergency_sms_number"
            name="emergency_sms_number"
            type="tel"
            inputMode="tel"
            defaultValue={settings.emergencySmsNumber ?? ""}
            placeholder="+256XXXXXXXXX"
          />
          <span className="text-muted-foreground text-caption">
            The offline fallback: a patient with no data can text the alert here from their own SIM.
            Leave empty and no SMS option is shown.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ambulance_number" className="text-caption tracking-tight">
            Ambulance number
          </Label>
          <Input
            id="ambulance_number"
            name="ambulance_number"
            type="tel"
            inputMode="tel"
            defaultValue={settings.ambulanceNumber ?? ""}
            placeholder="+256XXXXXXXXX or 0800XXXXXX"
          />
          <span className="text-muted-foreground text-caption">
            Enters the emergency contacts as unverified until a superadmin verifies it.
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="latitude" className="text-caption tracking-tight">
            Latitude (optional)
          </Label>
          <Input
            id="latitude"
            name="latitude"
            type="number"
            inputMode="decimal"
            step="any"
            min={-2}
            max={5}
            defaultValue={settings.latitude ?? ""}
            placeholder="0.3400"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="longitude" className="text-caption tracking-tight">
            Longitude (optional)
          </Label>
          <Input
            id="longitude"
            name="longitude"
            type="number"
            inputMode="decimal"
            step="any"
            min={29}
            max={36}
            defaultValue={settings.longitude ?? ""}
            placeholder="32.5760"
          />
        </div>
        <span className="text-muted-foreground text-caption sm:col-span-2">
          Until both are set, &ldquo;nearest&rdquo; on the Emergency sheet orders hospitals by name,
          not by distance.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason" className="text-caption tracking-tight">
          Audit note
        </Label>
        <Input
          id="reason"
          name="reason"
          minLength={8}
          required
          placeholder="Why this change — at least 8 characters"
        />
        <span className="text-muted-foreground text-caption">Goes to the audit log.</span>
      </div>

      {state.error ? (
        <p role="alert" className="text-status-caution-fg text-body-s">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p
          role="status"
          className="text-status-stable-fg text-body-s inline-flex items-center gap-2"
        >
          <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
          Emergency settings saved.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save emergency settings"}
        </Button>
      </div>
    </form>
  );
}
