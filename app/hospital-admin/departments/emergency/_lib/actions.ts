"use server";

import type { HubResult } from "../../_lib/types";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { callEdge } from "@/lib/supabase/edge";
import { capabilityKey } from "@/supabase/functions/_shared/services-hub";
import { runHubOp } from "../../actions";

/*
 * Emergency and support (ADR 0520 phase 2). Every value goes through ha-services-hub, which keeps the two-admin rule
 * (CAP-5): a routing value is written to pending_* and only a different admin's verify makes it live; the function
 * refuses the author's own verify. The scope always comes from requireHospitalAdminScope(), never the page.
 */

const PATH = "/hospital-admin/departments/emergency";
const reason = z.string().trim().min(8, "Say why in 8 characters or more: this change is audited.");
const key = z
  .string()
  .max(40)
  .refine((k) => {
    const c = capabilityKey(k);
    return !!c && !c.derived && k !== "opd_hours";
  }, "That setting cannot be changed here.");

const done = (r: HubResult): HubResult => {
  if (r.ok) revalidatePath(PATH);
  return r;
};

/** Propose (routing) or save (support) one value; the function checks the value against its type. */
export async function proposeCapabilityAction(input: {
  key: string;
  value: unknown;
  reason: string;
}): Promise<HubResult> {
  const p = z.object({ key, reason }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the change." };
  return done(
    await runHubOp({
      op: "set_capability",
      key: p.data.key,
      value: input.value,
      reason: p.data.reason,
    }),
  );
}

/** A second admin makes a pending value live. The function refuses the admin who proposed it. */
export async function verifyCapabilityAction(input: { key: string }): Promise<HubResult> {
  const p = z.object({ key }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the change." };
  return done(await runHubOp({ op: "verify_capability", key: p.data.key }));
}

/** Drops a pending value; the verified one stays. The reason is required (audited). */
export async function rejectCapabilityAction(input: {
  key: string;
  reason: string;
}): Promise<HubResult> {
  const p = z.object({ key, reason }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the reason." };
  return done(await runHubOp({ op: "reject_capability", key: p.data.key, reason: p.data.reason }));
}

const Location = z
  .object({
    latitude: z.number().min(-2).max(5).nullable(),
    longitude: z.number().min(29).max(36).nullable(),
    reason,
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: "Set latitude and longitude together, or clear both.",
  });

/**
 * The hospital's one map point (`hospitals.latitude/longitude`), through the same function and rule the profile's
 * location form uses: ha-set-hospital-emergency-settings, one admin, audited, coordinates only (it refuses any
 * routing value from here).
 */
export async function setLocationAction(input: z.input<typeof Location>): Promise<HubResult> {
  const p = Location.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the location." };
  const scope = await requireHospitalAdminScope();
  const r = await callEdge(
    "ha-set-hospital-emergency-settings",
    { hospital_id: scope.hospitalId, ...p.data },
    "hospital-admin.emergency.location",
  );
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(PATH);
  revalidatePath("/hospital-admin/profile");
  return { ok: true };
}
