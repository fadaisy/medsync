"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import {
  assertScopeOwnsHospital,
  requireHospitalAdminScope,
  ScopeViolationError,
} from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions proxying to the hospital-admin staff Edge Functions.
 *
 * Every action follows the integration contract:
 *   1. Resolve scope server-side (no client-passed hospital_id is trusted).
 *   2. Forward to the Edge Function with the caller's JWT.
 *   3. Revalidate the staff route on success.
 *   4. Return a typed { ok | error } envelope; never throw to the form.
 *
 * The actual mutation + audit + role-check + scope-check all happen
 * inside the Edge Function. These actions exist so the admin UI never
 * does a client-side fetch with the access token in JS — the JWT
 * stays cookie-bound and is forwarded server-side.
 */

const ReasonArgs = z.object({
  affiliation_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

const NoteArgs = z.object({
  affiliation_id: z.string().uuid(),
  note: z.string().min(8, "Note ≥ 8 chars required."),
});

export type StaffActionState = { ok?: boolean; error?: string };

async function callEdgeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "Not authenticated." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = await res.text();
      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string } | string };
        if (typeof parsed.error === "string") detail = parsed.error;
        else if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        // body wasn't JSON; use raw text
      }
      logger.warn(`hospital-admin.staff.${name}.failed`, { status: res.status });
      return { ok: false, error: detail || `Edge Function returned ${res.status}.` };
    }
    return { ok: true };
  } catch (e) {
    logger.error(`hospital-admin.staff.${name}.network`, { reason: String(e) });
    return {
      ok: false,
      error: `Couldn't reach the ${name} service. If you're in local dev, run: npx supabase functions deploy ${name}`,
    };
  }
}

/* ─── Approve / Reject / Request-info ───────────────────────────────── */

export async function approveStaffAffiliationAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const parsed = ReasonArgs.safeParse({
    affiliation_id: formData.get("affiliation_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }

  await guardScope(parsed.data.affiliation_id);

  const result = await callEdgeFunction("approve-staff-affiliation", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/hospital-admin/staff");
  revalidatePath("/hospital-admin");
  return { ok: true };
}

export async function rejectStaffAffiliationAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const parsed = ReasonArgs.safeParse({
    affiliation_id: formData.get("affiliation_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }

  await guardScope(parsed.data.affiliation_id);

  const result = await callEdgeFunction("reject-staff-affiliation", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/hospital-admin/staff");
  revalidatePath("/hospital-admin");
  return { ok: true };
}

export async function requestStaffInfoAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const parsed = NoteArgs.safeParse({
    affiliation_id: formData.get("affiliation_id"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.note?.[0] ?? "Invalid input." };
  }

  await guardScope(parsed.data.affiliation_id);

  const result = await callEdgeFunction("ha-request-staff-info", parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/hospital-admin/staff");
  return { ok: true };
}

/* ─── Per-affiliation safety net ───────────────────────────────────── */

/**
 * Before forwarding to the Edge Function, confirm that the targeted
 * affiliation actually belongs to the current admin's hospital.
 *
 * The Edge Function ALSO does this (defence in depth), but doing it
 * here means a misbehaving client gets a clean 403 from us instead of
 * a "service returned an error" round-trip. Throws ScopeViolationError
 * — Next swallows it and returns to the form with a generic message,
 * so we don't leak the existence of the targeted row.
 */
async function guardScope(affiliationId: string): Promise<void> {
  const scope = await requireHospitalAdminScope();
  const supabase = await createClient();
  const { data: aff } = await supabase
    .from("staff_affiliations")
    .select("hospital_id")
    .eq("id", affiliationId)
    .maybeSingle();
  if (!aff) {
    throw new ScopeViolationError("Affiliation does not exist for this admin's scope.");
  }
  assertScopeOwnsHospital(scope, aff.hospital_id as string);
}
