"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { callEdge } from "@/lib/supabase/edge";

/**
 * Server-Action proxies to the two superadmin governance functions (ADR 0098
 * rulings 2 and 8). Each function does its own role check, audit and
 * four-eyes; this layer shapes FormData and hands the error text back
 * verbatim. `pending` is the four-eyes half-state: the request is recorded,
 * nothing has changed, and no executor for the second approval exists yet.
 */

export type GovernanceState = { ok?: boolean; pending?: boolean; error?: string };

const VerifySchema = z.object({
  contact_id: z.string().uuid(),
  verification_status: z.enum(["verified", "unverified"]),
  reason: z.string().trim().min(8, "Reason ≥ 8 characters — this write is audited."),
});

export async function verifyContactAction(
  _prev: GovernanceState,
  formData: FormData,
): Promise<GovernanceState> {
  const parsed = VerifySchema.safeParse({
    contact_id: formData.get("contact_id"),
    verification_status: formData.get("verification_status"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const result = await callEdge<{ data?: { awaiting_second_approval?: boolean } }>(
    "sa-verify-emergency-contact",
    parsed.data,
    "admin",
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/emergency");
  return result.data?.data?.awaiting_second_approval ? { pending: true } : { ok: true };
}

const SignSchema = z.object({
  version: z.string().trim().min(1).max(32),
  signoff_artifact_ref: z
    .string()
    .trim()
    .min(8, "Artifact reference ≥ 8 characters — where the signed CSO artifact lives."),
  reason: z.string().trim().min(8, "Reason ≥ 8 characters — this write is audited."),
});

const CHECKSUM_MISMATCH_TEXT =
  "The registered checksum differs from the deployed bundle — run npm run db:seed-symptom-catalog and redeploy";

export async function signCatalogVersionAction(
  _prev: GovernanceState,
  formData: FormData,
): Promise<GovernanceState> {
  const parsed = SignSchema.safeParse({
    version: formData.get("version"),
    signoff_artifact_ref: formData.get("signoff_artifact_ref"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat().find(Boolean);
    return { error: first ?? "Please check the values." };
  }

  const result = await callEdge("sa-sign-catalog-version", parsed.data, "admin");
  if (!result.ok) {
    // 409 checksum_mismatch: the transport flattens the envelope to its message.
    return { error: /checksum/i.test(result.error) ? CHECKSUM_MISMATCH_TEXT : result.error };
  }

  revalidatePath("/admin/emergency");
  return { ok: true };
}
