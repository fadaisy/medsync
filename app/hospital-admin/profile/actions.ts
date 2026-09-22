"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { callEdge } from "@/lib/supabase/edge";

/**
 * Server Action proxying to ha-set-hospital-emergency-settings (ADR 0098
 * ruling 5; PRD Phase 5 "Hospital admin settings"). The scope is resolved
 * here — the form never sends a hospital_id — and the Edge Function owns the
 * role check, the audit row, the number formats and the ambulance contact.
 * Its error text comes back verbatim.
 *
 * The form always shows every current value, so every field is sent: an
 * emptied field is `null` (cleared), never absent (untouched).
 */

export type EmergencySettingsState = { ok?: boolean; error?: string };

const Schema = z.object({
  emergency_capability: z.enum(["none", "daytime", "24h"]),
  pre_alert_enabled: z.boolean(),
  board_owner_note: z.string().trim().max(240).nullable(),
  emergency_entrance_directions: z.string().trim().max(500).nullable(),
  emergency_sms_number: z.string().trim().max(20).nullable(),
  ambulance_number: z.string().trim().max(20).nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  reason: z.string().trim().min(8, "Audit note ≥ 8 characters — this write is audited."),
});

export async function setEmergencySettingsAction(
  _prev: EmergencySettingsState,
  formData: FormData,
): Promise<EmergencySettingsState> {
  const latitude = numberOrNull(formData.get("latitude"));
  const longitude = numberOrNull(formData.get("longitude"));
  if (latitude === undefined || longitude === undefined) {
    return { error: "Latitude and longitude must be decimal numbers, e.g. 0.3400 and 32.5760." };
  }
  if ((latitude === null) !== (longitude === null)) {
    return { error: "Enter latitude and longitude together, or clear both." };
  }

  const parsed = Schema.safeParse({
    emergency_capability: formData.get("emergency_capability"),
    pre_alert_enabled: formData.get("pre_alert_enabled") === "on",
    board_owner_note: stringOrNull(formData.get("board_owner_note")),
    emergency_entrance_directions: stringOrNull(formData.get("emergency_entrance_directions")),
    emergency_sms_number: stringOrNull(formData.get("emergency_sms_number")),
    ambulance_number: stringOrNull(formData.get("ambulance_number")),
    latitude,
    longitude,
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  if (parsed.data.pre_alert_enabled && !parsed.data.board_owner_note) {
    return {
      error:
        "Name who owns the Incoming board each shift before enabling pre-alerts — a board nobody owns is a board nobody watches.",
    };
  }

  const scope = await requireHospitalAdminScope();
  const result = await callEdge(
    "ha-set-hospital-emergency-settings",
    { hospital_id: scope.hospitalId, ...parsed.data },
    "hospital-admin",
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/hospital-admin/profile");
  return { ok: true };
}

function stringOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Empty → null (clear). Not a number → undefined (refuse). */
function numberOrNull(v: FormDataEntryValue | null): number | null | undefined {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
