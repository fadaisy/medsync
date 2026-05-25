/**
 * Hospital agreement gate — ensures a hospital has an unsuperseded
 * row in `public.hospital_agreements` before any Edge Function
 * transitions the hospital to `active`.
 *
 * Per ADR 0017: the gate is enforced server-side (EXISTS check), NOT
 * via FK or CHECK. This module is the single place that check lives;
 * every activation-path Edge Function imports `requireCurrentAgreement`
 * and calls it before flipping state.
 *
 * Both onboarding paths run through this check:
 *   - applicant_flow: agreement row is written by approve-hospital-
 *     application from the application's §E7 metadata BEFORE the hospital
 *     ever has a chance to reach `active`.
 *   - superadmin_offline: agreement row is written by sa-record-offline-
 *     agreement (GATE E) BEFORE the hospital can be activated.
 *
 * Returns `{ ok: true }` when an unsuperseded agreement exists,
 * otherwise `{ ok: false, reason }`. Callers turn `ok: false` into
 * the user-facing error ("Hospital has no current agreement…").
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AgreementGateResult =
  | { ok: true; agreementId: string; dpaVersionId: string }
  | { ok: false; reason: string };

export async function requireCurrentAgreement(
  sb: SupabaseClient,
  hospitalId: string,
): Promise<AgreementGateResult> {
  // Service-role client bypasses RLS; the read is unfiltered intentionally.
  const { data, error } = await sb
    .from("hospital_agreements")
    .select("id, dpa_version_id, signed_at, superseded_by")
    .eq("hospital_id", hospitalId)
    .is("superseded_by", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: `Agreement gate check failed: ${error.message}`,
    };
  }
  if (!data) {
    return {
      ok: false,
      reason:
        "Hospital has no current Data-Processing Agreement on file. Record the signed agreement before activating.",
    };
  }
  return { ok: true, agreementId: data.id, dpaVersionId: data.dpa_version_id };
}
