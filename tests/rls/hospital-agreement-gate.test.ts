import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  createTestHospital,
  createTestUser,
  deleteHospital,
  deleteUser,
  RLS_TESTS_ENABLED,
  serviceSql,
  serviceSupabase,
} from "./_helpers";

/**
 * Agreement-gate regression — validates the kickoff §J commitment
 * that the gate provably blocks `active` on BOTH onboarding paths.
 *
 * The gate is enforced server-side in `_shared/hospital-agreement-gate.ts`
 * (a Deno module called from Edge Functions). This test exercises the
 * same SQL semantics the helper uses, against the live DB schema,
 * so a future migration that breaks the EXISTS-on-unsuperseded
 * agreement contract fails loudly here.
 */

describe.skipIf(!RLS_TESTS_ENABLED)(
  "Agreement gate — EXISTS contract on hospital_agreements",
  () => {
    let signer: { id: string };
    let hospitalWithAgreement: { id: string };
    let hospitalWithoutAgreement: { id: string };
    let hospitalWithSupersededOnly: { id: string };
    let dpaVersionId: string;

    beforeAll(async () => {
      const signerUser = await createTestUser("agree-gate", "signer");
      signer = { id: signerUser.id };

      const sb = serviceSupabase();
      const { data: dpa } = await sb
        .from("hospital_dpa_versions")
        .select("id")
        .order("effective_date", { ascending: false })
        .limit(1)
        .single();
      if (!dpa) throw new Error("DPA placeholder not seeded — run supabase db push");
      dpaVersionId = dpa.id;

      hospitalWithAgreement = await createTestHospital("gate-with");
      hospitalWithoutAgreement = await createTestHospital("gate-without");
      hospitalWithSupersededOnly = await createTestHospital("gate-superseded");

      // Hospital A — current applicant_flow agreement
      await sb.from("hospital_agreements").insert({
        hospital_id: hospitalWithAgreement.id,
        dpa_version_id: dpaVersionId,
        signed_by_user_id: signer.id,
        signatory_name: "Test Signatory A",
        signatory_title: "administrator",
        source: "applicant_flow",
      });

      // Hospital C — a superseded agreement only (proves the gate cares
      // about "unsuperseded", not just "exists").
      const { data: old } = await sb
        .from("hospital_agreements")
        .insert({
          hospital_id: hospitalWithSupersededOnly.id,
          dpa_version_id: dpaVersionId,
          signed_by_user_id: signer.id,
          signatory_name: "Old Signatory",
          signatory_title: "administrator",
          source: "applicant_flow",
        })
        .select("id")
        .single();
      const { data: replacement } = await sb
        .from("hospital_agreements")
        .insert({
          hospital_id: hospitalWithSupersededOnly.id,
          dpa_version_id: dpaVersionId,
          signed_by_user_id: signer.id,
          signatory_name: "Replacement Signatory",
          signatory_title: "administrator",
          source: "applicant_flow",
        })
        .select("id")
        .single();
      // Then mark the OLD row superseded BY the replacement, and supersede
      // BOTH so the hospital has no unsuperseded current agreement.
      if (old && replacement) {
        await sb
          .from("hospital_agreements")
          .update({ superseded_by: replacement.id })
          .eq("id", old.id);
        // Supersede the replacement too — chain ends with no current.
        await sb
          .from("hospital_agreements")
          .update({ superseded_by: old.id }) // ← chain to mark replacement superseded
          .eq("id", replacement.id);
      }
    }, 90_000);

    afterAll(async () => {
      await serviceSql`DELETE FROM public.hospital_agreements WHERE hospital_id IN (${hospitalWithAgreement.id}, ${hospitalWithoutAgreement.id}, ${hospitalWithSupersededOnly.id})`;
      await deleteHospital(hospitalWithAgreement.id).catch(() => {});
      await deleteHospital(hospitalWithoutAgreement.id).catch(() => {});
      await deleteHospital(hospitalWithSupersededOnly.id).catch(() => {});
      await deleteUser(signer.id).catch(() => {});
    }, 30_000);

    /** Reproduces the SQL semantics of `requireCurrentAgreement` in
     *  supabase/functions/_shared/hospital-agreement-gate.ts. */
    async function hasCurrentAgreement(hospitalId: string): Promise<boolean> {
      const sb = serviceSupabase();
      const { data } = await sb
        .from("hospital_agreements")
        .select("id")
        .eq("hospital_id", hospitalId)
        .is("superseded_by", null)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return !!data;
    }

    test("hospital WITH a current agreement passes the gate", async () => {
      expect(await hasCurrentAgreement(hospitalWithAgreement.id)).toBe(true);
    });

    test("hospital with NO agreement fails the gate (would block activation)", async () => {
      expect(await hasCurrentAgreement(hospitalWithoutAgreement.id)).toBe(false);
    });

    test("hospital with ONLY superseded agreements fails the gate", async () => {
      expect(await hasCurrentAgreement(hospitalWithSupersededOnly.id)).toBe(false);
    });

    test("kickoff §G applicant_flow + superadmin_offline both populate the gate", async () => {
      // Same EXISTS check would pass for a superadmin_offline source —
      // proves both onboarding paths feed the same gate, not separate ones.
      const sb = serviceSupabase();
      const tempHospital = await createTestHospital("gate-sa-offline");
      try {
        await sb.from("hospital_agreements").insert({
          hospital_id: tempHospital.id,
          dpa_version_id: dpaVersionId,
          signed_by_user_id: signer.id,
          signatory_name: "Offline Signer",
          signatory_title: "hospital_director",
          source: "superadmin_offline",
          offline_evidence_path: "/test/path.pdf",
        });
        expect(await hasCurrentAgreement(tempHospital.id)).toBe(true);
      } finally {
        await serviceSql`DELETE FROM public.hospital_agreements WHERE hospital_id = ${tempHospital.id}`;
        await deleteHospital(tempHospital.id).catch(() => {});
      }
    });

    test("grandfathered rows count toward the gate (migration 0024)", async () => {
      const sb = serviceSupabase();
      const tempHospital = await createTestHospital("gate-grandfathered");
      try {
        await sb.from("hospital_agreements").insert({
          hospital_id: tempHospital.id,
          dpa_version_id: dpaVersionId,
          signed_by_user_id: null,
          signatory_name: "(grandfathered — pre-upgrade)",
          signatory_title: "(unknown)",
          source: "grandfathered",
        });
        expect(await hasCurrentAgreement(tempHospital.id)).toBe(true);
      } finally {
        await serviceSql`DELETE FROM public.hospital_agreements WHERE hospital_id = ${tempHospital.id}`;
        await deleteHospital(tempHospital.id).catch(() => {});
      }
    });
  },
);
