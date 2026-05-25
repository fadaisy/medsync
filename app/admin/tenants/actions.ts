"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const ActivateSchema = z.object({
  hospital_id: z.string().uuid(),
  reason: z.string().min(8),
});

export type ActivateState = { ok?: boolean; error?: string };

export async function activateHospitalAction(
  _prev: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  const parsed = ActivateSchema.safeParse({
    hospital_id: formData.get("hospital_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }

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
        reason: parsed.data.reason,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn("admin.activate-hospital.failed", { status: res.status });
      return { error: text || `Edge Function returned ${res.status}.` };
    }
    revalidatePath("/admin/tenants");
    return { ok: true };
  } catch (e) {
    logger.error("admin.activate-hospital.network", { reason: String(e) });
    return { error: "Couldn't reach the activation service." };
  }
}

/* ─── Superadmin-initiated hospital creation (GATE E) ─────────────── */

const CreateHospitalSchema = z.object({
  hospital_name: z.string().min(1).max(160),
  facility_level: z.enum([
    "hc_ii",
    "hc_iii",
    "hc_iv",
    "general",
    "regional_referral",
    "national_referral",
    "private",
    "other",
  ]),
  offline_evidence_path: z.string().min(1).max(500),
  signatory_name: z.string().min(1).max(120),
  signatory_title: z.string().min(1).max(80),
  invitee_email: z.string().email(),
  invitee_name: z.string().max(120).optional(),
  reason: z.string().min(8),
});

export type CreateHospitalState =
  | { ok?: false; error?: string }
  | {
      ok: true;
      hospital_id: string;
      hospital_slug: string;
      invitation_id: string;
      invitation_token: string;
      claim_url: string;
    };

export async function createHospitalAction(
  _prev: CreateHospitalState,
  formData: FormData,
): Promise<CreateHospitalState> {
  const raw = {
    hospital_name: formData.get("hospital_name"),
    facility_level: formData.get("facility_level"),
    offline_evidence_path: formData.get("offline_evidence_path"),
    signatory_name: formData.get("signatory_name"),
    signatory_title: formData.get("signatory_title"),
    invitee_email: formData.get("invitee_email"),
    invitee_name: formData.get("invitee_name") || undefined,
    reason: formData.get("reason"),
  };
  const parsed = CreateHospitalSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    const firstError = Object.values(fe)
      .flat()
      .find((m): m is string => typeof m === "string");
    return { error: firstError ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "Not authenticated." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sa-create-hospital`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn("admin.create-hospital.failed", { status: res.status });
      return { error: text || `Edge Function returned ${res.status}.` };
    }
    const body = (await res.json()) as {
      hospital_id: string;
      hospital_slug: string;
      invitation_id: string;
      invitation_token: string;
    };
    revalidatePath("/admin/tenants");
    // Best-effort origin for the claim URL. Falls back to the
    // production alias; superadmin can edit the URL manually.
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://medsync-six.vercel.app";
    return {
      ok: true,
      hospital_id: body.hospital_id,
      hospital_slug: body.hospital_slug,
      invitation_id: body.invitation_id,
      invitation_token: body.invitation_token,
      claim_url: `${origin}/admin/claim-invitation?token=${encodeURIComponent(body.invitation_token)}`,
    };
  } catch (e) {
    logger.error("admin.create-hospital.network", { reason: String(e) });
    return { error: "Couldn't reach the create-hospital service." };
  }
}
