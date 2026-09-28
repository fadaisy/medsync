"use client";

import type { EmergencySettingsState } from "../actions";
import type { EmergencySettings } from "@/lib/emergency/queries";
import Link from "next/link";
import { useActionState } from "react";
import { ArrowUpRightIcon, CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setEmergencySettingsAction } from "../actions";

/**
 * The facility's emergency profile (PRD MS-PRD-SYM-001 §8.3 "Hospital", Phase 5; ADR 0098 ruling 5).
 *
 * ADR 0158 (CAP-5): the values that decide where an emergency goes — receiving hours, pre-alerts and
 * their board owner, entrance directions, the SMS and ambulance numbers — change in Departments &
 * services → Emergency & support, where a second admin verifies them. Here they are shown read-only;
 * the facility's coordinates stay editable. No red anywhere: this is settings, not an emergency.
 */

const CAPABILITY_LABEL: Record<string, string> = {
  none: "No emergency receiving — the sheet lists this hospital as call only",
  daytime: "Daytime — emergency receiving in working hours only",
  "24h": "24 h — emergency receiving around the clock",
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[14rem_1fr]">
      <dt className="text-muted-foreground text-caption">{label}</dt>
      <dd className="text-body-s text-foreground">
        {value || <span className="text-muted-foreground">Not set</span>}
      </dd>
    </div>
  );
}

export function EmergencySettingsForm({ settings }: { settings: EmergencySettings }) {
  const [state, formAction, pending] = useActionState<EmergencySettingsState, FormData>(
    setEmergencySettingsAction,
    {},
  );

  return (
    <div className="flex flex-col gap-6 p-5">
      <section className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2.5">
          <Row
            label="Emergency receiving"
            value={CAPABILITY_LABEL[settings.emergencyCapability] ?? settings.emergencyCapability}
          />
          <Row
            label="Accept pre-alerts"
            value={
              settings.preAlertEnabled
                ? `Yes — board owner: ${settings.boardOwnerNote ?? "—"}`
                : "No"
            }
          />
          <Row label="Emergency entrance directions" value={settings.emergencyEntranceDirections} />
          <Row label="Emergency SMS number" value={settings.emergencySmsNumber} />
          <Row label="Ambulance number" value={settings.ambulanceNumber} />
        </dl>
        <p className="text-muted-foreground text-caption max-w-2xl">
          These decide where an emergency goes, so a change needs a second admin to verify it before
          it reaches patients.
        </p>
        <Link
          href="/hospital-admin/departments/emergency"
          className="text-body-s inline-flex items-center gap-1 self-start font-medium text-teal-700 hover:underline dark:text-teal-400"
        >
          Change in Departments &amp; services <ArrowUpRightIcon className="size-3.5" aria-hidden />
        </Link>
      </section>

      <form action={formAction} className="border-border flex flex-col gap-5 border-t pt-5">
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
            Until both are set, &ldquo;nearest&rdquo; on the Emergency sheet orders hospitals by
            name, not by distance.
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
          <p role="alert" className="dark:text-status-caution-fg text-body-s text-amber-800">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="text-foreground text-body-s inline-flex items-center gap-2">
            <CheckIcon className="size-4 shrink-0" aria-hidden />
            Coordinates saved.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save coordinates"}
          </Button>
        </div>
      </form>
    </div>
  );
}
