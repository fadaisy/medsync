"use server";

import { randomBytes } from "node:crypto";
import type { StepState } from "./_lib/rules";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { CHECKLIST } from "@/content/onboarding-setup";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { authoriseHospitalAdmin, UUID_RE } from "./_lib/auth";

/**
 * Setup-checklist server actions (kickoff §F, GATE D; §5.10).
 *
 * Every action runs `authoriseHospitalAdmin` first: signed in, hospital_admin of the target
 * hospital (a superadmin session is refused, ADR 0018 Q3), hospital in `provisioning`.
 *
 * Submissions only — the page renders read state directly from Drizzle. There is no autosave:
 * each task's Save writes its rows and the next render reflects the change. The profile tasks
 * (operating, contacts, location) live in ./checklist-actions.ts; departments, wards, clinics,
 * diagnostics and emergency & support are edited in Departments & services, which the checklist links to.
 */

/* Departments, wards and where you'll start moved to Departments & services (ADR 0150): the
 * checklist links there, and nothing here deletes a department any more (archive, never delete). */

/* ─── Step 3 — Backup admin designation ──────────────────────────── */

const AddBackupAdminSchema = z.object({
  hospital_id: z.string().regex(UUID_RE),
  email: z.string().email("Valid email required."),
});

export async function inviteBackupAdminAction(
  _prev: StepState,
  formData: FormData,
): Promise<StepState> {
  const parsed = AddBackupAdminSchema.safeParse({
    hospital_id: formData.get("hospital_id"),
    email: formData.get("email"),
  });
  if (!parsed.success)
    return { error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Invalid email." };
  const auth = await authoriseHospitalAdmin(parsed.data.hospital_id);
  if ("error" in auth) return { error: auth.error };

  // The plaintext token is shown once, here, for the admin to pass on themselves; only its hash
  // is stored. Claiming it (accept-hospital-admin-invitation: same email + MFA) makes them the
  // backup, because the hospital already has a primary.
  const token = randomBytes(32).toString("base64url");
  const { error } = await auth.service.from("hospital_staff_invitations").insert({
    hospital_id: parsed.data.hospital_id,
    invited_email: parsed.data.email.toLowerCase(),
    invitation_token_hash: await sha256Hex(token),
    invited_by: auth.userId,
    source: "individual",
  });
  if (error) {
    logger.error("setup.invite_backup.failed", { reason: error.message });
    return { error: "Could not create the invitation." };
  }
  revalidatePath("/admin/setup");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://medsync-six.vercel.app";
  return { ok: true, link: `${origin}/admin/claim-invitation?token=${encodeURIComponent(token)}` };
}

/* ─── Step 4 — Staff invitation (individual; bulk stubbed) ───────── */

const InviteStaffSchema = z.object({
  hospital_id: z.string().regex(UUID_RE),
  email: z.string().email(),
  role_id: z.string().regex(UUID_RE).optional(),
});

export async function inviteStaffAction(_prev: StepState, formData: FormData): Promise<StepState> {
  const parsed = InviteStaffSchema.safeParse({
    hospital_id: formData.get("hospital_id"),
    email: formData.get("email"),
    role_id: formData.get("role_id") || undefined,
  });
  if (!parsed.success) return { error: "Valid email required." };
  const auth = await authoriseHospitalAdmin(parsed.data.hospital_id);
  if ("error" in auth) return { error: auth.error };

  const tokenHash = await sha256Hex(crypto.randomUUID() + parsed.data.email);
  const { error } = await auth.service.from("hospital_staff_invitations").insert({
    hospital_id: parsed.data.hospital_id,
    invited_email: parsed.data.email.toLowerCase(),
    invited_role_id: parsed.data.role_id ?? null,
    invitation_token_hash: tokenHash,
    invited_by: auth.userId,
    source: "individual",
  });
  if (error) {
    return { error: "Could not create the invitation." };
  }
  revalidatePath("/admin/setup");
  return { ok: true };
}

/* ─── Step 6 — Go live (calls sa-activate-hospital Edge Function) ──── */

const FinaliseSchema = z.object({
  hospital_id: z.string().regex(UUID_RE),
});

export async function finaliseSetupAction(
  _prev: StepState,
  formData: FormData,
): Promise<StepState> {
  const parsed = FinaliseSchema.safeParse({
    hospital_id: formData.get("hospital_id"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authoriseHospitalAdmin(parsed.data.hospital_id);
  if ("error" in auth) return { error: auth.error };

  // Needed to go live (kickoff §F6, D17): departments with a start department, at least one
  // ward, the primary admin and a backup admin on the roster. The Edge Function checks the DPA.
  const hospitalId = parsed.data.hospital_id;
  // D-SVC-17 / S17: "Departments" is done once a start department is LIVE (set in the hub).
  const [{ count: startCount }, { count: wardCount }, { data: roster }] = await Promise.all([
    auth.service
      .from("hospital_departments")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", hospitalId)
      .eq("is_start", true)
      .not("medsync_live_at", "is", null)
      .is("archived_at", null),
    auth.service
      .from("hospital_wards")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", hospitalId)
      .is("archived_at", null),
    auth.service
      .from("hospital_admin_roster")
      .select("designation")
      .eq("hospital_id", hospitalId)
      .is("succeeded_at", null),
  ]);
  const designations = new Set((roster ?? []).map((r: { designation: string }) => r.designation));
  if ((startCount ?? 0) === 0) return { error: CHECKLIST.departments.startRequired };
  if ((wardCount ?? 0) === 0) return { error: "Add at least one ward first." };
  if (!designations.has("primary")) {
    return { error: "A primary admin must be on the roster (set automatically at approval)." };
  }
  if (!designations.has("backup")) return { error: CHECKLIST.goLive.needsBackup };

  // Activation goes through the existing Edge Function so the agreement
  // gate fires + the audit row is recorded. The setup wizard's job is
  // to gate the call on prerequisites; the Edge Function owns the
  // state flip + agreement check.
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "Not authenticated." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sa-activate-hospital`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        hospital_id: parsed.data.hospital_id,
        reason: "Setup wizard completed by hospital admin.",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn("setup.activate.failed", { status: res.status, text: text.slice(0, 200) });
      // The Edge Function gates by superadmin role today; this call may
      // 403 if the hospital_admin isn't also a superadmin. Surface a
      // clear message so the operator knows to ask a superadmin to
      // complete the activation step until we add a hospital_admin
      // self-activation path (GATE F polish).
      return {
        error:
          "Could not activate. Ask a platform superadmin to call sa-activate-hospital for this hospital — the agreement-gate check will run, and the activation will succeed if everything is in order.",
      };
    }
  } catch (e) {
    logger.error("setup.activate.network", { reason: String(e) });
    return { error: "Network error reaching the activation service." };
  }

  revalidatePath("/admin/setup");
  revalidatePath("/admin");
  redirect("/admin?welcomed=hospital-active");
}

/* ─── Small helpers ──────────────────────────────────────────────── */

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
