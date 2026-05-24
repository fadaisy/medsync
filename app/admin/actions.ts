"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Server-Action proxies to the GATE F approval Edge Functions.
 *
 * These exist so the admin UI doesn't need a client-side `fetch` with
 * the access token in JS. The Server Action runs server-side, pulls
 * the JWT from the cookie-bound session, and forwards it as a Bearer
 * token to the Edge Function — which then performs its own
 * authentication + authorization with the verified token.
 *
 * Edge Function URL pattern: `<SUPABASE_URL>/functions/v1/<name>`.
 * If the Edge Function is not deployed locally (common in dev), the
 * Action returns a typed error rather than throwing so the admin UI
 * can surface "deploy the Edge Function" guidance to the developer.
 */

const ReviewArgsSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

export type ReviewState = {
  ok?: boolean;
  error?: string;
};

async function callEdgeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "Not authenticated." };

  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`;
  try {
    const res = await fetch(url, {
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
        const parsed = JSON.parse(detail) as { error?: string };
        detail = parsed.error ?? detail;
      } catch {
        // body wasn't JSON; use the raw text
      }
      logger.warn(`admin.edge.${name}.failed`, { status: res.status });
      return { ok: false, error: detail || `Edge Function returned ${res.status}.` };
    }
    return { ok: true };
  } catch (e) {
    logger.error(`admin.edge.${name}.network`, { reason: String(e) });
    return {
      ok: false,
      error:
        "Couldn't reach the approval service. If you're in local dev, deploy the Edge Function (supabase functions deploy " +
        name +
        ").",
    };
  }
}

/* ─── Staff affiliations ──────────────────────────────────────────────── */

export async function approveStaffAffiliationAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const parsed = ReviewArgsSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  const result = await callEdgeFunction("approve-staff-affiliation", {
    affiliation_id: parsed.data.id,
    reason: parsed.data.reason,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectStaffAffiliationAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const parsed = ReviewArgsSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  const result = await callEdgeFunction("reject-staff-affiliation", {
    affiliation_id: parsed.data.id,
    reason: parsed.data.reason,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { ok: true };
}

/* ─── Hospital applications ───────────────────────────────────────────── */

export async function approveHospitalApplicationAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const parsed = ReviewArgsSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  const result = await callEdgeFunction("approve-hospital-application", {
    application_id: parsed.data.id,
    reason: parsed.data.reason,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectHospitalApplicationAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const parsed = ReviewArgsSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  const result = await callEdgeFunction("reject-hospital-application", {
    application_id: parsed.data.id,
    reason: parsed.data.reason,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { ok: true };
}

/* ─── Signed URLs for evidence documents (GATE B) ────────────────────────
 *
 * Generates a short-lived signed URL for a private Storage object so an
 * admin can open the actual licence / authorisation document during a
 * review without granting them long-lived bucket access.
 *
 * Auth check: caller must be a superadmin (this surface only exists in
 * /admin which is already AAL2-gated, but defence in depth never hurts).
 * The Storage object's RLS still applies — service-role here bypasses
 * RLS for the signed-URL generation step itself; downstream readers
 * use the URL directly.
 */
const SignedUrlInputSchema = z.object({
  bucket: z.enum(["clinician-licences", "hospital-authorisations"]),
  path: z.string().min(1).max(500),
});

export type SignedUrlState = { ok: true; url: string } | { ok: false; error: string };

export async function getEvidenceSignedUrlAction(
  _prev: SignedUrlState,
  formData: FormData,
): Promise<SignedUrlState> {
  const parsed = SignedUrlInputSchema.safeParse({
    bucket: formData.get("bucket"),
    path: formData.get("path"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not authenticated." };

  const service = createServiceClient();
  // Verify the caller is an admin role with reason to see this bucket.
  // Clinician licences: superadmin OR any hospital_admin (matches the
  // bucket's own RLS policy from migration 0016).
  const { data: rolesData } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const roles = (rolesData ?? []).map((r) => r.role);
  if (!roles.includes("superadmin") && !roles.includes("hospital_admin")) {
    return { ok: false, error: "Forbidden." };
  }

  const { data, error } = await service.storage
    .from(parsed.data.bucket)
    .createSignedUrl(parsed.data.path, 300); // 5 minutes
  if (error || !data?.signedUrl) {
    logger.warn("admin.signed_url.failed", { reason: error?.message });
    return { ok: false, error: "Couldn't generate a viewer link." };
  }
  return { ok: true, url: data.signedUrl };
}
