"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Setup-wizard server actions (kickoff §F, GATE D).
 *
 * Every action enforces:
 *   1. caller is signed in
 *   2. caller is a hospital_admin of the target hospital
 *   3. target hospital is in `provisioning` (the wizard's permitted window)
 *
 * Submissions only — the wizard renders read state directly from
 * Drizzle on the page. There is no autosave: each step's confirm
 * button writes its rows and the next render reflects the change.
 *
 * Per ADR 0018 Q3: the wizard does NOT accept a superadmin session.
 * Even though superadmin can SELECT every hospital, the wizard
 * actions reject without a hospital_admin grant on the target
 * hospital. Pre-fill in the data is fine; submission is not.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function authoriseHospitalAdmin(
  hospitalId: string,
): Promise<
  { userId: string; service: ReturnType<typeof createServiceClient> } | { error: string }
> {
  if (!UUID_RE.test(hospitalId)) return { error: "Invalid hospital id." };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not signed in." };
  const service = createServiceClient();
  const { data: roles } = await service
    .from("user_roles")
    .select("role,hospital_id")
    .eq("user_id", userData.user.id);
  const isAdmin = !!roles?.some((r) => r.role === "hospital_admin" && r.hospital_id === hospitalId);
  if (!isAdmin) return { error: "Not a hospital admin for this hospital." };

  // Confirm hospital is in provisioning.
  const { data: hospital } = await service
    .from("hospitals")
    .select("state")
    .eq("id", hospitalId)
    .maybeSingle();
  if (!hospital) return { error: "Hospital not found." };
  if (hospital.state !== "provisioning") {
    return {
      error: `Hospital is in '${hospital.state}'; setup is only available in provisioning.`,
    };
  }
  return { userId: userData.user.id, service };
}

/* ─── Step 1 — Confirm departments ───────────────────────────────── */

const ConfirmDepartmentsSchema = z.object({
  hospital_id: z.string().regex(UUID_RE),
  /** Department family codes the admin confirmed are actually running. */
  departments: z.array(z.string().min(1).max(120)).min(1),
});

export type StepState = { ok?: true; error?: string };

export async function confirmDepartmentsAction(
  _prev: StepState,
  formData: FormData,
): Promise<StepState> {
  const parsed = ConfirmDepartmentsSchema.safeParse({
    hospital_id: formData.get("hospital_id"),
    departments: formData.getAll("departments").filter((v): v is string => typeof v === "string"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.departments?.[0] ?? "Invalid input." };
  }

  const auth = await authoriseHospitalAdmin(parsed.data.hospital_id);
  if ("error" in auth) return { error: auth.error };

  // For each confirmed code, ensure a row exists in hospital_departments
  // (the per-hospital catalog). Code becomes the slug; name is humanised.
  const rows = parsed.data.departments.map((code) => ({
    hospital_id: parsed.data.hospital_id,
    name: humanise(code),
    slug: code.toLowerCase(),
  }));

  const { error } = await auth.service
    .from("hospital_departments")
    .upsert(rows, { onConflict: "hospital_id,parent_id,slug" });
  if (error) {
    logger.error("setup.confirm_departments.failed", { reason: error.message });
    return { error: "Could not save departments. Try again." };
  }
  revalidatePath("/admin/setup");
  return { ok: true };
}

function humanise(code: string): string {
  return code
    .toLowerCase()
    .split(/[_-]/)
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
}

/* ─── Step 2 — Wards & capacity ──────────────────────────────────── */

const AddWardSchema = z.object({
  hospital_id: z.string().regex(UUID_RE),
  name: z.string().min(1, "Name required.").max(120),
  bed_count: z.coerce.number().int().min(0).max(2000),
});

export async function addWardAction(_prev: StepState, formData: FormData): Promise<StepState> {
  const parsed = AddWardSchema.safeParse({
    hospital_id: formData.get("hospital_id"),
    name: formData.get("name"),
    bed_count: formData.get("bed_count"),
  });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return { error: fe.name?.[0] ?? fe.bed_count?.[0] ?? "Invalid input." };
  }
  const auth = await authoriseHospitalAdmin(parsed.data.hospital_id);
  if ("error" in auth) return { error: auth.error };

  const slug = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  const { error } = await auth.service.from("hospital_wards").insert({
    hospital_id: parsed.data.hospital_id,
    name: parsed.data.name,
    slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
    bed_count: parsed.data.bed_count,
  });
  if (error) {
    logger.error("setup.add_ward.failed", { reason: error.message });
    return { error: "Could not save the ward." };
  }
  revalidatePath("/admin/setup");
  return { ok: true };
}

const RemoveWardSchema = z.object({
  hospital_id: z.string().regex(UUID_RE),
  ward_id: z.string().regex(UUID_RE),
});

export async function removeWardAction(_prev: StepState, formData: FormData): Promise<StepState> {
  const parsed = RemoveWardSchema.safeParse({
    hospital_id: formData.get("hospital_id"),
    ward_id: formData.get("ward_id"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authoriseHospitalAdmin(parsed.data.hospital_id);
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.service
    .from("hospital_wards")
    .delete()
    .eq("id", parsed.data.ward_id)
    .eq("hospital_id", parsed.data.hospital_id);
  if (error) return { error: "Could not remove the ward." };
  revalidatePath("/admin/setup");
  return { ok: true };
}

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

  // Write an invitation row. The actual email-out + acceptance flow is
  // GATE E; for now this records intent so the wizard can show the
  // pending invitation and the admin succession trail starts.
  const tokenHash = await sha256Hex(crypto.randomUUID() + parsed.data.email);
  const { error } = await auth.service.from("hospital_staff_invitations").insert({
    hospital_id: parsed.data.hospital_id,
    invited_email: parsed.data.email.toLowerCase(),
    invitation_token_hash: tokenHash,
    invited_by: auth.userId,
    source: "individual",
  });
  if (error) {
    logger.error("setup.invite_backup.failed", { reason: error.message });
    return { error: "Could not create the invitation." };
  }
  revalidatePath("/admin/setup");
  return { ok: true };
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

  // Essential-steps check (kickoff §F6): departments + at least one
  // ward + a primary admin in the roster.
  const [{ count: deptCount }, { count: wardCount }, { count: rosterCount }] = await Promise.all([
    auth.service
      .from("hospital_departments")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", parsed.data.hospital_id),
    auth.service
      .from("hospital_wards")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", parsed.data.hospital_id),
    auth.service
      .from("hospital_admin_roster")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", parsed.data.hospital_id)
      .is("succeeded_at", null)
      .eq("designation", "primary"),
  ]);
  if ((deptCount ?? 0) === 0) return { error: "Confirm at least one department first." };
  if ((wardCount ?? 0) === 0) return { error: "Add at least one ward first." };
  if ((rosterCount ?? 0) === 0) {
    return { error: "A primary admin must be on the roster (set automatically at approval)." };
  }

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
