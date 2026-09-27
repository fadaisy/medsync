"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { callEdge } from "@/lib/supabase/edge";

/**
 * Server Action proxying to ha-set-hospital-emergency-settings (ADR 0098 ruling 5). Since ADR 0158
 * (CAP-5) it sends only the facility's coordinates: the routing values change in Departments &
 * services, where a second admin verifies them, and the function refuses them from here. Absent
 * fields are untouched; the scope is resolved here and the form never sends a hospital_id.
 */

export type EmergencySettingsState = { ok?: boolean; error?: string };

const Schema = z.object({
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
  const parsed = Schema.safeParse({ latitude, longitude, reason: formData.get("reason") });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
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

function numberOrNull(v: FormDataEntryValue | null): number | null | undefined {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/* ─── Outbreak mode (clerking desk v2, D-CV-06) ────────────────────── */

export type OutbreakModeState = { ok?: boolean; error?: string };

const OutbreakSchema = z.object({
  on: z.boolean(),
  reason: z
    .string()
    .trim()
    .min(8, "Give a reason of at least 8 characters — this change is audited."),
});

/** Turns the outbreak VHF screen on or off for this hospital, with an audited reason. */
export async function setOutbreakModeAction(
  _prev: OutbreakModeState,
  formData: FormData,
): Promise<OutbreakModeState> {
  const parsed = OutbreakSchema.safeParse({
    on: formData.get("on") === "true",
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }
  const scope = await requireHospitalAdminScope();
  const { writeOutbreakMode } = await import("@/lib/clerking/outbreak");
  try {
    await writeOutbreakMode({ userId: scope.userId, hospitalId: scope.hospitalId }, parsed.data);
  } catch {
    return {
      error:
        "Couldn't save outbreak mode. It needs migration 0076; try again or tell the superadmin.",
    };
  }
  revalidatePath("/hospital-admin/profile");
  return { ok: true };
}
